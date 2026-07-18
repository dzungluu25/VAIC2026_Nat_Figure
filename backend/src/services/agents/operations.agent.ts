import { AgentTrace, ToolCallTrace } from "../../types/trace.types";
import { ConditionPrecedent } from "../../types/agent.types";
import { loadRetailCase } from "../data/retail-case-loader";
import { verifyAccessToken } from "../../config/auth";
import { recordAuditEvent } from "../governance/audit-log.service";
import { ApprovedLoanTerms, ApprovalMode } from "../../types/product.types";
import { randomUUID } from "crypto";
import { enforcePolicyGate, executeSaga } from "../platform/action-saga.service";
import { ActionStepResult, CompensationResult } from "../../types/platform.types";

/**
 * Verifies the approval token is a genuine, unexpired JWT signed for a CREDIT_APPROVER —
 * replaces the previous static-string comparison ("SHB-ADMIN-token-99"), which allowed
 * anyone who read the frontend source to forge a valid approval.
 */
const verifyApprovalToken = (approvalToken: string | undefined, tenantId: string): { approved: boolean; approverActor?: string } => {
  if (!approvalToken) {
    return { approved: false };
  }
  try {
    const payload = verifyAccessToken(approvalToken);
    if (payload.role !== "CREDIT_APPROVER" || payload.tenantId !== tenantId) {
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
  approvalToken?: string,
  approvalMode: ApprovalMode = "HYBRID_APPROVAL",
  approvedTerms?: ApprovedLoanTerms,
  tenantId = "bank-default",
  persistedApprovalGranted = false,
  persistedApproverActor?: string,
  workflowAllowsAction = false,
  allowedActionTools: string[] = []
): Promise<{ trace: AgentTrace; ticketId?: string; actionResults: ActionStepResult[]; compensationResults: CompensationResult[]; manualInterventionRequired: boolean }> => {
  const startedAt = new Date().toISOString();

  const retailCase = await loadRetailCase(caseId, tenantId);

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
      },actionResults:[],compensationResults:[],manualInterventionRequired:false
    };
  }

  const toolCalls: ToolCallTrace[] = [];
  let summary = "";
  let ticketId: string | undefined;
  let status: "completed" | "pending" | "failed" = "completed";
  let actionResults:ActionStepResult[]=[];
  let compensationResults:CompensationResult[]=[];
  let manualInterventionRequired=false;

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
  } else if (finalDecision === "FAST_PASS" && approvalMode === "AUTO_APPROVAL" && approvedTerms) {
    ticketId = `SHB-FACILITY-OK-${randomUUID()}`;
    summary = `Auto-policy đã cấp quyền trong đúng hạn mức. Khởi tạo khế ước vay ${approvedTerms.loanAmount.toLocaleString()} VND trên Core Banking (Facility ID: ${ticketId}).`;

    toolCalls.push({
      toolName: "registerCoreBankingFacility",
      input: { customerId: retailCase.customerId, loanAmount: approvedTerms.loanAmount, tenureYears: approvedTerms.tenureYears, approvalMode, status: "ACTIVE" },
      output: { facilityId: ticketId, registrationStatus: "SUCCESS" },
      status: "success"
    });

    toolCalls.push({
      toolName: "sendClientApprovalNotification",
      input: { phone: retailCase.demographic.phone, email: retailCase.demographic.email, ticketId },
      output: { smsSent: true, emailSent: true },
      status: "success"
    });
  } else if (finalDecision === "CONDITIONAL_PASS" || finalDecision === "PASS") {
    // Check Human-in-the-Loop Token Gate: the approval token must be a genuine JWT
    // signed for a CREDIT_APPROVER identity, not a shared static secret.
    const tokenApproval = verifyApprovalToken(approvalToken, tenantId);
    const hasValidToken = persistedApprovalGranted || tokenApproval.approved;
    const approverActor = persistedApproverActor ?? tokenApproval.approverActor;

    if (!hasValidToken) {
      status = "pending";
      summary = `Hồ sơ thuộc luồng HYBRID_APPROVAL. Đang chờ người có thẩm quyền duyệt đề xuất trước mọi thao tác ghi Core Banking.`;

      toolCalls.push({
        toolName: "assertHumanApprovalTokenGate",
        input: { hasToken: false },
        output: { approved: false, reason: "Chờ khóa số xác nhận từ người kiểm duyệt tín dụng." },
        status: "success"
      });
    } else {
      ticketId = `SHB-FACILITY-${finalDecision === "PASS" ? "OK" : "COND"}-${randomUUID()}`;
      status = "completed";
      const facilityStatus = finalDecision === "PASS" ? "ACTIVE" : "PENDING_CONDITIONS";
      summary = `Người duyệt ${approverActor} đã ký duyệt. Đã tạo khế ước ${approvedTerms?.loanAmount.toLocaleString() ?? "—"} VND trên Core Banking (${ticketId}) ở trạng thái ${facilityStatus}.`;

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
          loanAmount: approvedTerms?.loanAmount,
          tenureYears: approvedTerms?.tenureYears,
          status: finalDecision === "PASS" ? "ACTIVE" : "PENDING_CONDITIONS",
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

  if(ticketId&&status==="completed"){
    const requiredTools=["reserveCreditLimit","createLoanCase","createRmTask","updateCrmStatus"];
    enforcePolicyGate({tenantId,runTenantId:tenantId,workflowAllowsAction,toolAllowed:requiredTools.every(tool=>allowedActionTools.includes(tool)),approvalRequired:approvalMode!=="AUTO_APPROVAL",approvalGranted:approvalMode==="AUTO_APPROVAL"||persistedApprovalGranted||verifyApprovalToken(approvalToken,tenantId).approved,idempotencyKey:`${tenantId}:${runId}:loan-activation`});
    const saga=await executeSaga(tenantId,runId,[
      {id:"reserveCreditLimit",maxAttempts:2,execute:async()=>({reservationId:`RES-${runId}`,status:"RESERVED"}),compensate:async()=>({reservationId:`RES-${runId}`,status:"RELEASED"})},
      {id:"createLoanCase",maxAttempts:2,execute:async()=>({facilityId:ticketId!,status:finalDecision==="PASS"||finalDecision==="FAST_PASS"?"ACTIVE":"PENDING_CONDITIONS"}),compensate:async()=>({facilityId:ticketId!,status:"CANCELLED"})},
      {id:"createRmTask",execute:async()=>({taskId:`RM-${runId}`,status:"CREATED"}),compensate:async()=>({taskId:`RM-${runId}`,status:"CANCELLED"})},
      {id:"updateCrmStatus",execute:async()=>({caseId,status:"APPROVED"}),compensate:async()=>({caseId,status:"REVIEW_REQUIRED"})},
    ]);
    actionResults=saga.actions; compensationResults=saga.compensations; manualInterventionRequired=saga.manualInterventionRequired;
    for(const result of actionResults) toolCalls.push({toolName:result.stepId,input:{idempotencyKey:result.idempotencyKey},output:{status:result.status,attempts:result.attempts,...result.output,error:result.error},status:result.status==="completed"?"success":"failed"});
    for(const result of compensationResults) toolCalls.push({toolName:`compensate:${result.stepId}`,input:{runId},output:{status:result.status,...result.output,error:result.error},status:result.status==="completed"?"success":"failed"});
    if(actionResults.some(result=>result.status==="failed")){status="failed";ticketId=undefined;summary=manualInterventionRequired?"Saga thất bại và có compensation không thành công; bắt buộc xử lý thủ công.":"Saga thất bại; các action đã hoàn tác thành công.";}
  }
  if(!ticketId&&status==="completed"&&(finalDecision==="REJECTED"||finalDecision==="HUMAN_ESCALATION")){
    const stepId=finalDecision==="REJECTED"?"sendRejectionNotification":"escalateCreditCommittee";
    enforcePolicyGate({tenantId,runTenantId:tenantId,workflowAllowsAction,toolAllowed:allowedActionTools.includes(stepId),approvalRequired:false,approvalGranted:false,idempotencyKey:`${tenantId}:${runId}:${stepId}`});
    const saga=await executeSaga(tenantId,runId,[{id:stepId,execute:async()=>finalDecision==="REJECTED"?{notificationSent:true,channel:"email"}:{escalationStatus:"QUEUED",queueName:"COMMITTEE_LEVEL_2"},compensate:async()=>finalDecision==="REJECTED"?{notificationCancelled:true}:{escalationStatus:"CANCELLED"}}]);
    actionResults=saga.actions;compensationResults=saga.compensations;manualInterventionRequired=saga.manualInterventionRequired;
    for(const result of actionResults)toolCalls.push({toolName:result.stepId,input:{idempotencyKey:result.idempotencyKey},output:{status:result.status,...result.output,error:result.error},status:result.status==="completed"?"success":"failed"});
    if(actionResults.some(result=>result.status==="failed")){status="failed";summary=manualInterventionRequired?"Action thất bại và cần xử lý thủ công.":"Action thất bại và đã được hoàn tác.";}
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
    ticketId,actionResults,compensationResults,manualInterventionRequired
  };
};
