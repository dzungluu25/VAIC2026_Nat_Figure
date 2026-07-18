"""Legal LLM fine-tuning governance pipeline.

Scope (see ../BANKING_AI_SAFETY_POLICY.md §7): fine-tuning only optimizes *behaviour* — rule
selection, tool calls, abstention and schema compliance. Legal knowledge, policy thresholds and
citations are never baked into weights. Citations in SFT labels are always empty and are rebuilt at
runtime from the official source catalog.

The modules here are provider-agnostic and depend only on the standard library so the governance
gates stay testable without a GPU or network access. Actual LoRA training against
`openai/gpt-oss-20b` is an optional step that requires the training extras (see requirements.txt).
"""

from .dataset_pipeline import (
    SFTExample,
    build_dataset,
    dataset_fingerprint,
    scan_pii,
    split_by_case_family,
)
from .evaluate_openai_compatible import EvaluationResult, compare_to_champion, evaluate
from .promote import PromotionDecision, PromotionStatus, decide_promotion

__all__ = [
    "SFTExample",
    "build_dataset",
    "dataset_fingerprint",
    "scan_pii",
    "split_by_case_family",
    "EvaluationResult",
    "evaluate",
    "compare_to_champion",
    "PromotionDecision",
    "PromotionStatus",
    "decide_promotion",
]
