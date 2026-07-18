from __future__ import annotations

from typing import Any
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient

from credit_risk.api import app

client = TestClient(app)


class MockPredictor:
    metadata = {
        "model_version": "mock-v1",
        "deployment_status": "DEMO_ONLY",
        "model_role": "CHALLENGER",
        "selected_technical_champion": "mock-net",
        "model_family": "mock-net",
    }

    def predict(self, records: list[dict[str, Any]], mc_samples: int = 20) -> list[dict[str, Any]]:
        return [
            {
                "model_version": "mock-v1",
                "deployment_status": "DEMO_ONLY",
                "model_role": "CHALLENGER",
                "selected_technical_champion": "mock-net",
                "pd": [0.01, 0.02, 0.05],
                "pd12_upper": 0.06,
                "pd12_epistemic_std": 0.005,
                "lgd": 0.35,
                "expected_loss_rate": 0.05 * 0.35,
                "ood_score": 1.2,
                "reason_codes": ["LOW_VERIFIED_INCOME"],
            }
            for _ in records
        ]


@pytest.fixture(autouse=True)
def mock_get_predictor():
    with patch("credit_risk.api.get_predictor", return_value=MockPredictor()):
        yield


def get_valid_features() -> dict[str, Any]:
    return {
        "age_years": 35.0,
        "monthly_income_vnd": 50_000_000.0,
        "income_volatility_6m": 0.1,
        "employment_tenure_months": 24.0,
        "bureau_history_months": 36.0,
        "cic_dpd_12m_max": 0.0,
        "cic_inquiries_6m": 1.0,
        "credit_utilization": 0.15,
        "current_dti": 0.25,
        "requested_amount_vnd": 1_000_000_000.0,
        "requested_tenure_months": 240.0,
        "collateral_value_vnd": 1_500_000_000.0,
        "requested_ltv": 0.66,
        "stress_dti": 0.45,
        "bank_relationship_months": 12.0,
        "transaction_cashflow_coverage": 1.8,
        "employment_type": "salaried",
        "income_verification": "bank_statement",
        "loan_purpose": "home",
        "collateral_type": "property",
        "region_risk_band": "low",
    }


def test_health_endpoint() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ready"
    assert data["model_version"] == "mock-v1"


def test_predict_endpoint_success() -> None:
    payload = {
        "application_id": "app-test-123",
        "features": get_valid_features(),
        "mc_samples": 5,
    }
    response = client.post("/v1/risk/predict", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["application_id"] == "app-test-123"
    assert data["model_version"] == "mock-v1"
    assert len(data["pd"]) == 3
    assert data["pd12_upper"] == 0.06
    assert "MODEL_NOT_PRODUCTION_APPROVED" in data["warnings"]


def test_predict_endpoint_forbidden_extra_field() -> None:
    features = get_valid_features()
    features["cccd"] = "001180005566"  # Extra prohibited PII field
    payload = {
        "application_id": "app-test-123",
        "features": features,
    }
    response = client.post("/v1/risk/predict", json=payload)
    assert response.status_code == 422  # Extra fields forbidden config


def test_predict_endpoint_missing_field() -> None:
    features = get_valid_features()
    del features["monthly_income_vnd"]  # Missing required field
    payload = {
        "application_id": "app-test-123",
        "features": features,
    }
    response = client.post("/v1/risk/predict", json=payload)
    assert response.status_code == 422


def test_recommend_endpoint_success() -> None:
    payload = {
        "application_id": "app-test-123",
        "features": get_valid_features(),
        "mc_samples": 5,
        "monthly_living_cost_vnd": 10_000_000.0,
    }
    response = client.post("/v1/limit/recommend", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["application_id"] == "app-test-123"
    assert data["status"] in ("RECOMMEND_FOR_REVIEW", "MANDATORY_HUMAN_REVIEW", "NO_SAFE_OFFER")
