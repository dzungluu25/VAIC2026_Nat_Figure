from __future__ import annotations

import hashlib
import json
import platform
import random
from dataclasses import asdict
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import torch
from torch.utils.data import DataLoader

from .calibration import fit_calibration
from .config import FEATURES, TRAIN, TrainConfig
from .data import CreditDataset, temporal_split, validate_training_frame
from .losses import multitask_loss
from .metrics import binary_metrics, fairness_report
from .model import GovernedCreditNet
from .preprocessing import CreditPreprocessor
from .source_registry import load_and_validate_source_registry


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.use_deterministic_algorithms(True, warn_only=True)


@torch.no_grad()
def collect_outputs(
    model: GovernedCreditNet, loader: DataLoader[dict[str, torch.Tensor]], device: torch.device
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    model.eval()
    logits, probabilities, targets, lgd = [], [], [], []
    for batch in loader:
        output = model(batch["numeric"].to(device), batch["categorical"].to(device))
        logits.append(output.hazard_logits.cpu().numpy())
        probabilities.append(output.cumulative_pd.cpu().numpy())
        targets.append(batch["target"].numpy())
        lgd.append(output.lgd.cpu().numpy())
    return map(np.concatenate, (logits, probabilities, targets, lgd))  # type: ignore[return-value]


def train_model(data_path: Path, output_dir: Path, config: TrainConfig = TRAIN) -> dict[str, Any]:
    set_seed(config.seed)
    frame = pd.read_csv(data_path)
    validate_training_frame(frame)
    splits = temporal_split(frame, config.validation_months, config.calibration_months, config.test_months)
    preprocessor = CreditPreprocessor(FEATURES).fit(splits.train)
    train_dataset = CreditDataset(splits.train, preprocessor)
    validation_dataset = CreditDataset(splits.validation, preprocessor)
    calibration_dataset = CreditDataset(splits.calibration, preprocessor)
    test_dataset = CreditDataset(splits.test, preprocessor)
    generator = torch.Generator().manual_seed(config.seed)
    train_loader = DataLoader(train_dataset, batch_size=config.batch_size, shuffle=True, generator=generator)
    validation_loader = DataLoader(validation_dataset, batch_size=config.batch_size, shuffle=False)
    calibration_loader = DataLoader(calibration_dataset, batch_size=config.batch_size, shuffle=False)
    test_loader = DataLoader(test_dataset, batch_size=config.batch_size, shuffle=False)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = GovernedCreditNet(FEATURES, config, preprocessor.category_cardinalities).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=config.learning_rate, weight_decay=config.weight_decay)
    best_state: dict[str, torch.Tensor] | None = None
    best_brier = float("inf")
    stale_epochs = 0
    history: list[dict[str, float]] = []
    for epoch in range(config.epochs):
        model.train()
        epoch_loss = 0.0
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
            epoch_loss += float(loss.detach()) * len(batch["numeric"])

        _, validation_pd, validation_target, _ = collect_outputs(model, validation_loader, device)
        brier = float(np.mean((validation_pd[:, -1] - validation_target[:, -1]) ** 2))
        history.append({"epoch": float(epoch + 1), "train_loss": epoch_loss / len(train_dataset), "val_brier": brier})
        if brier < best_brier - 1e-5:
            best_brier = brier
            best_state = {key: value.detach().cpu().clone() for key, value in model.state_dict().items()}
            stale_epochs = 0
        else:
            stale_epochs += 1
            if stale_epochs >= config.patience:
                break

    if best_state is None:
        raise RuntimeError("Training did not produce a checkpoint")
    model.load_state_dict(best_state)
    calibration_logits, _, calibration_target, _ = collect_outputs(model, calibration_loader, device)
    calibration = fit_calibration(calibration_logits, calibration_target)
    test_logits, _, test_target, test_lgd = collect_outputs(model, test_loader, device)
    calibrated_test_pd = calibration.apply_logits(test_logits)

    test_metrics = {
        f"pd_{horizon}m": binary_metrics(test_target[:, index], calibrated_test_pd[:, index])
        for index, horizon in enumerate(config.horizons_months)
    }
    default_mask = test_target[:, -1] > 0.5
    test_metrics["lgd_mae_on_defaults"] = (
        float(np.mean(np.abs(test_lgd[default_mask] - splits.test.loc[default_mask, "lgd_if_default"])))
        if default_mask.any()
        else None
    )
    test_metrics["fairness_gender"] = fairness_report(
        test_target[:, -1], calibrated_test_pd[:, -1], splits.test["gender"].astype(str).to_numpy(), threshold=0.08
    )

    output_dir.mkdir(parents=True, exist_ok=True)
    weights_path = output_dir / "model.pt"
    torch.save(best_state, weights_path)
    preprocessor.save(output_dir / "preprocessor.json")
    calibration.save(output_dir / "calibration.json")
    data_hash = hashlib.sha256(data_path.read_bytes()).hexdigest()
    registry_path = Path(__file__).parents[1] / "governance" / "official_sources.json"
    registry, registry_hash = load_and_validate_source_registry(registry_path)
    metadata = {
        "model_family": "GovernedCreditNet",
        "model_version": f"gcn-{data_hash[:10]}-{config.seed}",
        "data_sha256": data_hash,
        "synthetic_data": bool(frame.get("is_synthetic", pd.Series(False)).all()),
        "feature_config": FEATURES.to_dict(),
        "train_config": {**asdict(config), "horizons_months": list(config.horizons_months)},
        "split": {
            "train": len(splits.train),
            "validation": len(splits.validation),
            "calibration": len(splits.calibration),
            "test": len(splits.test),
        },
        "best_validation_brier": best_brier,
        "history": history,
        "test_metrics": test_metrics,
        "deployment_status": "DEMO_ONLY" if bool(frame.get("is_synthetic", pd.Series(False)).all()) else "VALIDATION_REQUIRED",
        "runtime": {
            "python": platform.python_version(),
            "torch": torch.__version__,
            "numpy": np.__version__,
            "pandas": pd.__version__,
        },
        "official_source_registry": {
            "registry_version": registry["registry_version"],
            "verified_on": registry["verified_on"],
            "sha256": registry_hash,
            "path": "governance/official_sources.json",
        },
    }
    (output_dir / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    return metadata
