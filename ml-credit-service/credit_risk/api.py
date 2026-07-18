from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, HTTPException

from .config import POLICY
from .decision import FairOfferOptimizer
from .inference import RiskPredictor
from .schemas import (
    CandidateOffer,
    HorizonRisk,
    PredictionRequest,
    PredictionResponse,
    RecommendationRequest,
    RecommendationResponse,
)


app = FastAPI(
    title="VAIC Governed Credit Risk Service",
    version="0.1.0",
    description="Risk estimation and constrained offer recommendation; never a standalone approval authority.",
)
_predictor: RiskPredictor | None = None


def get_predictor() -> RiskPredictor:
    global _predictor
    if _predictor is None:
        artifact_dir = Path(os.getenv("CREDIT_MODEL_DIR", "artifacts/champion"))
        try:
            _predictor = RiskPredictor(artifact_dir)
        except (FileNotFoundError, RuntimeError, ValueError) as error:
            raise HTTPException(status_code=503, detail=f"Validated model artifact unavailable: {error}") from error
    return _predictor


@app.get("/health")
def health() -> dict[str, str]:
    predictor = get_predictor()
    return {
        "status": "ready",
        "model_version": predictor.metadata["model_version"],
        "deployment_status": predictor.metadata["deployment_status"],
    }


@app.post("/v1/risk/predict", response_model=PredictionResponse)
def predict(request: PredictionRequest) -> PredictionResponse:
    predictor = get_predictor()
    result = predictor.predict([request.features.model_dump()], request.mc_samples)[0]
    mandatory_review = (
        result["deployment_status"] != "PRODUCTION_APPROVED"
        or result["ood_score"] > POLICY.ood_review_threshold
        or result["pd12_epistemic_std"] > POLICY.uncertainty_review_threshold
    )
    warnings = ["MODEL_OUTPUT_IS_NOT_A_CREDIT_DECISION"]
    if result["deployment_status"] != "PRODUCTION_APPROVED":
        warnings.append("MODEL_NOT_PRODUCTION_APPROVED")
    if result["model_role"] == "CHALLENGER":
        warnings.append("PYTORCH_MODEL_IS_CHALLENGER_NOT_TECHNICAL_CHAMPION")
    if result["ood_score"] > POLICY.ood_review_threshold:
        warnings.append("OUT_OF_DISTRIBUTION_INPUT")
    return PredictionResponse(
        application_id=request.application_id,
        model_version=result["model_version"],
        deployment_status=result["deployment_status"],
        model_role=result["model_role"],
        selected_technical_champion=result["selected_technical_champion"],
        pd=[
            HorizonRisk(months=months, probability=probability)
            for months, probability in zip((3, 6, 12), result["pd"])
        ],
        pd12_upper=result["pd12_upper"],
        pd12_epistemic_std=result["pd12_epistemic_std"],
        lgd=result["lgd"],
        expected_loss_rate=result["expected_loss_rate"],
        ood_score=result["ood_score"],
        reason_codes=result["reason_codes"],
        routing="MANDATORY_HUMAN_REVIEW" if mandatory_review else "RISK_ESTIMATE_ONLY",
        warnings=warnings,
    )


@app.post("/v1/limit/recommend", response_model=RecommendationResponse)
def recommend(request: RecommendationRequest) -> RecommendationResponse:
    predictor = get_predictor()
    result = FairOfferOptimizer(predictor).optimize(
        request.features.model_dump(), request.monthly_living_cost_vnd, request.mc_samples
    )
    return RecommendationResponse(
        application_id=request.application_id,
        model_version=predictor.metadata["model_version"],
        model_role=predictor.metadata.get("tuning", {}).get("role", "UNASSESSED"),
        selected_technical_champion=predictor.metadata.get("tuning", {}).get(
            "selected_technical_champion", predictor.metadata["model_family"]
        ),
        policy_version=POLICY.policy_version,
        status=result.status,  # type: ignore[arg-type]
        recommended_offer=CandidateOffer(**result.recommended_offer) if result.recommended_offer else None,
        evaluated_candidates=len(result.candidates),
        reason_codes=result.reason_codes,
        disclaimer="Đây là đề xuất hỗ trợ thẩm định; quyết định cuối cùng phải qua chính sách và thẩm quyền phê duyệt của ngân hàng.",
    )
