from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import torch
from torch.nn import functional as F


@dataclass
class CalibrationBundle:
    temperatures: list[float]
    conformal_residual_quantile: float

    def apply_logits(self, logits: np.ndarray) -> np.ndarray:
        scaled = logits / np.asarray(self.temperatures, dtype=np.float64)[None, :]
        hazards = 1.0 / (1.0 + np.exp(-np.clip(scaled, -40.0, 40.0)))
        return 1.0 - np.cumprod(1.0 - hazards, axis=1)

    def upper_pd12(self, pd12: np.ndarray, epistemic_std: np.ndarray | float = 0.0) -> np.ndarray:
        return np.clip(pd12 + self.conformal_residual_quantile + 1.645 * epistemic_std, 0.0, 1.0)

    def save(self, path: Path) -> None:
        path.write_text(json.dumps(self.__dict__, indent=2), encoding="utf-8")

    @classmethod
    def load(cls, path: Path) -> "CalibrationBundle":
        return cls(**json.loads(path.read_text(encoding="utf-8")))


def fit_calibration(logits: np.ndarray, cumulative_targets: np.ndarray, alpha: float = 0.10) -> CalibrationBundle:
    temperatures: list[float] = []
    for index in range(logits.shape[1]):
        logit = torch.tensor(logits[:, index], dtype=torch.float64)
        # Interval target and at-risk population for each conditional hazard.
        if index == 0:
            mask = np.ones(len(logits), dtype=bool)
            target = cumulative_targets[:, 0]
        else:
            mask = cumulative_targets[:, index - 1] < 0.5
            target = cumulative_targets[:, index] - cumulative_targets[:, index - 1]
        selected_logit = logit[torch.tensor(mask)]
        selected_target = torch.tensor(target[mask], dtype=torch.float64)
        raw_temperature = torch.tensor(0.0, dtype=torch.float64, requires_grad=True)
        optimizer = torch.optim.LBFGS([raw_temperature], lr=0.2, max_iter=60)

        def closure() -> torch.Tensor:
            optimizer.zero_grad()
            temperature = F.softplus(raw_temperature) + 0.05
            loss = F.binary_cross_entropy_with_logits(selected_logit / temperature, selected_target)
            loss.backward()
            return loss

        optimizer.step(closure)
        temperatures.append(float((F.softplus(raw_temperature) + 0.05).detach()))

    provisional = CalibrationBundle(temperatures, 0.0)
    calibrated_pd12 = provisional.apply_logits(logits)[:, -1]
    residuals = np.abs(cumulative_targets[:, -1] - calibrated_pd12)
    quantile_level = min(1.0, np.ceil((len(residuals) + 1) * (1.0 - alpha)) / len(residuals))
    residual_quantile = float(np.quantile(residuals, quantile_level, method="higher"))
    return CalibrationBundle(temperatures, residual_quantile)

