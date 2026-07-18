import { AuditEvent, RetailCaseRun } from "../../types/orchestration.types";
import { canExecuteHighSideEffect, issueHumanApprovalToken } from "../retail/approval.service";
import { buildApprovedHybridExecution } from "../retail/execution.service";
import { findKhcnCaseFixture, fixturesToSummaries, loadKhcnCaseFixtures } from "../retail/case-fixture.service";
import { buildRetailCaseRunFromFixture } from "../retail/khcn-engine.service";
import { getRetailRun, getRetailRunAudit, saveRetailRun } from "../retail/retail-run.repository";
import { agentTrace, auditEvent, nowIso } from "../retail/retail-common";

export interface ApprovalDecisionInput {
  reviewerId?: string;
  reviewerRole?: string;
  decision?: "APPROVE" | "REJECT";
  approvalIntent?: string;
  idempotencyKey?: string;
}

export class ApprovalError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
  }
}

const legacyCaseAliases: Record<string, string> = {
  fast_001_clean_small_loan: "case_02_fast_clean",
  complex_001_home_future_property_refinance: "case_01_complex_main",
};

const reviewerRoles = new Set(["DEMO_REVIEWER", "CREDIT_REVIEWER", "SENIOR_CREDIT_REVIEWER"]);

const saveRun = (
  run: RetailCaseRun,
  eventType: "RUN_SAVED" | "RUN_APPROVED" = "RUN_SAVED",
  actor = "system",
  metadata?: Record<string, unknown>
) => saveRetailRun(run, eventType, actor, metadata);

export const buildApprovalIntent = (run: RetailCaseRun) =>
  `APPROVE:${run.requestId}:${run.gateStatus}:${run.conditions.length}`;

export const listDemoCases = async () => fixturesToSummaries(await loadKhcnCaseFixtures());

export const buildDemoCaseRun = async (caseId: string): Promise<RetailCaseRun | undefined> => {
  const normalized = caseId.toLowerCase();
  const fixture = await findKhcnCaseFixture(legacyCaseAliases[normalized] ?? caseId);
  return fixture ? buildRetailCaseRunFromFixture(fixture) : undefined;
};

export const runDemoCase = async (caseId: string): Promise<RetailCaseRun | undefined> => {
  const run = await buildDemoCaseRun(caseId);
  return run ? saveRun(run) : undefined;
};

export const getRetailCaseRun = (requestId: string): Promise<RetailCaseRun | undefined> => getRetailRun(requestId);

export const getRetailCaseAudit = (requestId: string): Promise<AuditEvent[] | undefined> => getRetailRunAudit(requestId);

const validateApprovalDecision = (run: RetailCaseRun, input: ApprovalDecisionInput) => {
  if (!input.reviewerId || input.reviewerId.trim().length < 3) {
    throw new ApprovalError("Missing reviewerId for human approval.", 401);
  }

  if (!input.reviewerRole || !reviewerRoles.has(input.reviewerRole)) {
    throw new ApprovalError("Reviewer role is not authorized for human approval.", 403);
  }

  if (input.decision !== "APPROVE") {
    throw new ApprovalError("Only explicit APPROVE decisions can execute HIGH side-effect actions.", 422);
  }

  const requiredIntent = buildApprovalIntent(run);
  if (input.approvalIntent !== requiredIntent) {
    throw new ApprovalError("Approval intent does not match the current request state.", 409);
  }

  if (run.approvalRoute !== "HYBRID_APPROVAL" || run.status !== "WAITING_HUMAN_APPROVAL") {
    throw new ApprovalError("Request is not waiting for human approval.", 409);
  }
};

export const approveRetailCaseRun = (
  requestId: string,
  input: ApprovalDecisionInput = {}
): Promise<RetailCaseRun | undefined> => approveRetailCaseRunAsync(requestId, input);

const approveRetailCaseRunAsync = async (
  requestId: string,
  input: ApprovalDecisionInput = {}
): Promise<RetailCaseRun | undefined> => {
  const run = await getRetailRun(requestId);
  if (!run) {
    return undefined;
  }

  if (run.approvalRoute === "AUTO_APPROVAL") {
    return run;
  }

  if (run.status === "COMPLETED" && run.humanApprovalToken) {
    return run;
  }

  validateApprovalDecision(run, input);
  const reviewerId = input.reviewerId ?? "UNKNOWN_REVIEWER";
  const reviewerRole = input.reviewerRole ?? "UNKNOWN_ROLE";

  const humanApprovalToken = issueHumanApprovalToken();
  if (!canExecuteHighSideEffect(run.approvalRoute, run.autoApprovalToken, humanApprovalToken)) {
    return run;
  }

  const execution = buildApprovedHybridExecution(humanApprovalToken, run.gateStatus, run.conditions.length);
  const approvalTrace = agentTrace(
    requestId,
    "operations",
    "Execute hybrid actions after human approval",
    "Human approval token received. Guarded execution completed.",
    execution.toolCalls
  );

  const updated: RetailCaseRun = {
    ...run,
    status: "COMPLETED",
    humanApprovalToken,
    requiresHumanApproval: false,
    finalAnswer:
      "HYBRID_APPROVAL completed. Human reviewer approved the conditional pass and controlled LOS/Core actions executed.",
    executionActions: execution.actions,
    traces: [...run.traces, approvalTrace],
    audit: [
      ...run.audit,
      auditEvent(requestId, reviewerId, "HUMAN_APPROVED", "Human approval token issued.", {
        humanApprovalToken,
        reviewerRole,
        approvalIntent: input.approvalIntent,
        idempotencyKey: input.idempotencyKey,
      }),
      auditEvent(requestId, "operations", "EXECUTED", "Hybrid HIGH side-effect tools executed after approval."),
    ],
    updatedAt: nowIso(),
  };

  return saveRun(updated, "RUN_APPROVED", reviewerId, {
    reviewerRole,
    approvalIntent: input.approvalIntent,
    idempotencyKey: input.idempotencyKey,
  });
};
