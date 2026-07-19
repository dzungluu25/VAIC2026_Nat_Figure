"""Governance tests for the legal-LLM fine-tuning pipeline.

Run: ``python -m unittest discover -s tests -v`` from the llm-finetuning/ directory.
"""

import unittest
from dataclasses import replace

from src.dataset_pipeline import (
    SEED_EXAMPLES,
    DatasetValidationError,
    SFTExample,
    build_dataset,
    dataset_fingerprint,
    scan_pii,
    split_by_case_family,
)
from src.evaluate_openai_compatible import EvaluationResult, compare_to_champion, evaluate
from src.promote import PromotionStatus, decide_promotion


def _perfect_predict(messages, tools):
    expected = dict(tools[0])
    return {"schema_valid": True, "tool_call": expected, "citations": [], "pii_detected": False}


class DatasetPipelineTests(unittest.TestCase):
    def test_seed_dataset_is_valid(self):
        accepted = build_dataset(SEED_EXAMPLES)
        self.assertEqual(len(accepted), len(SEED_EXAMPLES))

    def test_non_empty_citations_are_rejected(self):
        bad = replace(SEED_EXAMPLES[0], citations=("Điều 8 NĐ 356/2025",))
        with self.assertRaises(DatasetValidationError):
            build_dataset([bad])

    def test_pii_is_rejected(self):
        leaked = SFTExample(
            case_family="pii-leak",
            rule_id="CREDIT_TEST",
            status="NON_COMPLIANT",
            severity="HIGH",
            gate="MANDATORY_HUMAN_REVIEW",
            messages=({"role": "user", "content": "Liên hệ khách qua email a@b.com"},),
            expected_tool_call={"name": "flag_rule", "arguments": {"rule_id": "CREDIT_TEST"}},
        )
        # A 10-digit phone also trips the broad bank_account detector — the scanner errs on the
        # side of over-flagging so no PII slips into training data.
        self.assertEqual(scan_pii("email a@b.com số 0912345678"), ["bank_account", "email", "phone"])
        with self.assertRaises(DatasetValidationError):
            build_dataset([leaked])

    def test_raw_cot_is_rejected(self):
        bad = replace(
            SEED_EXAMPLES[0],
            messages=({"role": "assistant", "content": "Let's think step by step about the rule"},),
        )
        with self.assertRaises(DatasetValidationError):
            build_dataset([bad])

    def test_split_keeps_families_disjoint_and_deterministic(self):
        train_a, holdout_a = split_by_case_family(SEED_EXAMPLES, holdout_ratio=0.5)
        train_b, holdout_b = split_by_case_family(SEED_EXAMPLES, holdout_ratio=0.5)
        self.assertEqual([e.rule_id for e in train_a], [e.rule_id for e in train_b])
        train_families = {e.case_family for e in train_a}
        holdout_families = {e.case_family for e in holdout_a}
        self.assertTrue(train_families.isdisjoint(holdout_families))

    def test_fingerprint_is_stable(self):
        self.assertEqual(dataset_fingerprint(SEED_EXAMPLES), dataset_fingerprint(list(reversed(SEED_EXAMPLES))))


class EvaluationTests(unittest.TestCase):
    def test_perfect_candidate_passes_absolute(self):
        result = evaluate(SEED_EXAMPLES, _perfect_predict)
        ok, failures = result.passes_absolute()
        self.assertTrue(ok, failures)

    def test_model_returned_citations_fail_citation_dimension(self):
        def leaky_predict(messages, tools):
            out = _perfect_predict(messages, tools)
            out["citations"] = ["Điều 8"]
            return out

        result = evaluate(SEED_EXAMPLES, leaky_predict)
        self.assertLess(result.metrics["citation"], 1.0)


class PromotionTests(unittest.TestCase):
    def _results(self):
        champion = evaluate(SEED_EXAMPLES, _perfect_predict)
        candidate = evaluate(SEED_EXAMPLES, _perfect_predict)
        return candidate, champion

    def test_best_automated_outcome_is_eligible_not_production(self):
        candidate, champion = self._results()
        decision = decide_promotion(candidate, champion, holdout_case_count=120, legal_owner_signoff=True)
        self.assertEqual(decision.status, PromotionStatus.ELIGIBLE_FOR_HUMAN_APPROVAL)
        # No automated path can reach PRODUCTION_APPROVED.
        self.assertNotIn("PRODUCTION_APPROVED", [s.value for s in PromotionStatus])

    def test_small_holdout_forces_review(self):
        candidate, champion = self._results()
        decision = decide_promotion(candidate, champion, holdout_case_count=10, legal_owner_signoff=True)
        self.assertEqual(decision.status, PromotionStatus.NEEDS_REVIEW)

    def test_missing_signoff_forces_review(self):
        candidate, champion = self._results()
        decision = decide_promotion(candidate, champion, holdout_case_count=120, legal_owner_signoff=False)
        self.assertEqual(decision.status, PromotionStatus.NEEDS_REVIEW)

    def test_regression_is_rejected(self):
        candidate, champion = self._results()
        weak = EvaluationResult(metrics={**candidate.metrics, "tool_recall": 0.5}, sample_count=candidate.sample_count)
        decision = decide_promotion(weak, champion, holdout_case_count=120, legal_owner_signoff=True)
        self.assertEqual(decision.status, PromotionStatus.REJECTED)


if __name__ == "__main__":
    unittest.main()
