"""Promotion gate for legal-LLM candidates.

Hard rule (BANKING_AI_SAFETY_POLICY.md §7): automation can conclude at most
``ELIGIBLE_FOR_HUMAN_APPROVAL``. It can NEVER produce ``PRODUCTION_APPROVED`` — that transition
requires an out-of-band Risk/Compliance sign-off and is not representable as an automated outcome.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

from .evaluate_openai_compatible import EvaluationResult, compare_to_champion

# Minimum independent holdout cases before a candidate can be forwarded for human approval.
MIN_HOLDOUT_CASES = 100


class PromotionStatus(str, Enum):
    DEMO_ONLY = "DEMO_ONLY"
    NEEDS_REVIEW = "NEEDS_REVIEW"
    ELIGIBLE_FOR_HUMAN_APPROVAL = "ELIGIBLE_FOR_HUMAN_APPROVAL"
    REJECTED = "REJECTED"
    # Deliberately absent from any automated return path — kept here only to document intent.
    # PRODUCTION_APPROVED is set exclusively by a human sign-off workflow outside this module.


@dataclass(frozen=True)
class PromotionDecision:
    status: PromotionStatus
    reasons: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        # Defensive guardrail: makes an accidental automated production-approval impossible.
        if self.status.value == "PRODUCTION_APPROVED":  # pragma: no cover - unreachable by design
            raise ValueError("automation must never emit PRODUCTION_APPROVED")


def decide_promotion(
    candidate: EvaluationResult,
    champion: EvaluationResult,
    holdout_case_count: int,
    legal_owner_signoff: bool,
) -> PromotionDecision:
    """Map evaluation outcome + governance preconditions to a promotion status.

    Best possible automated outcome is ELIGIBLE_FOR_HUMAN_APPROVAL, and only when metrics pass, the
    holdout is large enough, and the Legal Policy Owner has signed off on the training data.
    """
    ok, reasons = compare_to_champion(candidate, champion)

    if holdout_case_count < MIN_HOLDOUT_CASES:
        reasons.append(f"holdout has {holdout_case_count} cases (< {MIN_HOLDOUT_CASES} required)")
    if not legal_owner_signoff:
        reasons.append("Legal Policy Owner sign-off on training data is missing")

    if not ok:
        return PromotionDecision(PromotionStatus.REJECTED, reasons)
    if reasons:
        return PromotionDecision(PromotionStatus.NEEDS_REVIEW, reasons)
    return PromotionDecision(
        PromotionStatus.ELIGIBLE_FOR_HUMAN_APPROVAL,
        ["metrics + holdout + sign-off satisfied; awaiting Risk/Compliance human approval"],
    )
