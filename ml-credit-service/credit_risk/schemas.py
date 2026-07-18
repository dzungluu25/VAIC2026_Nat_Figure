from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class CreditFeatures(BaseModel):
    """Only underwriting features; PII/protected fields are intentionally rejected."""

    model_config = ConfigDict(extra="forbid")

    age_years: float = Field(ge=18, le=100)
    monthly_income_vnd: float = Field(gt=0)
    income_volatility_6m: float = Field(ge=0, le=5)
    employment_tenure_months: float = Field(ge=0, le=720)
    bureau_history_months: float = Field(ge=0, le=720)
    cic_dpd_12m_max: float = Field(ge=0, le=365)
    cic_inquiries_6m: float = Field(ge=0, le=100)
    credit_utilization: float = Field(ge=0, le=2)
    current_dti: float = Field(ge=0, le=3)
    requested_amount_vnd: float = Field(gt=0)
    requested_tenure_months: float = Field(ge=1, le=480)
    collateral_value_vnd: float = Field(ge=0)
    requested_ltv: float = Field(ge=0, le=5)
    stress_dti: float = Field(ge=0, le=5)
    bank_relationship_months: float = Field(ge=0, le=720)
    transaction_cashflow_coverage: float = Field(ge=0, le=20)
    employment_type: Literal["salaried", "self_employed", "freelance", "retired"]
    income_verification: Literal["bank_statement", "payroll", "tax", "mixed", "unverified"]
    loan_purpose: Literal["home", "vehicle", "business", "consumer", "refinance"]
    collateral_type: Literal["property", "vehicle", "deposit", "unsecured"]
    region_risk_band: Literal["low", "medium", "high"]


class PredictionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    application_id: str = Field(min_length=1, max_length=128)
    features: CreditFeatures
    mc_samples: int = Field(default=20, ge=1, le=100)


class HorizonRisk(BaseModel):
    months: int
    probability: float


class PredictionResponse(BaseModel):
    application_id: str
    model_version: str
    deployment_status: str
    model_role: str
    selected_technical_champion: str
    pd: list[HorizonRisk]
    pd12_upper: float
    pd12_epistemic_std: float
    lgd: float
    expected_loss_rate: float
    ood_score: float
    reason_codes: list[str]
    routing: Literal["RISK_ESTIMATE_ONLY", "MANDATORY_HUMAN_REVIEW"]
    warnings: list[str]


class RecommendationRequest(PredictionRequest):
    monthly_living_cost_vnd: float = Field(ge=0)


class CandidateOffer(BaseModel):
    amount_vnd: float
    monthly_payment_vnd: float
    stress_monthly_payment_vnd: float
    stress_dti: float
    ltv: float
    pd12: float
    pd12_upper: float
    lgd: float
    expected_loss_vnd: float
    risk_adjusted_value_vnd: float
    feasible: bool
    failed_constraints: list[str]


class RecommendationResponse(BaseModel):
    application_id: str
    model_version: str
    model_role: str
    selected_technical_champion: str
    policy_version: str
    status: Literal["RECOMMEND_FOR_REVIEW", "MANDATORY_HUMAN_REVIEW", "NO_SAFE_OFFER"]
    recommended_offer: CandidateOffer | None
    evaluated_candidates: int
    reason_codes: list[str]
    disclaimer: str

    @model_validator(mode="after")
    def recommendation_matches_status(self) -> "RecommendationResponse":
        if self.status == "NO_SAFE_OFFER" and self.recommended_offer is not None:
            raise ValueError("NO_SAFE_OFFER cannot contain a recommended offer")
        return self
