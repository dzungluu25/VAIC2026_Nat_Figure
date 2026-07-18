import { Request, Response } from "express";
import {
  ApprovalError,
  approveRetailCaseRun,
  buildDemoCaseRun,
  getRetailCaseAudit,
  getRetailCaseRun,
  listDemoCases,
  runDemoCase,
} from "../services/orchestration/retail-case.service";
import { evaluateKhcnCases, renderKhcnEvaluationMarkdown } from "../services/retail/evaluation.service";
import {
  buildRetailGovernanceReport,
  explainRetailDecision,
  getModelGatewayStatus,
} from "../services/retail/model-gateway.service";
import { getProductionReadinessReport } from "../services/retail/production-readiness.service";
import { buildAgentNetworkReport } from "../services/retail/agent-network.service";

export const listCases = async (_req: Request, res: Response) => {
  return res.status(200).json({ cases: await listDemoCases() });
};

export const runCase = async (req: Request, res: Response) => {
  const { caseId } = req.params;
  const run = await runDemoCase(caseId);

  if (!run) {
    return res.status(404).json({ error: `Unknown demo case: ${caseId}` });
  }

  return res.status(201).json(run);
};

export const previewCase = async (req: Request, res: Response) => {
  const { caseId } = req.params;
  const run = await buildDemoCaseRun(caseId);

  if (!run) {
    return res.status(404).json({ error: `Unknown demo case: ${caseId}` });
  }

  return res.status(200).json({
    run,
    governance: await buildRetailGovernanceReport(run),
  });
};

export const previewCaseAgentNetwork = async (req: Request, res: Response) => {
  const { caseId } = req.params;
  const run = await buildDemoCaseRun(caseId);

  if (!run) {
    return res.status(404).json({ error: `Unknown demo case: ${caseId}` });
  }

  return res.status(200).json({
    run,
    agentNetwork: buildAgentNetworkReport(run),
  });
};

export const getRequest = async (req: Request, res: Response) => {
  const { requestId } = req.params;
  const run = await getRetailCaseRun(requestId);

  if (!run) {
    return res.status(404).json({ error: `Unknown request: ${requestId}` });
  }

  return res.status(200).json(run);
};

export const approveRequest = async (req: Request, res: Response) => {
  const { requestId } = req.params;
  const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
  const headerValue = (name: string) => {
    const value = req.headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  };

  try {
    const run = await approveRetailCaseRun(requestId, {
      reviewerId: typeof body.reviewerId === "string" ? body.reviewerId : headerValue("x-reviewer-id"),
      reviewerRole: typeof body.reviewerRole === "string" ? body.reviewerRole : headerValue("x-reviewer-role"),
      decision: body.decision === "APPROVE" || body.decision === "REJECT" ? body.decision : undefined,
      approvalIntent: typeof body.approvalIntent === "string" ? body.approvalIntent : headerValue("x-approval-intent"),
      idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : headerValue("idempotency-key"),
    });

    if (!run) {
      return res.status(404).json({ error: `Unknown request: ${requestId}` });
    }

    return res.status(200).json(run);
  } catch (error) {
    if (error instanceof ApprovalError) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    throw error;
  }
};

export const getRequestAudit = async (req: Request, res: Response) => {
  const { requestId } = req.params;
  const audit = await getRetailCaseAudit(requestId);

  if (!audit) {
    return res.status(404).json({ error: `Unknown request: ${requestId}` });
  }

  return res.status(200).json({ requestId, audit });
};

export const getRequestGovernance = async (req: Request, res: Response) => {
  const { requestId } = req.params;
  const run = await getRetailCaseRun(requestId);

  if (!run) {
    return res.status(404).json({ error: `Unknown request: ${requestId}` });
  }

  return res.status(200).json(await buildRetailGovernanceReport(run));
};

export const getRequestAgentNetwork = async (req: Request, res: Response) => {
  const { requestId } = req.params;
  const run = await getRetailCaseRun(requestId);

  if (!run) {
    return res.status(404).json({ error: `Unknown request: ${requestId}` });
  }

  return res.status(200).json(buildAgentNetworkReport(run));
};

export const getKhcnEvaluation = async (_req: Request, res: Response) => {
  return res.status(200).json(await evaluateKhcnCases());
};

export const getKhcnEvaluationMarkdown = async (_req: Request, res: Response) => {
  return res.status(200).json({ markdown: await renderKhcnEvaluationMarkdown() });
};

export const getModelGateway = (_req: Request, res: Response) => {
  return res.status(200).json(getModelGatewayStatus());
};

export const getProductionReadiness = async (_req: Request, res: Response) => {
  return res.status(200).json(await getProductionReadinessReport());
};

export const explainRequestWithModel = async (req: Request, res: Response) => {
  const { requestId } = req.params;
  const run = await getRetailCaseRun(requestId);

  if (!run) {
    return res.status(404).json({ error: `Unknown request: ${requestId}` });
  }

  const result = await explainRetailDecision({
    requestId: run.requestId,
    caseId: run.caseId,
    approvalRoute: run.approvalRoute,
    gateStatus: run.gateStatus,
    status: run.status,
    finalAnswer: run.finalAnswer,
    conditions: run.conditions.map((condition) => ({
      blocksAt: condition.blocksAt,
      basisRuleId: condition.basisRuleId,
      text: condition.text,
    })),
    governance: run.governance,
  });

  return res.status(200).json(result);
};
