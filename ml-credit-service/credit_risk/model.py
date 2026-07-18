from __future__ import annotations

from dataclasses import dataclass

import torch
from torch import Tensor, nn
from torch.nn import functional as F

from .config import FeatureConfig, TrainConfig


@dataclass
class RiskOutput:
    hazard_logits: Tensor
    cumulative_pd: Tensor
    lgd: Tensor


class GovernedCreditNet(nn.Module):
    """Interpretable monotonic score branch plus residual representation.

    Policy-sensitive monotonic features are excluded from the unconstrained MLP.
    Their softplus-constrained weights make adverse movements unable to reduce the
    learned base risk score. Horizon PDs are derived from non-negative interval
    hazards, so PD(3m) <= PD(6m) <= PD(12m) by construction.
    """

    def __init__(
        self,
        feature_config: FeatureConfig,
        train_config: TrainConfig,
        category_cardinalities: list[int],
    ) -> None:
        super().__init__()
        self.feature_config = feature_config
        self.train_config = train_config
        numeric_index = {name: index for index, name in enumerate(feature_config.numeric)}
        increasing = [numeric_index[name] for name in feature_config.monotonic_increasing]
        decreasing = [numeric_index[name] for name in feature_config.monotonic_decreasing]
        monotonic = increasing + decreasing
        residual = [index for index in range(len(feature_config.numeric)) if index not in monotonic]
        self.register_buffer("increasing_index", torch.tensor(increasing, dtype=torch.long))
        self.register_buffer("decreasing_index", torch.tensor(decreasing, dtype=torch.long))
        self.register_buffer("residual_index", torch.tensor(residual, dtype=torch.long))

        # Start near zero positive weight (softplus(-3) ~= 0.049) so the sum of
        # constrained features does not saturate hazards before learning.
        self.increasing_raw_weight = nn.Parameter(torch.full((len(increasing),), -3.0))
        self.decreasing_raw_weight = nn.Parameter(torch.full((len(decreasing),), -3.0))
        self.monotonic_bias = nn.Parameter(torch.zeros(1))

        self.embeddings = nn.ModuleList(
            [nn.Embedding(cardinality, train_config.embedding_dim) for cardinality in category_cardinalities]
        )
        residual_input = len(residual) + len(category_cardinalities) * train_config.embedding_dim
        self.residual_net = nn.Sequential(
            nn.Linear(residual_input, train_config.hidden_dim),
            nn.LayerNorm(train_config.hidden_dim),
            nn.SiLU(),
            nn.Dropout(train_config.dropout),
            nn.Linear(train_config.hidden_dim, train_config.hidden_dim // 2),
            nn.SiLU(),
            nn.Dropout(train_config.dropout),
        )
        residual_dim = train_config.hidden_dim // 2
        representation_dim = residual_dim + 1
        self.hazard_head = nn.Linear(residual_dim, len(train_config.horizons_months))
        self.lgd_head = nn.Linear(representation_dim, 1)

    def forward(self, numeric: Tensor, categorical: Tensor) -> RiskOutput:
        increasing = numeric.index_select(1, self.increasing_index)
        decreasing = numeric.index_select(1, self.decreasing_index)
        monotonic_score = self.monotonic_bias
        if increasing.shape[1]:
            monotonic_score = monotonic_score + increasing @ F.softplus(self.increasing_raw_weight)
        if decreasing.shape[1]:
            monotonic_score = monotonic_score - decreasing @ F.softplus(self.decreasing_raw_weight)
        monotonic_score = monotonic_score.unsqueeze(1) if monotonic_score.ndim == 1 else monotonic_score

        residual_numeric = numeric.index_select(1, self.residual_index)
        embedded = [embedding(categorical[:, index]) for index, embedding in enumerate(self.embeddings)]
        residual_input = torch.cat([residual_numeric, *embedded], dim=1)
        residual_representation = self.residual_net(residual_input)
        representation = torch.cat([monotonic_score, residual_representation], dim=1)

        # One shared monotonic score is added to each hazard logit. The unconstrained
        # residual cannot see monotonic features, preserving the risk direction.
        hazard_logits = self.hazard_head(residual_representation) + monotonic_score
        interval_hazard = torch.sigmoid(hazard_logits)
        survival = torch.cumprod(1.0 - interval_hazard.clamp(max=1.0 - 1e-6), dim=1)
        cumulative_pd = 1.0 - survival
        lgd = torch.sigmoid(self.lgd_head(representation)).squeeze(1)
        return RiskOutput(hazard_logits=hazard_logits, cumulative_pd=cumulative_pd, lgd=lgd)

    def monotonic_contributions(self, numeric: Tensor) -> Tensor:
        contributions = torch.zeros_like(numeric)
        contributions[:, self.increasing_index] = (
            numeric[:, self.increasing_index] * F.softplus(self.increasing_raw_weight)
        )
        contributions[:, self.decreasing_index] = (
            -numeric[:, self.decreasing_index] * F.softplus(self.decreasing_raw_weight)
        )
        return contributions
