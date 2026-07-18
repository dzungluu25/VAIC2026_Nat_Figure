from __future__ import annotations

from typing import Any

import numpy as np
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score


def expected_calibration_error(target: np.ndarray, probability: np.ndarray, bins: int = 10) -> float:
    edges = np.linspace(0.0, 1.0, bins + 1)
    total = len(target)
    error = 0.0
    for lower, upper in zip(edges[:-1], edges[1:]):
        mask = (probability >= lower) & (probability < upper if upper < 1.0 else probability <= upper)
        if mask.any():
            error += mask.sum() / total * abs(float(target[mask].mean() - probability[mask].mean()))
    return float(error)


def ks_statistic(target: np.ndarray, probability: np.ndarray) -> float:
    order = np.argsort(probability)
    sorted_target = target[order]
    positives = max(float(sorted_target.sum()), 1.0)
    negatives = max(float((1.0 - sorted_target).sum()), 1.0)
    positive_cdf = np.cumsum(sorted_target) / positives
    negative_cdf = np.cumsum(1.0 - sorted_target) / negatives
    return float(np.max(np.abs(positive_cdf - negative_cdf)))


def binary_metrics(target: np.ndarray, probability: np.ndarray) -> dict[str, float]:
    return {
        "auroc": float(roc_auc_score(target, probability)),
        "average_precision": float(average_precision_score(target, probability)),
        "brier": float(brier_score_loss(target, probability)),
        "ece_10": expected_calibration_error(target, probability),
        "ks": ks_statistic(target, probability),
    }


def fairness_report(target: np.ndarray, probability: np.ndarray, group: np.ndarray, threshold: float) -> dict[str, Any]:
    prediction = probability >= threshold
    by_group: dict[str, dict[str, float | int]] = {}
    for value in np.unique(group):
        mask = group == value
        positives = target[mask] == 1
        negatives = ~positives
        by_group[str(value)] = {
            "count": int(mask.sum()),
            "mean_pd": float(probability[mask].mean()),
            "tpr": float(prediction[mask][positives].mean()) if positives.any() else float("nan"),
            "fpr": float(prediction[mask][negatives].mean()) if negatives.any() else float("nan"),
        }
    tprs = [float(item["tpr"]) for item in by_group.values() if np.isfinite(item["tpr"])]
    fprs = [float(item["fpr"]) for item in by_group.values() if np.isfinite(item["fpr"])]
    return {
        "threshold": threshold,
        "by_group": by_group,
        "max_tpr_gap": max(tprs) - min(tprs) if len(tprs) >= 2 else 0.0,
        "max_fpr_gap": max(fprs) - min(fprs) if len(fprs) >= 2 else 0.0,
        "note": "Fairness metrics are validation gates, not proof of legal fairness.",
    }

