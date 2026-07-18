from __future__ import annotations

import json
from dataclasses import asdict, replace
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import torch
from sklearn.metrics import average_precision_score, roc_auc_score
from torch.utils.data import DataLoader

from .baseline import scorecard_logistic_baseline
from .config import FEATURES, TRAIN, TrainConfig
from .data import CreditDataset, temporal_split, validate_training_frame
from .losses import multitask_loss
from .metrics import fairness_report
from .model import GovernedCreditNet
from .preprocessing import CreditPreprocessor
from .source_registry import load_and_validate_source_registry
from .training import collect_outputs, set_seed, train_model


def default_search_space() -> list[TrainConfig]:
    # Bounded, auditable search. Add trials by review, not an unbounded optimizer.
    return [
        replace(TRAIN, seed=2026, hidden_dim=64, embedding_dim=8, dropout=0.10, learning_rate=8e-4),
        replace(TRAIN, seed=2027, hidden_dim=96, embedding_dim=8, dropout=0.12, learning_rate=6e-4),
        replace(TRAIN, seed=2028, hidden_dim=128, embedding_dim=12, dropout=0.15, learning_rate=5e-4),
        replace(TRAIN, seed=2029, hidden_dim=96, embedding_dim=12, dropout=0.20, learning_rate=8e-4),
        replace(TRAIN, seed=2030, hidden_dim=64, embedding_dim=12, dropout=0.08, learning_rate=1.1e-3),
        replace(TRAIN, seed=2031, hidden_dim=128, embedding_dim=8, dropout=0.22, learning_rate=7e-4),
    ]


def _fit_and_score_development(
    config: TrainConfig,
    train_dataset: CreditDataset,
    validation_dataset: CreditDataset,
    category_cardinalities: list[int],
) -> dict[str, Any]:
    set_seed(config.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    generator = torch.Generator().manual_seed(config.seed)
    train_loader = DataLoader(
        train_dataset, batch_size=config.batch_size, shuffle=True, generator=generator
    )
    validation_loader = DataLoader(validation_dataset, batch_size=config.batch_size, shuffle=False)
    model = GovernedCreditNet(FEATURES, config, category_cardinalities).to(device)
    optimizer = torch.optim.AdamW(
        model.parameters(), lr=config.learning_rate, weight_decay=config.weight_decay
    )
    best_brier = float("inf")
    best_state: dict[str, torch.Tensor] | None = None
    best_epoch = 0
    stale = 0
    for epoch in range(config.epochs):
        model.train()
        for batch in train_loader:
            optimizer.zero_grad(set_to_none=True)
            output = model(batch["numeric"].to(device), batch["categorical"].to(device))
            loss, _ = multitask_loss(
                output,
                batch["target"].to(device),
                batch["lgd"].to(device),
                batch["observed"].to(device),
                batch["weight"].to(device),
                batch["group"].to(device),
                config.fairness_lambda,
                None,
            )
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), config.gradient_clip)
            optimizer.step()
        _, pd_values, targets, _ = collect_outputs(model, validation_loader, device)
        brier = float(np.mean((pd_values[:, -1] - targets[:, -1]) ** 2))
        if brier < best_brier - 1e-5:
            best_brier = brier
            best_epoch = epoch + 1
            best_state = {key: value.detach().cpu().clone() for key, value in model.state_dict().items()}
            stale = 0
        else:
            stale += 1
            if stale >= config.patience:
                break
    if best_state is None:
        raise RuntimeError("Tuning trial did not produce a checkpoint")
    model.load_state_dict(best_state)
    _, pd_values, targets, _ = collect_outputs(model, validation_loader, device)
    pd12, target12 = pd_values[:, -1], targets[:, -1]
    fairness = fairness_report(
        target12.numpy() if hasattr(target12, "numpy") else target12,
        pd12.numpy() if hasattr(pd12, "numpy") else pd12,
        validation_dataset.group.numpy().astype(str),
        threshold=0.08,
    )
    auroc = float(roc_auc_score(target12, pd12))
    average_precision = float(average_precision_score(target12, pd12))
    fairness_gap = float(fairness["max_tpr_gap"])
    # Lower is better. Calibration dominates because a bank consumes probabilities,
    # not only ranking; discrimination and subgroup stability remain explicit.
    objective = best_brier + 0.15 * (1.0 - auroc) + 0.05 * (1.0 - average_precision) + 0.05 * fairness_gap
    return {
        "config": {**asdict(config), "horizons_months": list(config.horizons_months)},
        "best_epoch": best_epoch,
        "development": {
            "brier_pd12_uncalibrated": best_brier,
            "auroc_pd12": auroc,
            "average_precision_pd12": average_precision,
            "fairness_tpr_gap": fairness_gap,
        },
        "objective": objective,
        "gate_pass": bool(np.isfinite(objective) and fairness_gap <= 0.10),
    }


