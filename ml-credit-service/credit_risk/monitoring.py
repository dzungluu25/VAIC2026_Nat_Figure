from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from .config import FeatureConfig
from .metrics import binary_metrics


def population_stability_index(reference: pd.Series, current: pd.Series, bins: int = 10) -> float:
    reference_values = pd.to_numeric(reference, errors="coerce").dropna().to_numpy()
    current_values = pd.to_numeric(current, errors="coerce").dropna().to_numpy()
    if len(reference_values) == 0 or len(current_values) == 0:
        return float("nan")
    edges = np.unique(np.quantile(reference_values, np.linspace(0.0, 1.0, bins + 1)))
    if len(edges) < 3:
        return 0.0
    edges[0], edges[-1] = -np.inf, np.inf
    expected = np.histogram(reference_values, bins=edges)[0] / len(reference_values)
    actual = np.histogram(current_values, bins=edges)[0] / len(current_values)
    expected = np.clip(expected, 1e-6, None)
    actual = np.clip(actual, 1e-6, None)
    return float(np.sum((actual - expected) * np.log(actual / expected)))


def drift_report(reference: pd.DataFrame, current: pd.DataFrame, config: FeatureConfig) -> dict[str, Any]:
    numeric_psi = {
        name: population_stability_index(reference[name], current[name]) for name in config.numeric
    }
    unseen_categories = {}
    for name in config.categorical:
        known = set(reference[name].dropna().astype(str))
        current_values = current[name].fillna("__MISSING__").astype(str)
        unseen_categories[name] = float((~current_values.isin(known)).mean())
    high_drift = [name for name, value in numeric_psi.items() if np.isfinite(value) and value >= 0.25]
    return {
        "numeric_psi": numeric_psi,
        "unseen_category_rate": unseen_categories,
        "high_drift_features": high_drift,
        "routing": "FREEZE_AUTO_USE_AND_REVIEW" if high_drift else "CONTINUE_MONITORING",
    }


def delayed_outcome_report(scored: pd.DataFrame) -> dict[str, Any]:
    required = {"pd12", "default_12m"}
    if not required.issubset(scored.columns):
        raise ValueError(f"Delayed outcome report requires {sorted(required)}")
    metrics = binary_metrics(scored["default_12m"].to_numpy(), scored["pd12"].to_numpy())
    observed_rate = float(scored["default_12m"].mean())
    predicted_rate = float(scored["pd12"].mean())
    calibration_ratio = observed_rate / max(predicted_rate, 1e-8)
    return {
        **metrics,
        "observed_default_rate": observed_rate,
        "predicted_default_rate": predicted_rate,
        "calibration_ratio": calibration_ratio,
        "alert": calibration_ratio > 1.25 or metrics["brier"] > 0.12 or metrics["ece_10"] > 0.04,
    }

