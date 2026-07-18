from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

from .config import POLICY, PolicyConfig
from .inference import RiskPredictor


def monthly_payment(principal: float, annual_rate: float, months: int) -> float:
    if principal <= 0 or months <= 0:
        raise ValueError("principal and months must be positive")
    monthly_rate = annual_rate / 12.0
    if monthly_rate == 0:
        return principal / months
    factor = (1.0 + monthly_rate) ** months
    return principal * monthly_rate * factor / (factor - 1.0)


@dataclass
class OfferOptimizationResult:
    status: str
    recommended_offer: dict[str, Any] | None
    candidates: list[dict[str, Any]]
    reason_codes: list[str]


class FairOfferOptimizer:
    """Searches a transparent constrained frontier; it does not approve a loan."""

    def __init__(self, predictor: RiskPredictor, policy: PolicyConfig = POLICY):
        self.predictor = predictor
        self.policy = policy

    def optimize(
        self,
        features: dict[str, Any],
        monthly_living_cost_vnd: float,
        mc_samples: int = 20,
    ) -> OfferOptimizationResult:
        requested = float(features["requested_amount_vnd"])
        minimum = min(float(self.policy.minimum_offer_vnd), requested)
        step = float(self.policy.candidate_step_vnd)
        candidate_amounts = np.arange(minimum, requested + step * 0.5, step)
        if not len(candidate_amounts) or candidate_amounts[-1] < requested:
            candidate_amounts = np.append(candidate_amounts, requested)
        candidate_amounts = np.unique(np.minimum(candidate_amounts, requested))

        income = float(features["monthly_income_vnd"])
        current_debt_payment = float(features["current_dti"]) * income
        collateral = float(features["collateral_value_vnd"])
        months = int(features["requested_tenure_months"])
        records: list[dict[str, Any]] = []
        payment_pairs: list[tuple[float, float]] = []
        for amount in candidate_amounts:
            normal_payment = monthly_payment(float(amount), self.policy.annual_interest_rate, months)
            stress_payment = monthly_payment(float(amount), self.policy.stress_annual_interest_rate, months)
            record = dict(features)
            record["requested_amount_vnd"] = float(amount)
            record["requested_ltv"] = float(amount / collateral) if collateral > 0 else 5.0
            record["stress_dti"] = (current_debt_payment + stress_payment) / income
            records.append(record)
            payment_pairs.append((normal_payment, stress_payment))

        predictions = self.predictor.predict(records, mc_samples=mc_samples)
        evaluated: list[dict[str, Any]] = []
        for amount, record, prediction, payments in zip(candidate_amounts, records, predictions, payment_pairs):
            normal_payment, stress_payment = payments
            cashflow_buffer = (income - current_debt_payment - normal_payment - monthly_living_cost_vnd) / income
            expected_loss_rate = prediction["pd"][-1] * prediction["lgd"] * self.policy.loss_funding_multiplier
            expected_loss = float(amount) * expected_loss_rate
            # Transparent one-year unit economics approximation. Finance/Risk must
            # replace constants with the bank's FTP, capital and operating costs.
            interest_income = float(amount) * self.policy.annual_interest_rate * 0.55 * (1.0 - prediction["pd"][-1])
            economic_capital = float(amount) * max(expected_loss_rate, 0.04)
            capital_charge = economic_capital * self.policy.capital_cost_rate
            value = interest_income - expected_loss - capital_charge - self.policy.operating_cost_vnd
            failed = []
            if prediction["pd12_upper"] > self.policy.max_pd12_upper:
                failed.append("PD12_UPPER_EXCEEDS_POLICY")
            if record["stress_dti"] > self.policy.max_stress_dti:
                failed.append("STRESS_DTI_EXCEEDS_POLICY")
            if record["requested_ltv"] > self.policy.max_ltv:
                failed.append("LTV_EXCEEDS_POLICY")
            if cashflow_buffer < self.policy.min_cashflow_buffer:
                failed.append("CASHFLOW_BUFFER_BELOW_POLICY")
            if expected_loss_rate > self.policy.max_expected_loss_rate:
                failed.append("EXPECTED_LOSS_EXCEEDS_POLICY")
            if prediction["ood_score"] > self.policy.ood_review_threshold:
                failed.append("OUT_OF_DISTRIBUTION")
            evaluated.append(
                {
                    "amount_vnd": float(amount),
                    "monthly_payment_vnd": normal_payment,
                    "stress_monthly_payment_vnd": stress_payment,
                    "stress_dti": float(record["stress_dti"]),
                    "ltv": float(record["requested_ltv"]),
                    "pd12": float(prediction["pd"][-1]),
                    "pd12_upper": float(prediction["pd12_upper"]),
                    "lgd": float(prediction["lgd"]),
                    "expected_loss_vnd": expected_loss,
                    "risk_adjusted_value_vnd": value,
                    "feasible": not failed,
                    "failed_constraints": failed,
                    "uncertainty": float(prediction["pd12_epistemic_std"]),
                }
            )

        feasible = [candidate for candidate in evaluated if candidate["feasible"]]
        if not feasible:
            return OfferOptimizationResult(
                status="NO_SAFE_OFFER",
                recommended_offer=None,
                candidates=evaluated,
                reason_codes=sorted({reason for item in evaluated for reason in item["failed_constraints"]}),
            )
        # Maximise economic value; for practically tied value (1%), prefer the
        # larger customer limit. This yields a reproducible customer/bank frontier.
        best_value = max(item["risk_adjusted_value_vnd"] for item in feasible)
        tolerance = max(abs(best_value) * 0.01, 1.0)
        near_best = [item for item in feasible if item["risk_adjusted_value_vnd"] >= best_value - tolerance]
        recommended = max(near_best, key=lambda item: item["amount_vnd"])
        needs_review = (
            recommended["amount_vnd"] >= self.policy.manual_review_amount_vnd
            or recommended["uncertainty"] > self.policy.uncertainty_review_threshold
            or self.predictor.metadata["deployment_status"] != "PRODUCTION_APPROVED"
        )
        status = "MANDATORY_HUMAN_REVIEW" if needs_review else "RECOMMEND_FOR_REVIEW"
        clean_offer = {key: value for key, value in recommended.items() if key != "uncertainty"}
        return OfferOptimizationResult(
            status=status,
            recommended_offer=clean_offer,
            candidates=evaluated,
            reason_codes=["CONSTRAINED_FRONTIER_OPTIMUM", "FINAL_APPROVAL_REQUIRED"],
        )
