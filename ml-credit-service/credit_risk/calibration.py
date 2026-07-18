from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import torch
from torch.nn import functional as F


@dataclass
class CalibrationBundle:
    hazard_scales: list[float]
    hazard_biases: list[float]
    pd12_bin_upper_bounds: list[float]
    pd12_reliability_upper: list[float]

    def apply_logits(self, logits: np.ndarray) -> np.ndarray:
        calibrated = (
            logits * np.asarray(self.hazard_scales, dtype=np.float64)[None, :]
            + np.asarray(self.hazard_biases, dtype=np.float64)[None, :]
        )
        hazards = 1.0 / (1.0 + np.exp(-np.clip(calibrated, -40.0, 40.0)))
        return 1.0 - np.cumprod(1.0 - hazards, axis=1)

    def upper_pd12(self, pd12: np.ndarray, epistemic_std: np.ndarray | float = 0.0) -> np.ndarray:
        values = np.asarray(pd12)
        indices = np.searchsorted(np.asarray(self.pd12_bin_upper_bounds), values, side="left")
        indices = np.clip(indices, 0, len(self.pd12_reliability_upper) - 1)
        reliability_upper = np.asarray(self.pd12_reliability_upper)[indices]
        return np.clip(np.maximum(values, reliability_upper) + 1.645 * epistemic_std, 0.0, 1.0)

    def save(self, path: Path) -> None:
        path.write_text(json.dumps(self.__dict__, indent=2), encoding="utf-8")

    @classmethod
    def load(cls, path: Path) -> "CalibrationBundle":
        return cls(**json.loads(path.read_text(encoding="utf-8")))


def fit_calibration(logits: np.ndarray, cumulative_targets: np.ndarray) -> CalibrationBundle:
    hazard_scales: list[float] = []
    hazard_biases: list[float] = []
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
        raw_scale = torch.tensor(0.0, dtype=torch.float64, requires_grad=True)
        bias = torch.tensor(0.0, dtype=torch.float64, requires_grad=True)
        optimizer = torch.optim.LBFGS([raw_scale, bias], lr=0.2, max_iter=80)

        def closure() -> torch.Tensor:
            optimizer.zero_grad()
            scale = F.softplus(raw_scale) + 1e-4
            loss = F.binary_cross_entropy_with_logits(selected_logit * scale + bias, selected_target)
            loss.backward()
            return loss

        optimizer.step(closure)
        hazard_scales.append(float((F.softplus(raw_scale) + 1e-4).detach()))
        hazard_biases.append(float(bias.detach()))

    provisional = CalibrationBundle(hazard_scales, hazard_biases, [1.0], [1.0])
    calibrated_pd12 = provisional.apply_logits(logits)[:, -1]
    # Individual conformal sets for rare binary outcomes are often trivially wide.
    # Instead build an out-of-time reliability envelope: in equal-frequency bins,
    # compare mean prediction with a one-sided 95% Wilson upper bad-rate bound.
    order = np.argsort(calibrated_pd12)
    bin_upper_bounds = []
    reliability_upper = []
    z = 1.645
    for indices in np.array_split(order, min(10, max(1, len(order) // 50))):
        if len(indices) < 30:
            continue
        observed = float(cumulative_targets[indices, -1].mean())
        predicted = float(calibrated_pd12[indices].mean())
        denominator = 1.0 + z * z / len(indices)
        centre = (observed + z * z / (2.0 * len(indices))) / denominator
        radius = z * np.sqrt(
            observed * (1.0 - observed) / len(indices) + z * z / (4.0 * len(indices) ** 2)
        ) / denominator
        bin_upper_bounds.append(float(calibrated_pd12[indices].max()))
        reliability_upper.append(max(predicted, float(centre + radius)))
    if not bin_upper_bounds:
        bin_upper_bounds, reliability_upper = [1.0], [1.0]
    else:
        bin_upper_bounds[-1] = 1.0
        reliability_upper = np.maximum.accumulate(reliability_upper).tolist()
    return CalibrationBundle(hazard_scales, hazard_biases, bin_upper_bounds, reliability_upper)
