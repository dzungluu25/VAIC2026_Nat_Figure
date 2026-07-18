from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset

from .preprocessing import CreditPreprocessor


TARGET_COLUMNS = ("default_3m", "default_6m", "default_12m")
OBSERVATION_COLUMNS = ("observed_3m", "observed_6m", "observed_12m")


def validate_training_frame(frame: pd.DataFrame) -> None:
    required = {
        "application_id",
        "customer_id",
        "application_date",
        "lgd_if_default",
        *TARGET_COLUMNS,
        *OBSERVATION_COLUMNS,
    }
    missing = required - set(frame.columns)
    if missing:
        raise ValueError(f"Training data is missing required columns: {sorted(missing)}")
    if frame["application_id"].duplicated().any():
        raise ValueError("application_id must be unique")
    targets = frame[list(TARGET_COLUMNS)]
    observed = frame[list(OBSERVATION_COLUMNS)]
    if not targets.isin([0, 1]).all().all() or not observed.isin([0, 1]).all().all():
        raise ValueError("Default targets and observation masks must be binary")
    if ((targets.iloc[:, 0] > targets.iloc[:, 1]) | (targets.iloc[:, 1] > targets.iloc[:, 2])).any():
        raise ValueError("Cumulative default labels must satisfy default_3m <= default_6m <= default_12m")
    if ((observed.iloc[:, 0] < observed.iloc[:, 1]) | (observed.iloc[:, 1] < observed.iloc[:, 2])).any():
        raise ValueError("Observation masks must satisfy observed_3m >= observed_6m >= observed_12m")


class CreditDataset(Dataset[dict[str, torch.Tensor]]):
    def __init__(self, frame: pd.DataFrame, preprocessor: CreditPreprocessor):
        encoded = preprocessor.transform(frame)
        self.numeric = torch.from_numpy(encoded.numeric)
        self.categorical = torch.from_numpy(encoded.categorical)
        self.target = torch.tensor(frame[list(TARGET_COLUMNS)].to_numpy(np.float32))
        self.observed = torch.tensor(frame[list(OBSERVATION_COLUMNS)].to_numpy(np.float32))
        self.lgd = torch.tensor(frame["lgd_if_default"].fillna(0.0).to_numpy(np.float32))
        propensity = frame.get("acceptance_probability", pd.Series(1.0, index=frame.index))
        # Reject-inference correction is bounded to avoid explosive variance.
        self.weight = torch.tensor(np.clip(1.0 / propensity.to_numpy(np.float32), 1.0, 5.0))
        groups = pd.Categorical(frame.get("gender", pd.Series("unknown", index=frame.index)))
        self.group = torch.tensor(groups.codes.astype(np.int64))

    def __len__(self) -> int:
        return len(self.numeric)

    def __getitem__(self, index: int) -> dict[str, torch.Tensor]:
        return {
            "numeric": self.numeric[index],
            "categorical": self.categorical[index],
            "target": self.target[index],
            "observed": self.observed[index],
            "lgd": self.lgd[index],
            "weight": self.weight[index],
            "group": self.group[index],
        }


@dataclass(frozen=True)
class TemporalSplit:
    train: pd.DataFrame
    validation: pd.DataFrame
    calibration: pd.DataFrame
    test: pd.DataFrame


def temporal_split(
    frame: pd.DataFrame, validation_months: int, calibration_months: int, test_months: int
) -> TemporalSplit:
    data = frame.copy()
    data["application_date"] = pd.to_datetime(data["application_date"], errors="raise")
    data = data.sort_values("application_date").reset_index(drop=True)
    latest = data["application_date"].max()
    test_start = latest - pd.DateOffset(months=test_months) + pd.Timedelta(days=1)
    calibration_start = test_start - pd.DateOffset(months=calibration_months)
    validation_start = calibration_start - pd.DateOffset(months=validation_months)
    train = data[data["application_date"] < validation_start]
    validation = data[
        (data["application_date"] >= validation_start) & (data["application_date"] < calibration_start)
    ]
    calibration = data[
        (data["application_date"] >= calibration_start) & (data["application_date"] < test_start)
    ]
    test = data[data["application_date"] >= test_start]
    if min(len(train), len(validation), len(calibration), len(test)) == 0:
        raise ValueError("Temporal split produced an empty partition; provide a longer observation window")
    # A customer may not cross partitions: retain each customer only in its earliest split.
    train_ids = set(train["customer_id"])
    validation = validation[~validation["customer_id"].isin(train_ids)]
    validation_ids = set(validation["customer_id"])
    calibration = calibration[~calibration["customer_id"].isin(train_ids | validation_ids)]
    calibration_ids = set(calibration["customer_id"])
    test = test[~test["customer_id"].isin(train_ids | validation_ids | calibration_ids)]
    if min(len(train), len(validation), len(calibration), len(test)) == 0:
        raise ValueError("Customer-group isolation produced an empty temporal partition")
    return TemporalSplit(
        train.reset_index(drop=True),
        validation.reset_index(drop=True),
        calibration.reset_index(drop=True),
        test.reset_index(drop=True),
    )
