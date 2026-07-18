from __future__ import annotations

import torch
from torch import Tensor
from torch.nn import functional as F

from .model import RiskOutput


def cumulative_to_interval_targets(cumulative: Tensor) -> Tensor:
    first = cumulative[:, :1]
    later = (cumulative[:, 1:] - cumulative[:, :-1]).clamp(min=0.0)
    at_risk = torch.cat([torch.ones_like(first), 1.0 - cumulative[:, :-1]], dim=1)
    return torch.cat([first, later], dim=1) / at_risk.clamp(min=1.0)


def soft_equal_opportunity_penalty(probability: Tensor, target: Tensor, group: Tensor) -> Tensor:
    """Differentiable TPR gap used only as a small regularizer, not a fairness guarantee."""
    positive = target > 0.5
    group_values = torch.unique(group)
    rates = []
    for value in group_values:
        mask = positive & (group == value)
        if mask.sum() >= 2:
            rates.append(probability[mask].mean())
    if len(rates) < 2:
        return probability.new_zeros(())
    stacked = torch.stack(rates)
    return stacked.max() - stacked.min()


def multitask_loss(
    output: RiskOutput,
    cumulative_default: Tensor,
    lgd_target: Tensor,
    observation_mask: Tensor,
    sample_weight: Tensor,
    protected_group: Tensor | None,
    fairness_lambda: float,
    positive_weights: Tensor | None = None,
) -> tuple[Tensor, dict[str, float]]:
    interval_target = cumulative_to_interval_targets(cumulative_default)
    interval_observed = observation_mask.clone()
    interval_observed[:, 1:] *= 1.0 - cumulative_default[:, :-1]
    raw_bce = F.binary_cross_entropy_with_logits(
        output.hazard_logits,
        interval_target,
        reduction="none",
        pos_weight=positive_weights,
    )
    pd_loss = (raw_bce * interval_observed * sample_weight[:, None]).sum() / (
        interval_observed * sample_weight[:, None]
    ).sum().clamp(min=1.0)

    default_mask = cumulative_default[:, -1] > 0.5
    if default_mask.any():
        lgd_loss = F.smooth_l1_loss(output.lgd[default_mask], lgd_target[default_mask])
    else:
        lgd_loss = output.lgd.sum() * 0.0

    fairness_penalty = output.lgd.sum() * 0.0
    if protected_group is not None:
        fairness_penalty = soft_equal_opportunity_penalty(
            output.cumulative_pd[:, -1], cumulative_default[:, -1], protected_group
        )
    total = pd_loss + 0.35 * lgd_loss + fairness_lambda * fairness_penalty
    return total, {
        "pd_loss": float(pd_loss.detach()),
        "lgd_loss": float(lgd_loss.detach()),
        "fairness_penalty": float(fairness_penalty.detach()),
    }

