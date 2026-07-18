from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, RobustScaler

from .config import FeatureConfig
from .data import TemporalSplit
from .metrics import binary_metrics, fairness_report


def _selection_weight(frame: pd.DataFrame) -> np.ndarray:
    propensity = frame.get("acceptance_probability", pd.Series(1.0, index=frame.index))
    return np.clip(1.0 / propensity.to_numpy(np.float64), 1.0, 5.0)


def scorecard_logistic_baseline(splits: TemporalSplit, features: FeatureConfig) -> dict[str, Any]:
    """Transparent challenger baseline evaluated once on the untouched test window."""
    numeric_pipeline = Pipeline(
        [("imputer", SimpleImputer(strategy="median")), ("scale", RobustScaler())]
    )
    categorical_pipeline = Pipeline(
        [
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("one_hot", OneHotEncoder(handle_unknown="ignore")),
        ]
    )
    transform = ColumnTransformer(
        [
            ("numeric", numeric_pipeline, list(features.numeric)),
            ("categorical", categorical_pipeline, list(features.categorical)),
        ]
    )
    pipeline = Pipeline(
        [
            ("features", transform),
            ("model", LogisticRegression(max_iter=2_000, C=0.5, solver="lbfgs")),
        ]
    )
    pipeline.fit(
        splits.train,
        splits.train["default_12m"].to_numpy(),
        model__sample_weight=_selection_weight(splits.train),
    )

    calibration_score = pipeline.decision_function(splits.calibration).reshape(-1, 1)
    calibrator = LogisticRegression(C=1e6, solver="lbfgs", max_iter=1_000)
    calibrator.fit(calibration_score, splits.calibration["default_12m"].to_numpy())
    test_score = pipeline.decision_function(splits.test).reshape(-1, 1)
    probability = calibrator.predict_proba(test_score)[:, 1]
    target = splits.test["default_12m"].to_numpy()
    return {
        "model": "logistic_scorecard_challenger",
        "features": "same governed feature set; one-hot categories",
        "test_pd12": binary_metrics(target, probability),
        "fairness_gender": fairness_report(
            target, probability, splits.test["gender"].astype(str).to_numpy(), threshold=0.08
        ),
        "purpose": "mandatory transparent baseline; not a regulatory scorecard",
    }
