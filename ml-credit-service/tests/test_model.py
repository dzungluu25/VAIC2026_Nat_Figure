from __future__ import annotations

import torch

from credit_risk.config import FEATURES, TrainConfig
from credit_risk.model import GovernedCreditNet


def test_pd_horizons_are_ordered_and_monotonic_directions_hold() -> None:
    config = TrainConfig(hidden_dim=16, embedding_dim=4, dropout=0.0)
    model = GovernedCreditNet(FEATURES, config, [4] * len(FEATURES.categorical)).eval()
    base = torch.zeros(1, len(FEATURES.numeric))
    categorical = torch.zeros(1, len(FEATURES.categorical), dtype=torch.long)
    base_pd = model(base, categorical).cumulative_pd
    assert torch.all(base_pd[:, 1:] >= base_pd[:, :-1])

    index = {name: idx for idx, name in enumerate(FEATURES.numeric)}
    for name in FEATURES.monotonic_increasing:
        adverse = base.clone()
        adverse[:, index[name]] += 1.0
        assert torch.all(model(adverse, categorical).cumulative_pd >= base_pd)
    for name in FEATURES.monotonic_decreasing:
        favourable = base.clone()
        favourable[:, index[name]] += 1.0
        assert torch.all(model(favourable, categorical).cumulative_pd <= base_pd)

