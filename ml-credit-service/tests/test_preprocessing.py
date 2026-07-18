from __future__ import annotations

import pandas as pd
import pytest

from credit_risk.config import FEATURES
from credit_risk.data import validate_training_frame
from credit_risk.preprocessing import CreditPreprocessor


def valid_frame() -> pd.DataFrame:
    payload = {name: [1.0, 2.0] for name in FEATURES.numeric}
    payload.update({name: ["a", "b"] for name in FEATURES.categorical})
    return pd.DataFrame(payload)


def test_prohibited_feature_is_rejected() -> None:
    frame = valid_frame()
    frame["gender"] = ["female", "male"]  # audit-only is allowed but never encoded
    preprocessor = CreditPreprocessor(FEATURES).fit(frame)
    assert preprocessor.transform(frame).numeric.shape == (2, len(FEATURES.numeric))

    frame["cccd"] = ["x", "y"]
    with pytest.raises(ValueError, match="Prohibited"):
        preprocessor.transform(frame)


def test_unknown_category_maps_to_zero() -> None:
    frame = valid_frame()
    preprocessor = CreditPreprocessor(FEATURES).fit(frame)
    unknown = frame.iloc[[0]].copy()
    unknown[FEATURES.categorical[0]] = "never_seen"
    assert preprocessor.transform(unknown).categorical[0, 0] == 0


def test_invalid_cumulative_targets_are_rejected() -> None:
    frame = pd.DataFrame(
        {
            "application_id": ["a"],
            "customer_id": ["c"],
            "application_date": ["2026-01-01"],
            "default_3m": [1],
            "default_6m": [0],
            "default_12m": [1],
            "observed_3m": [1],
            "observed_6m": [1],
            "observed_12m": [1],
            "lgd_if_default": [0.4],
        }
    )
    with pytest.raises(ValueError, match="Cumulative"):
        validate_training_frame(frame)
