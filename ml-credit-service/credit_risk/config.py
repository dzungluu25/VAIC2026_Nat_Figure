from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass(frozen=True)
class FeatureConfig:
    # Protected attributes and direct identifiers are deliberately absent.
    numeric: tuple[str, ...] = (
        "monthly_income_vnd",
        "income_volatility_6m",
        "employment_tenure_months",
        "bureau_history_months",
        "cic_dpd_12m_max",
        "cic_inquiries_6m",
        "credit_utilization",
        "current_dti",
        "requested_amount_vnd",
        "requested_tenure_months",
        "collateral_value_vnd",
        "requested_ltv",
        "stress_dti",
        "bank_relationship_months",
        "transaction_cashflow_coverage",
    )
    categorical: tuple[str, ...] = (
        "employment_type",
        "income_verification",
        "loan_purpose",
        "collateral_type",
        "region_risk_band",
    )
    # These fields only enter a constrained branch with positive risk direction.
    monotonic_increasing: tuple[str, ...] = (
        "income_volatility_6m",
        "cic_dpd_12m_max",
        "cic_inquiries_6m",
        "credit_utilization",
        "current_dti",
        "requested_ltv",
        "stress_dti",
    )
    # These fields only enter a constrained branch with negative risk direction.
    monotonic_decreasing: tuple[str, ...] = (
        "monthly_income_vnd",
        "employment_tenure_months",
        "bureau_history_months",
        "bank_relationship_months",
        "transaction_cashflow_coverage",
    )
    # Used only for fairness reports; never passed to the model.
    protected_audit_only: tuple[str, ...] = ("gender", "age_band", "region")
    prohibited: tuple[str, ...] = (
        "customer_name",
        "cccd",
        "phone",
        "email",
        "religion",
        "ethnicity",
        "insurance_purchase",
    )
    # Available to the deterministic policy engine, never to the learned model.
    policy_only: tuple[str, ...] = ("age_years",)

    def to_dict(self) -> dict[str, Any]:
        value = asdict(self)
        return {key: list(item) if isinstance(item, tuple) else item for key, item in value.items()}


@dataclass(frozen=True)
class TrainConfig:
    seed: int = 2026
    hidden_dim: int = 64
    embedding_dim: int = 8
    dropout: float = 0.15
    batch_size: int = 256
    epochs: int = 35
    patience: int = 6
    learning_rate: float = 8e-4
    weight_decay: float = 1e-4
    gradient_clip: float = 2.0
    fairness_lambda: float = 0.05
    horizons_months: tuple[int, ...] = (3, 6, 12)
    validation_months: int = 3
    calibration_months: int = 2
    test_months: int = 3


@dataclass(frozen=True)
class PolicyConfig:
    policy_version: str = "DEMO_REQUIRES_BANK_RISK_APPROVAL"
    policy_source_type: str = "DEMO_NOT_REGULATORY"
    policy_approval_id: str | None = None
    annual_interest_rate: float = 0.105
    stress_annual_interest_rate: float = 0.14
    max_pd12_upper: float = 0.08
    max_stress_dti: float = 0.60
    max_ltv: float = 0.70
    min_cashflow_buffer: float = 0.20
    max_expected_loss_rate: float = 0.035
    uncertainty_review_threshold: float = 0.025
    ood_review_threshold: float = 8.0
    candidate_step_vnd: int = 50_000_000
    minimum_offer_vnd: int = 100_000_000
    capital_cost_rate: float = 0.10
    operating_cost_vnd: float = 2_000_000.0
    loss_funding_multiplier: float = 1.0
    manual_review_amount_vnd: int = 2_000_000_000


FEATURES = FeatureConfig()
TRAIN = TrainConfig()
POLICY = PolicyConfig()
