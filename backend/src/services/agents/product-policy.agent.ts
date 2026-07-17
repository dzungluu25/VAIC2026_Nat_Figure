import { AgentTrace } from "../../types/trace.types";
import { ProductOption, PricingOffer, DecisionEnvelope } from "../../types/agent.types";
import { getCachedPolicy, setCachedPolicy } from "../governance/semantic-cache.service";
import { loadRetailCase } from "../data/retail-case-loader";

export const runProductPolicyAgent = async (
  runId: string,
  caseId: string,
  isReprice: boolean = false
): Promise<AgentTrace> => {
  const startedAt = new Date().toISOString();

  // 1. Try to read from Redis cache
  const cacheKey = `product-policy:${caseId}:reprice:${isReprice}`;
  const cachedTraceStr = await getCachedPolicy(cacheKey);
  if (cachedTraceStr) {
    try {
      const cachedTrace = JSON.parse(cachedTraceStr) as AgentTrace;
      // Refresh IDs and timestamps to look fresh
      cachedTrace.id = `trace-product-${Date.now()}`;
      cachedTrace.runId = runId;
      cachedTrace.startedAt = startedAt;
      cachedTrace.completedAt = new Date().toISOString();
      return cachedTrace;
    } catch (e) {
      console.warn("Failed to parse cached product policy trace, recalculating:", e);
    }
  }

  const retailCase = await loadRetailCase(caseId);

  if (!retailCase) {
    return {
      id: `trace-product-${Date.now()}`,
      runId,
      agent: "product",
      task: "Retrieve product policies and match eligibility",
      status: "failed",
      summary: "Case data not found.",
      toolCalls: [],
      startedAt,
      completedAt: new Date().toISOString()
    };
  }

  // Match eligible products
  const homeLoanProduct: ProductOption = {
    productId: "PROD-HOME-MORTGAGE",
    name: "Vay mua nhà dự án SHB",
    baseRate: 0.083, // 8.3%
    preferentialRate: 0.075, // 7.5%
    tenureYearsMax: 25,
    insuranceRequired: false
  };

  const eligibleProducts: ProductOption[] = [homeLoanProduct];

  if (retailCase.refinanceAutoLoan) {
    eligibleProducts.push({
      productId: "PROD-AUTO-REFINANCE",
      name: "Tái tài trợ ô tô SHB",
      baseRate: 0.095, // 9.5%
      preferentialRate: 0.089, // 8.9%
      tenureYearsMax: 8,
      insuranceRequired: false
    });
  }

  // Build pricing offer with the initial "trap"
  let appliedRate = homeLoanProduct.baseRate; // 8.3%
  let insuranceTyingApplied = false;
  let note = "";
  const findings: DecisionEnvelope[] = [];

  if (isReprice) {
    // Re-priced scenario: preferential rate 7.5% for all, no tying
    appliedRate = homeLoanProduct.preferentialRate;
    insuranceTyingApplied = false;
    note = "Ưu đãi lãi suất 7.5% được áp dụng vô điều kiện (Bảo hiểm không bắt buộc).";
    
    findings.push({
      decisionId: `dec-product-reprice-${Date.now()}`,
      agent: "product",
      status: "PASS",
      severity: "INFO",
      blocksAt: "NONE",
      finding: "Đã tái lập định giá khoản vay: Lãi suất 7.5% không đi kèm điều kiện mua bảo hiểm.",
      evidence: { appliedRate, insuranceTyingApplied },
      ruleIds: ["PRODUCT_REPRICE_CLEAN"],
      citations: ["Chính sách định giá SHB - Phiên bản điều chỉnh tuân thủ"]
    });
  } else {
    // Initial pricing offer (TRAP): 7.5% if insurance is accepted, 8.3% if declined.
    if (retailCase.insurancePreference === "accepted") {
      appliedRate = homeLoanProduct.preferentialRate; // 7.5%
      insuranceTyingApplied = true;
      note = "Lãi suất ưu đãi 7.5% đi kèm điều kiện tham gia bảo hiểm nhân thọ.";
    } else {
      appliedRate = homeLoanProduct.baseRate; // 8.3%
      insuranceTyingApplied = true;
      note = "Lãi suất 8.3% do khách hàng từ chối tham gia gói bảo hiểm nhân thọ đi kèm.";
    }

    findings.push({
      decisionId: `dec-product-pricing-trap-${Date.now()}`,
      agent: "product",
      status: "PASS",
      severity: "WARNING",
      blocksAt: "NONE",
      finding: `Áp dụng gói định giá ưu đãi: Lãi suất 7.5% nếu mua bảo hiểm, ngược lại là ${homeLoanProduct.baseRate * 100}%.`,
      evidence: { appliedRate, insuranceTyingApplied, preference: retailCase.insurancePreference },
      ruleIds: ["PRODUCT_PRICING_INSURANCE_TYING"],
      citations: ["Chính sách bán chéo sản phẩm SHB - Hướng dẫn 2026"]
    });
  }

  // Monthly payment estimate
  const monthlyPaymentEstimate = Math.round(
    (retailCase.requestedLoan.amount * (appliedRate / 12)) /
      (1 - Math.pow(1 + appliedRate / 12, -(retailCase.requestedLoan.tenureYears * 12)))
  );

  const pricingOffer: PricingOffer = {
    selectedProduct: homeLoanProduct,
    appliedRate,
    monthlyPaymentEstimate,
    insuranceTyingApplied,
    note
  };

  const summary = `Đã đối chiếu chính sách sản phẩm. Tìm thấy ${eligibleProducts.length} sản phẩm phù hợp. Đề xuất gói định giá mua nhà: Lãi suất ${(appliedRate * 100).toFixed(1)}%/năm, ước tính trả gốc lãi hàng tháng: ${monthlyPaymentEstimate.toLocaleString()} VND. ${note}`;

  const traceResult: AgentTrace = {
    id: `trace-product-${Date.now()}`,
    runId,
    agent: "product",
    task: "Retrieve product policies and match eligibility",
    status: "completed",
    summary,
    toolCalls: [
      {
        toolName: "matchEligibleProducts",
        input: { customerSegment: "retail", requestedLoan: retailCase.requestedLoan },
        output: { eligibleProducts },
        status: "success"
      },
      {
        toolName: "buildPricingOffer",
        input: { options: eligibleProducts, insurancePreference: retailCase.insurancePreference, isReprice },
        output: pricingOffer as unknown as Record<string, unknown>,
        status: "success"
      }
    ],
    findings,
    startedAt,
    completedAt: new Date().toISOString()
  };

  // Write compiled trace back to Redis cache
  await setCachedPolicy(cacheKey, JSON.stringify(traceResult));

  return traceResult;
};
