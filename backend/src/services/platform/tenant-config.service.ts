import { pgQuery } from "../../config/pg";
import { TenantRuntimeConfig } from "../../types/platform.types";

export const validateTenantConfig = (config: TenantRuntimeConfig): void => {
  if (config.thresholds.maxDti <= 0 || config.thresholds.maxDti > 1) throw new Error("maxDti must be within (0,1]");
  if (config.runtime.maxRetriesPerAgent < 1 || config.runtime.maxSteps < 1 || config.runtime.timeoutSeconds < 1) throw new Error("Runtime budgets must be positive");
  if (!config.allowedModels.length) throw new Error("At least one model must be allow-listed");
  const { maxLtvByPropertyType, minimumMonthlyLivingExpenseVnd, incomeHaircuts, maximumRepaymentAgeMargin, fraud } = config.thresholds;
  for (const [key, value] of Object.entries(maxLtvByPropertyType)) {
    if (!(value > 0 && value <= 100)) throw new Error(`thresholds.maxLtvByPropertyType.${key} must be within (0,100]`);
  }
  if (minimumMonthlyLivingExpenseVnd < 0) throw new Error("thresholds.minimumMonthlyLivingExpenseVnd must be non-negative");
  for (const [key, value] of Object.entries(incomeHaircuts)) {
    if (!(value >= 0 && value <= 1)) throw new Error(`thresholds.incomeHaircuts.${key} must be within [0,1]`);
  }
  if (maximumRepaymentAgeMargin < 0) throw new Error("thresholds.maximumRepaymentAgeMargin must be non-negative");
  if (fraud.incomeDebtRatioCeiling <= 0) throw new Error("thresholds.fraud.incomeDebtRatioCeiling must be positive");
  if (fraud.collateralValueToLoanCeiling <= 0) throw new Error("thresholds.fraud.collateralValueToLoanCeiling must be positive");
};
export const putTenantConfig = async (tenantId: string, input: TenantRuntimeConfig, actor: string): Promise<TenantRuntimeConfig> => {
  const config = { ...input, tenantId, updatedBy: actor }; validateTenantConfig(config);
  await pgQuery(`INSERT INTO tenant_runtime_configs (tenant_id, version, payload, effective_from, updated_by) VALUES ($1,$2,$3,$4,$5)`, [tenantId, config.version, config, config.effectiveFrom, actor]);
  return config;
};
export const getTenantConfig = async (tenantId: string): Promise<TenantRuntimeConfig | null> => {
  const result = await pgQuery(`SELECT payload FROM tenant_runtime_configs WHERE tenant_id=$1 AND effective_from <= NOW() ORDER BY effective_from DESC, created_at DESC LIMIT 1`, [tenantId]);
  return result.rows[0]?.payload ?? null;
};
export const getTenantConfigVersion=async(tenantId:string,version:string):Promise<TenantRuntimeConfig|null>=>{
  const result=await pgQuery(`SELECT payload FROM tenant_runtime_configs WHERE tenant_id=$1 AND version=$2`,[tenantId,version]);
  return result.rows[0]?.payload??null;
};
