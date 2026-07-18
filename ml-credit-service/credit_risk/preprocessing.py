from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from .config import FeatureConfig


@dataclass
class EncodedBatch:
    numeric: np.ndarray
    categorical: np.ndarray


class CreditPreprocessor:
    """Train-only fitted, JSON-serializable preprocessing.

    Numeric features use robust median/IQR scaling. Missingness is explicit through
    imputation; production data quality gates should reject excessive missing data.
    Unknown categories always map to index 0.
    """

    def __init__(self, config: FeatureConfig):
        self.config = config
        self.medians: dict[str, float] = {}
        self.scales: dict[str, float] = {}
        self.vocabularies: dict[str, dict[str, int]] = {}

    def fit(self, frame: pd.DataFrame) -> "CreditPreprocessor":
        self._reject_prohibited(frame)
        for name in self.config.numeric:
            values = pd.to_numeric(frame[name], errors="coerce")
            median = float(values.median())
            q1, q3 = values.quantile([0.25, 0.75])
            scale = float(q3 - q1)
            self.medians[name] = median if np.isfinite(median) else 0.0
            self.scales[name] = scale if np.isfinite(scale) and scale > 1e-8 else 1.0
        for name in self.config.categorical:
            categories = sorted(frame[name].fillna("__MISSING__").astype(str).unique())
            self.vocabularies[name] = {value: index + 1 for index, value in enumerate(categories)}
        return self

    @property
    def category_cardinalities(self) -> list[int]:
        return [len(self.vocabularies[name]) + 1 for name in self.config.categorical]

    def transform(self, frame: pd.DataFrame) -> EncodedBatch:
        self._ensure_fitted()
        self._reject_prohibited(frame)
        missing = (set(self.config.numeric) | set(self.config.categorical)) - set(frame.columns)
        if missing:
            raise ValueError(f"Missing model features: {sorted(missing)}")

        numeric_columns = []
        for name in self.config.numeric:
            values = pd.to_numeric(frame[name], errors="coerce").fillna(self.medians[name])
            numeric_columns.append(((values - self.medians[name]) / self.scales[name]).to_numpy(np.float32))
        categorical_columns = []
        for name in self.config.categorical:
            vocabulary = self.vocabularies[name]
            values = frame[name].fillna("__MISSING__").astype(str)
            categorical_columns.append(values.map(lambda value: vocabulary.get(value, 0)).to_numpy(np.int64))
        return EncodedBatch(
            numeric=np.stack(numeric_columns, axis=1),
            categorical=np.stack(categorical_columns, axis=1),
        )

    def ood_score(self, frame: pd.DataFrame) -> np.ndarray:
        encoded = self.transform(frame)
        robust_distance = np.max(np.abs(encoded.numeric), axis=1)
        unknown_count = (encoded.categorical == 0).sum(axis=1)
        return robust_distance + unknown_count.astype(np.float32) * 2.0

    def save(self, path: Path) -> None:
        path.write_text(
            json.dumps(
                {
                    "feature_config": self.config.to_dict(),
                    "medians": self.medians,
                    "scales": self.scales,
                    "vocabularies": self.vocabularies,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

    @classmethod
    def load(cls, path: Path, config: FeatureConfig) -> "CreditPreprocessor":
        payload = json.loads(path.read_text(encoding="utf-8"))
        instance = cls(config)
        instance.medians = {key: float(value) for key, value in payload["medians"].items()}
        instance.scales = {key: float(value) for key, value in payload["scales"].items()}
        instance.vocabularies = payload["vocabularies"]
        return instance

    def _reject_prohibited(self, frame: pd.DataFrame) -> None:
        present = sorted(set(frame.columns) & set(self.config.prohibited))
        if present:
            raise ValueError(f"Prohibited features must not enter the model pipeline: {present}")

    def _ensure_fitted(self) -> None:
        if not self.medians or not self.vocabularies:
            raise RuntimeError("Preprocessor must be fitted before transform")

