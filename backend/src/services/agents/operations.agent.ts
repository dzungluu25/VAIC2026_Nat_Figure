import { AgentTrace, ToolCallTrace } from "../../types/trace.types";
import { ConditionPrecedent } from "../../types/agent.types";
import { loadRetailCase } from "../data/retail-case-loader";
import { verifyAccessToken } from "../../config/auth";
import { recordAuditEvent } from "../governance/audit-log.service";

/**
 * Verifies the approval token is a genuine, unexpired JWT signed for a CREDIT_APPROVER —
 * replaces the previous static-string comparison ("SHB-ADMIN-token-99"), which allowed
 * anyone who read the frontend source to forge a valid approval.
 */
const verifyApprovalToken = (approvalToken?: string): { approved: boolean; approverActor?: string } => {
  if (!approvalToken) {
    return { approved: false };
  }
  try {
    const payload = verifyAccessToken(approvalToken);
    if (payload.role !== "CREDIT_APPROVER") {
      return { approved: false };
    }
    return { approved: true, approverActor: payload.sub };
  } catch {
    return { approved: false };
  }
};

export const runOperationsAgent = async (
  runId: string,
  caseId: string,
  finalDecision: "FAST_PASS" | "PASS" | "CONDITIONAL_PASS" | "REJECTED" | "HUMAN_ESCALATION",
  conditions: ConditionPrecedent[],
  approvalToken?: string
): Promise<{ trace: AgentTrace; ticketId?: string }> => {
  const startedAt = new Date().toISOString();

  const retailCase = await loadRetailCase(caseId);

  if (!retailCase) {
    return {
      trace: {
        id: `trace-ops-${Date.now()}`,
        runId,
        agent: "operations",
        task: "Execute banking operations and create records",
        status: "failed",
        summary: "Case data not found.",
        toolCalls: [],
        startedAt,
        completedAt: new Date().toISOString()
      }
    };
  }

  const toolCalls: ToolCallTrace[] = [];
  let summary = "";
  let ticketId: string | undefined;
  let status: "completed" | "pending" | "failed" = "completed";

  // Check decision
  if (finalDecision === "REJECTED") {
    status = "completed";
    summary = `Hồ sơ tín dụng bị Từ chối. Operations Agent tạo thông báo email/SMS từ chối gửi cho khách hàng ${retailCase.demographic.name} và lưu trữ hồ sơ lưu trữ lịch sử vay ở trạng thái REJECTED.`;
    
    toolCalls.push({
      toolName: "sendClientRejectionNotification",
      input: { email: retailCase.demographic.email, reason: "Không đạt chỉ tiêu thẩm định tín dụng ngân hàng." },
      output: { notificationSent: true, channel: "email" },
      status: "success"
    });
  } else if (finalDecision === "FAST_PASS" || finalDecision === "PASS") {
    ticketId = `SHB-FACILITY-OK-${Math.floor(100000 + Math.random() * 900000)}`;
    summary = `Phê duyệt thành công. Khởi tạo khế ước vay thành công trên hệ thống Core Banking (Facility ID: ${ticketId}). Đã gửi SMS/Email chúc mừng khách hàng.`;

    toolCalls.push({
      toolName: "registerCoreBankingFacility",
      input: { customerId: retailCase.customerId, loanAmount: retailCase.requestedLoan.amount, status: "ACTIVE" },
      output: { facilityId: ticketId, registrationStatus: "SUCCESS" },
      status: "success"
    });

    toolCalls.push({
      toolName: "sendClientApprovalNotification",
      input: { phone: retailCase.demographic.phone, email: retailCase.demographic.email, ticketId },
      output: { smsSent: true, emailSent: true },
      status: "success"
    });
  } else if (finalDecision === "CONDITIONAL_PASS") {
    // Check Human-in-the-Loop Token Gate: the approval token must be a genuine JWT
    // signed for a CREDIT_APPROVER identity, not a shared static secret.
    const { approved: hasValidToken, approverActor } = verifyApprovalToken(approvalToken);

    if (!hasValidToken) {
      status = "pending";
      summary = `Hồ sơ đạt trạng thái Phê duyệt có điều kiện. Đang CHỜ CON NGƯỜI (Human-in-the-Loop) ký duyệt bằng chữ ký số HSM để đẩy khế ước lên Core Banking.`;

      toolCalls.push({
        toolName: "assertHumanApprovalTokenGate",
        input: { hasToken: false },
        output: { approved: false, reason: "Chờ khóa số xác nhận từ người kiểm duyệt tín dụng." },
        status: "success"
      });
    } else {
      ticketId = `SHB-FACILITY-COND-${Math.floor(100000 + Math.random() * 900000)}`;
      status = "completed";
      summary = `Người duyệt ${approverActor} đã ký duyệt (Token approved). Đã tạo khế ước vay có điều kiện trên Core Banking (Facility ID: ${ticketId}) ở trạng thái PENDING_CONDITIONS. Vui lòng hoàn tất điều kiện trước giải ngân.`;

      toolCalls.push({
        toolName: "assertHumanApprovalTokenGate",
        input: { hasToken: true },
        output: { approved: true, authorizedActor: approverActor },
        status: "success"
      });

      await recordAuditEvent(
        runId,
        approverActor!,
        "human_approval",
        { ticketId, customerId: retailCase.customerId, conditionsCount: conditions.length },
        "allowed",
        `Chuyên viên phê duyệt ${approverActor} đã ký duyệt hồ sơ có điều kiện (Facility ${ticketId}).`
      );

      toolCalls.push({
        toolName: "registerCoreBankingFacility",
        input: { 
          customerId: retailCase.customerId, 
          loanAmount: retailCase.requestedLoan.amount, 
          status: "PENDING_CONDITIONS", 
          conditionsCount: conditions.length 
        },
        output: { facilityId: ticketId, registrationStatus: "SUCCESS" },
        status: "success"
      });
    }
  } else {
    status = "completed";
    summary = `Hồ sơ ở trạng thái HUMAN_ESCALATION. Chuyển tiếp hồ sơ sang hàng đợi duyệt thủ công của Ủy ban tín dụng.`;

    toolCalls.push({
      toolName: "escalateToCreditCommittee",
      input: { caseId },
      output: { escalationStatus: "QUEUED", queueName: "COMMITTEE_LEVEL_2" },
      status: "success"
    });
  }

  return {
    trace: {
      id: `trace-ops-${Date.now()}`,
      runId,
      agent: "operations",
      task: "Execute banking operations and create records",
      status,
      summary,
      toolCalls,
      startedAt,
      completedAt: new Date().toISOString()
    },
    ticketId
  };
};