def tune_model(
    data_path: Path,
    output_dir: Path,
    max_trials: int | None = None,
) -> dict[str, Any]:
    frame = pd.read_csv(data_path)
    validate_training_frame(frame)
    splits = temporal_split(
        frame, TRAIN.validation_months, TRAIN.calibration_months, TRAIN.test_months
    )
    preprocessor = CreditPreprocessor(FEATURES).fit(splits.train)
    train_dataset = CreditDataset(splits.train, preprocessor)
    validation_dataset = CreditDataset(splits.validation, preprocessor)
    search_space = default_search_space()
    if max_trials is not None:
        search_space = search_space[:max_trials]
    if not search_space:
        raise ValueError("At least one tuning trial is required")

    trials = [
        _fit_and_score_development(
            config, train_dataset, validation_dataset, preprocessor.category_cardinalities
        )
        for config in search_space
    ]
    eligible = [trial for trial in trials if trial["gate_pass"]]
    if not eligible:
        raise RuntimeError("No tuning trial passed the development safety gates")
    winner = min(eligible, key=lambda trial: trial["objective"])
    winner_payload = dict(winner["config"])
    winner_payload["horizons_months"] = tuple(winner_payload["horizons_months"])
    winner_config = TrainConfig(**winner_payload)

    champion_dir = output_dir / "champion"
    metadata = train_model(data_path, champion_dir, winner_config)
    baseline = scorecard_logistic_baseline(splits, FEATURES)
    neural = metadata["test_metrics"]["pd_12m"]
    scorecard = baseline["test_pd12"]
    gate_checks = {
        "auroc_not_materially_worse_than_baseline": neural["auroc"] >= scorecard["auroc"] - 0.01,
        "brier_not_materially_worse_than_baseline": neural["brier"] <= scorecard["brier"] * 1.05,
        "ece_within_demo_tolerance": neural["ece_10"] <= 0.05,
        "gender_tpr_gap_within_demo_tolerance": metadata["test_metrics"]["fairness_gender"]["max_tpr_gap"] <= 0.10,
        "baseline_gender_tpr_gap_within_demo_tolerance": baseline["fairness_gender"]["max_tpr_gap"] <= 0.10,
        "synthetic_artifact_cannot_auto_promote": metadata["deployment_status"] == "DEMO_ONLY",
    }
    registry_path = Path(__file__).parents[1] / "governance" / "official_sources.json"
    registry, registry_hash = load_and_validate_source_registry(registry_path)
    technical_gate_passed = all(gate_checks.values())
    selected = "GovernedCreditNet" if technical_gate_passed else baseline["model"]
    report = {
        "selection_protocol": "hyperparameters see development only; calibration and test are untouched until winner selection",
        "objective": "brier + 0.15*(1-auroc) + 0.05*(1-average_precision) + 0.05*TPR-gap",
        "trials": trials,
        "winner": winner,
        "transparent_baseline": baseline,
        "technical_gate": {"checks": gate_checks, "passed": technical_gate_passed},
        "selected_technical_champion": selected,
        "pytorch_role": "TECHNICAL_CHAMPION" if technical_gate_passed else "CHALLENGER",
        "serving_warning": "No demo model may replace a bank-approved champion. The selected baseline is an experimental benchmark until independently validated.",
        "official_source_registry": {
            "registry_version": registry["registry_version"],
            "verified_on": registry["verified_on"],
            "sha256": registry_hash,
            "path": "governance/official_sources.json",
        },
        "production_claim": "PROHIBITED: synthetic benchmark only; independent bank validation is required",
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "tuning_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    metadata["tuning"] = {
        "report": "../tuning_report.json",
        "trial_count": len(trials),
        "winner_objective": winner["objective"],
        "technical_gate": report["technical_gate"],
        "transparent_baseline": baseline,
        "role": report["pytorch_role"],
        "selected_technical_champion": selected,
    }
    metadata["official_source_registry"] = report["official_source_registry"]
    (champion_dir / "metadata.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return report
