import fs from "fs";
import { config } from "../../config/env";

export interface MlCreditRiskResponse {
  application_id: string;
  model_version: string;
  deployment_status: string;
  model_role: string;
  selected_technical_champion: string;
  pd: Array<{ months: number; probability: number }>;
  pd12_upper: number;
  pd12_epistemic_std: number;
  lgd: number;
  expected_loss_rate: number;
  ood_score: number;
  reason_codes: string[];
  routing: "RISK_ESTIMATE_ONLY" | "MANDATORY_HUMAN_REVIEW";
  warnings: string[];
}

/**
 * Read-only adapter. The model service cannot issue an approval token and a
 * missing/unhealthy model fails closed instead of returning a random score.
 */
export const estimateCreditRisk = async (
  applicationId: string,
  features: Record<string, unknown>
): Promise<MlCreditRiskResponse> => {
  let baseUrl = config.creditRiskModelUrl;
  if (baseUrl.includes("//credit-risk-model:") && !fs.existsSync("/.dockerenv")) {
    baseUrl = baseUrl.replace("//credit-risk-model:", "//localhost:");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_500);
  try {
    const response = await fetch(`${baseUrl}/v1/risk/predict`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ application_id: applicationId, features, mc_samples: 20 }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Credit risk service failed closed with HTTP ${response.status}`);
    }
    const result = (await response.json()) as MlCreditRiskResponse;
    if (result.warnings.includes("MODEL_NOT_PRODUCTION_APPROVED")) {
      result.routing = "MANDATORY_HUMAN_REVIEW";
    }
    return result;
  } finally {
    clearTimeout(timeout);
  }
};
