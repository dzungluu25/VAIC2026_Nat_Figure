import { AgentTrace } from "../../types/trace.types";
import { calculateIncomeAfterHaircut, calculateCurrentMonthlyDebt, applyLivingExpenseFloor } from "../calculators/dti.calculator";
import { evaluateCreditRules } from "../rules/credit-rule-engine";
import { loadRetailCase } from "../data/retail-case-loader";
import { RetailCase } from "../../types/case.types";

export interface CreditAgentPolicyOverrides {
  maximumDtiPercent?: number;
  maximumLtvPercentByPropertyType?: Record<RetailCase["property"]["type"], number>;
  incomeRecognitionFactors?: Record<"salary" | "freelance" | "rental", number>;
  minimumMonthlyLivingExpenseVnd?: number;
}

export const runCreditAgent = async (
  runId: string,
  caseId: string,
  tenantId = "bank-default",
  overrides: CreditAgentPolicyOverrides = {}
): Promise<AgentTrace> => {
  const startedAt = new Date().toISOString();

  const retailCase = await loadRetailCase(caseId, tenantId);

  if (!retailCase) {
    return {
      id: `trace-credit-${Date.now()}`,
      runId,
      agent: "credit",
      task: "Assess credit risk and calculate financial ratios",
      status: "failed",
      summary: "Case data not found.",
      toolCalls: [],
      startedAt,
      completedAt: new Date().toISOString()
    };
  }

  const validIncome = calculateIncomeAfterHaircut(retailCase.incomeSources, overrides.incomeRecognitionFactors);
  const disposableIncome = applyLivingExpenseFloor(validIncome, overrides.minimumMonthlyLivingExpenseVnd);
  const currentMonthlyDebt = calculateCurrentMonthlyDebt(retailCase.currentDebts);

  const assessment = evaluateCreditRules(runId, disposableIncome, currentMonthlyDebt, retailCase, {
    maximumDtiPercent: overrides.maximumDtiPercent,
    maximumLtvPercentByPropertyType: overrides.maximumLtvPercentByPropertyType
  });

  const summary = `Đã phân tích báo cáo tài chính rủi ro. Thu nhập hợp lệ sau giảm trừ (Haircut): ${validIncome.toLocaleString()} VND, sau khi trừ chi phí sinh hoạt tối thiểu còn ${disposableIncome.toLocaleString()} VND. Tổng nợ phải trả hàng tháng hiện tại: ${currentMonthlyDebt.toLocaleString()} VND. Trạng thái phân vùng thẩm định: [${assessment.creditDecision}].`;

  return {
    id: `trace-credit-${Date.now()}`,
    runId,
    agent: "credit",
    task: "Assess credit risk and calculate financial ratios",
    status: "completed",
    summary,
    toolCalls: [
      {
        toolName: "calculateIncomeAfterHaircut",
        input: { incomeSources: retailCase.incomeSources },
        output: { validIncome },
        status: "success"
      },
      {
        toolName: "applyLivingExpenseFloor",
        input: { validIncome, minimumMonthlyLivingExpenseVnd: overrides.minimumMonthlyLivingExpenseVnd },
        output: { disposableIncome },
        status: "success"
      },
      {
        toolName: "calculateCurrentMonthlyDebt",
        input: { debts: retailCase.currentDebts },
        output: { currentMonthlyDebt },
        status: "success"
      },
      {
        toolName: "evaluateCreditRules",
        input: { validIncome: disposableIncome, currentMonthlyDebt, requestedLoan: retailCase.requestedLoan },
        output: assessment as unknown as Record<string, unknown>,
        status: "success"
      }
    ],
    findings: assessment.findings,
    startedAt,
    completedAt: new Date().toISOString()
  };
};
