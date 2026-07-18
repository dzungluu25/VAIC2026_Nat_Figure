from __future__ import annotations

from typing import Any

from credit_risk.config import PolicyConfig
from credit_risk.decision import FairOfferOptimizer, monthly_payment


class FakePredictor:
    metadata = {"deployment_status": "DEMO_ONLY", "model_version": "fake-v1"}

    def predict(self, records: list[dict[str, Any]], mc_samples: int = 20) -> list[dict[str, Any]]:
        results = []
        for item in records:
            pd12 = 0.012 + 0.03 * item["requested_ltv"] + 0.025 * item["stress_dti"]
            results.append(
                {
                    "pd": [pd12 * 0.3, pd12 * 0.6, pd12],
                    "pd12_upper": pd12 + 0.005,
                    "pd12_epistemic_std": 0.002,
                    "lgd": 0.35,
                    "ood_score": 1.0,
                }
            )
        return results


def base_features() -> dict[str, Any]:
    return {
        "monthly_income_vnd": 80_000_000,
        "current_dti": 0.10,
        "requested_amount_vnd": 2_000_000_000,
        "requested_tenure_months": 240,
        "collateral_value_vnd": 3_500_000_000,
        "requested_ltv": 2 / 3.5,
        "stress_dti": 0.45,
    }


def test_payment_is_positive() -> None:
    assert monthly_payment(1_000_000_000, 0.12, 240) > 0


def test_optimizer_never_labels_output_as_approved() -> None:
    policy = PolicyConfig(
        max_pd12_upper=0.20,
        max_expected_loss_rate=0.20,
        max_stress_dti=0.65,
        max_ltv=0.70,
        minimum_offer_vnd=100_000_000,
        candidate_step_vnd=100_000_000,
    )
    result = FairOfferOptimizer(FakePredictor(), policy).optimize(base_features(), 12_000_000, mc_samples=2)  # type: ignore[arg-type]
    assert result.status in {"RECOMMEND_FOR_REVIEW", "MANDATORY_HUMAN_REVIEW", "NO_SAFE_OFFER"}
    assert "APPROVED" not in result.status
    if result.recommended_offer:
        assert result.recommended_offer["stress_dti"] <= policy.max_stress_dti
        assert result.recommended_offer["ltv"] <= policy.max_ltv

