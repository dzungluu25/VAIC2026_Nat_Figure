from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import torch

from .calibration import CalibrationBundle
from .config import FEATURES, TrainConfig
from .model import GovernedCreditNet
from .preprocessing import CreditPreprocessor


REASON_LABELS = {
    "income_volatility_6m": "HIGH_INCOME_VOLATILITY",
    "cic_dpd_12m_max": "RECENT_DELINQUENCY",
    "cic_inquiries_6m": "MANY_RECENT_INQUIRIES",
    "credit_utilization": "HIGH_CREDIT_UTILIZATION",
    "current_dti": "HIGH_CURRENT_DTI",
    "requested_ltv": "HIGH_REQUESTED_LTV",
    "stress_dti": "HIGH_STRESS_DTI",
    "monthly_income_vnd": "LOW_VERIFIED_INCOME",
    "employment_tenure_months": "SHORT_EMPLOYMENT_TENURE",
    "bureau_history_months": "THIN_BUREAU_HISTORY",
    "bank_relationship_months": "SHORT_BANK_RELATIONSHIP",
    "transaction_cashflow_coverage": "LOW_CASHFLOW_COVERAGE",
}


class RiskPredictor:
    def __init__(self, artifact_dir: Path):
        self.artifact_dir = artifact_dir
        self.metadata = json.loads((artifact_dir / "metadata.json").read_text(encoding="utf-8"))
        raw_config = self.metadata["train_config"]
        raw_config["horizons_months"] = tuple(raw_config["horizons_months"])
        self.train_config = TrainConfig(**raw_config)
        self.preprocessor = CreditPreprocessor.load(artifact_dir / "preprocessor.json", FEATURES)
        self.calibration = CalibrationBundle.load(artifact_dir / "calibration.json")
        self.model = GovernedCreditNet(
            FEATURES, self.train_config, self.preprocessor.category_cardinalities
        )
        state = torch.load(artifact_dir / "model.pt", map_location="cpu", weights_only=True)
        self.model.load_state_dict(state)
        self.model.eval()

    def predict(self, records: list[dict[str, Any]], mc_samples: int = 20) -> list[dict[str, Any]]:
        frame = pd.DataFrame(records)
        encoded = self.preprocessor.transform(frame)
        numeric = torch.from_numpy(encoded.numeric)
        categorical = torch.from_numpy(encoded.categorical)
        sample_pd, sample_lgd = [], []

        # Dropout at inference estimates epistemic uncertainty. A production model
        # should prefer a 3-5 seed deep ensemble when latency permits.
        self.model.train(mode=mc_samples > 1)
        with torch.inference_mode():
            for _ in range(mc_samples):
                output = self.model(numeric, categorical)
                calibrated = self.calibration.apply_logits(output.hazard_logits.numpy())
                sample_pd.append(calibrated)
                sample_lgd.append(output.lgd.numpy())
            contributions = self.model.monotonic_contributions(numeric).numpy()
        self.model.eval()

        pd_samples = np.stack(sample_pd)
        lgd_samples = np.stack(sample_lgd)
        mean_pd = pd_samples.mean(axis=0)
        pd12_std = pd_samples[:, :, -1].std(axis=0)
        mean_lgd = lgd_samples.mean(axis=0)
        upper_pd12 = self.calibration.upper_pd12(mean_pd[:, -1], pd12_std)
        ood_scores = self.preprocessor.ood_score(frame)

        results = []
        for row in range(len(frame)):
            ranked = np.argsort(contributions[row])[::-1]
            reasons = []
            for index in ranked:
                if contributions[row, index] <= 0:
                    continue
                label = REASON_LABELS.get(FEATURES.numeric[index])
                if label and label not in reasons:
                    reasons.append(label)
                if len(reasons) == 4:
                    break
            results.append(
                {
                    "model_version": self.metadata["model_version"],
                    "deployment_status": self.metadata["deployment_status"],
                    "model_role": self.metadata.get("tuning", {}).get("role", "UNASSESSED"),
                    "selected_technical_champion": self.metadata.get("tuning", {}).get(
                        "selected_technical_champion", self.metadata["model_family"]
                    ),
                    "pd": mean_pd[row].tolist(),
                    "pd12_upper": float(upper_pd12[row]),
                    "pd12_epistemic_std": float(pd12_std[row]),
                    "lgd": float(mean_lgd[row]),
                    "expected_loss_rate": float(mean_pd[row, -1] * mean_lgd[row]),
                    "ood_score": float(ood_scores[row]),
                    "reason_codes": reasons or ["NO_DOMINANT_ADVERSE_MONOTONIC_FACTOR"],
                }
            )
        return results
