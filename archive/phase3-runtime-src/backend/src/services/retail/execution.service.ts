import { ExecutionAction, GateStatus } from "../../types/orchestration.types";
import { ToolCallTrace } from "../../types/trace.types";
import { highAction, newId } from "./retail-common";

export const buildFastExecution = (autoApprovalToken: string) => ({
  actions: [
    highAction("los.create_retail_approval", "CREATED", "Auto approval record created inside demo policy."),
    highAction("notification.notify_customer", "SENT", "Customer notified with auto-approved checklist."),
    {
      tool: "audit.append_event",
      sideEffect: "LOW",
      status: "APPENDED",
      requiresApprovalToken: false,
      message: "Auto approval audit event appended.",
    } satisfies ExecutionAction,
  ],
  toolCalls: [
    {
      toolName: "los.create_retail_approval",
      input: { approval_token: autoApprovalToken, amount: 150000000 },
      output: { status: "CREATED", approval_id: newId("LOS-AUTO") },
      status: "success",
    },
    {
      toolName: "notification.notify_customer",
      input: { approval_token: autoApprovalToken, channel: "MOBILE_APP" },
      output: { status: "SENT" },
      status: "success",
    },
  ] satisfies ToolCallTrace[],
});

export const buildBlockedHybridActions = (): ExecutionAction[] => [
  highAction("los.create_retail_approval", "BLOCKED", "Waiting for human_approval_token."),
  highAction("docs.render_approval_letter", "BLOCKED", "Waiting for human_approval_token."),
  highAction("core.create_facility_pending", "BLOCKED", "Waiting for human_approval_token."),
  highAction("core.set_condition_precedent", "BLOCKED", "Waiting for human_approval_token."),
  highAction("notification.send_customer_checklist", "BLOCKED", "Waiting for human_approval_token."),
  {
    tool: "audit.append_event",
    sideEffect: "LOW",
    status: "APPENDED",
    requiresApprovalToken: false,
    message: "Hybrid conditional pass audit event appended.",
  },
];

export const buildBlockedHybridToolCalls = (): ToolCallTrace[] => [
  {
    toolName: "external.verify_income_bhxh",
    input: { consent_scope: "INCOME_VERIFICATION_BHXH" },
    output: { status: "BLOCKED", error: "ConsentRequired", outbound_calls_made: 0 },
    status: "failed",
  },
  {
    toolName: "los.create_retail_approval",
    input: { approval_route: "HYBRID_APPROVAL", human_approval_token: null },
    output: { status: "BLOCKED", error: "Missing human_approval_token" },
    status: "failed",
  },
];

export const buildApprovedHybridExecution = (
  humanApprovalToken: string,
  gateStatus: GateStatus,
  conditionCount: number
) => ({
  actions: [
    highAction("los.create_retail_approval", "CREATED", "Hybrid LOS approval created after human approval."),
    highAction("docs.render_approval_letter", "CREATED", "Approval letter rendered after human approval."),
    highAction("core.create_facility_pending", "CREATED", "Pending facility created after human approval."),
    highAction("core.set_condition_precedent", "CREATED", "Condition precedents stored after human approval."),
    highAction("notification.send_customer_checklist", "SENT", "Customer checklist sent after human approval."),
    {
      tool: "audit.append_event",
      sideEffect: "LOW",
      status: "APPENDED",
      requiresApprovalToken: false,
      message: "Human approval and execution audit event appended.",
    } satisfies ExecutionAction,
  ],
  toolCalls: [
    {
      toolName: "saga.prepare_execution_plan",
      input: {
        human_approval_token: humanApprovalToken,
        steps: ["los.create_retail_approval", "core.create_facility_pending", "core.set_condition_precedent"],
      },
      output: {
        status: "PREPARED",
        compensation_plan: [
          "core.cancel_facility_pending",
          "los.void_retail_approval",
          "audit.append_compensation_event",
        ],
      },
      status: "success",
    },
    {
      toolName: "los.create_retail_approval",
      input: { human_approval_token: humanApprovalToken, gate_status: gateStatus },
      output: { status: "CREATED", approval_id: newId("LOS-HYBRID") },
      status: "success",
    },
    {
      toolName: "core.create_facility_pending",
      input: { human_approval_token: humanApprovalToken, amount: 2250000000 },
      output: { status: "CREATED", facility_status: "PENDING_CONDITIONS" },
      status: "success",
    },
    {
      toolName: "core.set_condition_precedent",
      input: { human_approval_token: humanApprovalToken, condition_count: conditionCount },
      output: { status: "CREATED", condition_count: conditionCount },
      status: "success",
    },
    {
      toolName: "notification.send_customer_checklist",
      input: { human_approval_token: humanApprovalToken },
      output: { status: "SENT" },
      status: "success",
    },
    {
      toolName: "saga.commit_execution_plan",
      input: { human_approval_token: humanApprovalToken, condition_count: conditionCount },
      output: { status: "COMMITTED", rollback_required: false },
      status: "success",
    },
  ] satisfies ToolCallTrace[],
});
