import { AgentTrace } from "../../types/trace.types";
import { loadRetailCase } from "../data/retail-case-loader";

export const runCustomerProfileAgent = async (
  runId: string,
  caseId: string
): Promise<AgentTrace> => {
  const startedAt = new Date().toISOString();

  const retailCase = await loadRetailCase(caseId);

  if (!retailCase) {
    return {
      id: `trace-profile-${Date.now()}`,
      runId,
      agent: "profile",
      task: "Retrieve and normalize customer profile",
      status: "failed",
      summary: `Không tìm thấy hồ sơ cho caseId: ${caseId}`,
      toolCalls: [],
      startedAt,
      completedAt: new Date().toISOString()
    };
  }

  // Normalization logic
  const summary = `Đã tải thành công hồ sơ khách hàng ${retailCase.demographic.name} (${retailCase.demographic.age} tuổi, ${retailCase.demographic.maritalStatus === "married" ? "Đã kết hôn" : "Độc thân"}). Đã chuẩn hóa nguồn thu nhập (${retailCase.incomeSources.length} nguồn) và nghĩa vụ nợ (${retailCase.currentDebts.length} khoản nợ).`;

  return {
    id: `trace-profile-${Date.now()}`,
    runId,
    agent: "profile",
    task: "Retrieve and normalize customer profile",
    status: "completed",
    summary,
    toolCalls: [
      {
        toolName: "loadCustomerProfile",
        input: { caseId },
        output: {
          customerId: retailCase.customerId,
          demographic: {
            name: retailCase.demographic.name,
            age: retailCase.demographic.age,
            maritalStatus: retailCase.demographic.maritalStatus
          }
        },
        status: "success"
      },
      {
        toolName: "loadConsentRegistry",
        input: { customerId: retailCase.customerId },
        output: retailCase.consent as unknown as Record<string, unknown>,
        status: "success"
      }
    ],
    startedAt,
    completedAt: new Date().toISOString()
  };
};
