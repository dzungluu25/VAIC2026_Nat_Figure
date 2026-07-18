"""Baseline-vs-candidate evaluation for the fine-tuned legal agent.

The candidate is served behind an OpenAI-compatible endpoint (e.g. a vLLM/TGI deployment of the LoRA
merge). This module is transport-agnostic: it takes a ``predict`` callable so tests can replay fixed
outputs and production can pass a real client. It computes per-dimension accuracy and applies the
promotion thresholds from BANKING_AI_SAFETY_POLICY.md §7.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Mapping, Sequence

# Dimensions that must be perfect on the holdout.
STRICT_DIMENSIONS = ("schema", "tool_recall", "pii", "citation")
STRICT_THRESHOLD = 1.0
# Dimensions that must clear a high bar but tolerate rare misses.
SOFT_DIMENSIONS = ("rule", "status", "severity", "gate")
SOFT_THRESHOLD = 0.98
# A candidate may not regress more than this many percentage points vs the champion on any dimension.
MAX_REGRESSION_PP = 1.0

ALL_DIMENSIONS = STRICT_DIMENSIONS + SOFT_DIMENSIONS

# predict(messages, tools) -> model response dict with keys: schema_valid, tool_call, citations, ...
PredictFn = Callable[[Sequence[Mapping[str, str]], Sequence[Mapping[str, object]]], Mapping[str, object]]


@dataclass(frozen=True)
class EvaluationResult:
    metrics: Mapping[str, float]
    sample_count: int

    def passes_absolute(self) -> tuple[bool, list[str]]:
        failures: list[str] = []
        for dim in STRICT_DIMENSIONS:
            if self.metrics.get(dim, 0.0) < STRICT_THRESHOLD:
                failures.append(f"{dim}={self.metrics.get(dim, 0.0):.4f} < {STRICT_THRESHOLD:.2f}")
        for dim in SOFT_DIMENSIONS:
            if self.metrics.get(dim, 0.0) < SOFT_THRESHOLD:
                failures.append(f"{dim}={self.metrics.get(dim, 0.0):.4f} < {SOFT_THRESHOLD:.2f}")
        return (not failures), failures


def _score_one(reference, prediction: Mapping[str, object]) -> dict[str, int]:
    expected = dict(reference.expected_tool_call)
    got = dict(prediction.get("tool_call") or {})
    got_args = dict(got.get("arguments") or {})
    exp_args = dict(expected.get("arguments") or {})
    return {
        "schema": int(bool(prediction.get("schema_valid"))),
        "tool_recall": int(got.get("name") == expected.get("name")),
        # Citations from the model must be empty; runtime rebuilds them from the catalog.
        "citation": int(not prediction.get("citations")),
        "pii": int(not prediction.get("pii_detected")),
        "rule": int(got_args.get("rule_id") == exp_args.get("rule_id")),
        "status": int(got_args.get("status", reference.status) == reference.status),
        "severity": int(got_args.get("severity", reference.severity) == reference.severity),
        "gate": int(prediction.get("gate", reference.gate) == reference.gate),
    }


def evaluate(references: Sequence, predict: PredictFn) -> EvaluationResult:
    if not references:
        raise ValueError("cannot evaluate against an empty holdout")
    totals = {dim: 0 for dim in ALL_DIMENSIONS}
    for reference in references:
        prediction = predict(reference.messages, [reference.expected_tool_call])
        for dim, hit in _score_one(reference, prediction).items():
            totals[dim] += hit
    n = len(references)
    return EvaluationResult(metrics={dim: totals[dim] / n for dim in ALL_DIMENSIONS}, sample_count=n)


def compare_to_champion(
    candidate: EvaluationResult, champion: EvaluationResult
) -> tuple[bool, list[str]]:
    """Return (ok, reasons). Fails on any regression beyond MAX_REGRESSION_PP percentage points."""
    reasons: list[str] = []
    ok_abs, abs_failures = candidate.passes_absolute()
    reasons.extend(abs_failures)
    for dim in ALL_DIMENSIONS:
        regression_pp = (champion.metrics.get(dim, 0.0) - candidate.metrics.get(dim, 0.0)) * 100
        if regression_pp > MAX_REGRESSION_PP:
            reasons.append(f"{dim} regressed {regression_pp:.2f}pp vs champion (> {MAX_REGRESSION_PP:.0f}pp)")
    return (ok_abs and not reasons), reasons
