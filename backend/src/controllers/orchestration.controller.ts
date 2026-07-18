import { Response } from "express";
import { executeOrchestration, streamOrchestration } from "../services/orchestration/planner.service";
import { getOrchestrationRun } from "../services/orchestration/trace.service";
import { extractDraftCaseFromPrompt } from "../services/orchestration/case-extraction.service";
import { OrchestrationRequest, OrchestrationStreamEvent } from "../types/orchestration.types";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import { AGENT_CONTRACTS } from "../services/orchestration/agent-role-registry";
import { OrchestrationInputError } from "../services/orchestration/input-router.service";
import { toPublicOrchestrationError } from "../services/orchestration/orchestration-error.service";
import { regulatoryBaseline } from "../config/policy";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const structuredCasePrompt = (retailCase: unknown): string => {
  if (!isRecord(retailCase)) return "Structured retail credit case submitted from form.";
  const requestedLoan = isRecord(retailCase.requestedLoan) ? retailCase.requestedLoan : {};
  const amount = typeof requestedLoan.amount === "number" ? ` Loan amount: ${requestedLoan.amount} VND.` : "";
  const tenure = typeof requestedLoan.tenureYears === "number" ? ` Tenure: ${requestedLoan.tenureYears} years.` : "";
  return `Structured retail credit case submitted from form.${amount}${tenure}`;
};

const parseOrchestrationBody = (body: unknown): OrchestrationRequest & { prompt: string } => {
  const request = (isRecord(body) ? body : {}) as OrchestrationRequest;
  const hasPrompt = typeof request.prompt === "string" && request.prompt.trim().length > 0;
  const hasRetailCaseField = Object.prototype.hasOwnProperty.call(request, "retailCase");
  const hasRetailCase = isRecord(request.retailCase);
  if (request.prompt !== undefined && typeof request.prompt !== "string") {
    throw new OrchestrationInputError("INVALID_INPUT", "Prompt must be a string when provided.");
  }
  if (hasRetailCaseField && !hasRetailCase) {
    throw new OrchestrationInputError("INVALID_INPUT", "retailCase must be an object when provided.");
  }
  if (!hasPrompt && !hasRetailCase) {
    throw new OrchestrationInputError("INVALID_INPUT", "Prompt or retailCase is required.");
  }
  return {
    ...request,
    prompt: hasPrompt ? request.prompt!.trim() : structuredCasePrompt(request.retailCase),
  };
};

export const orchestratePrompt = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { prompt, retailCase, approvalToken, caseId } = parseOrchestrationBody(req.body);
    // req.user is guaranteed by the requireAuth middleware mounted on this route.
    const requestedBy = req.user!.sub;

    const result = await executeOrchestration(prompt, requestedBy, approvalToken, caseId, req.user!.tenantId, retailCase);
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof OrchestrationInputError) {
      return res.status(422).json({ error: error.message, code: error.code, questions: error.questions });
    }
    console.error("Orchestration error:", error);
    const publicError = toPublicOrchestrationError(error);
    return res.status(publicError.httpStatus).json({ error: publicError.message, code: publicError.code });
  }
};

/**
 * NDJSON (newline-delimited JSON) streaming variant: one OrchestrationStreamEvent per
 * line, flushed as each pipeline stage completes. Chosen over SSE/EventSource because
 * this is a POST carrying an Authorization header, which EventSource cannot send.
 */
export const orchestratePromptStream = async (req: AuthenticatedRequest, res: Response) => {
  let request: OrchestrationRequest & { prompt: string };
  try {
    request = parseOrchestrationBody(req.body);
  } catch (error) {
    if (error instanceof OrchestrationInputError) {
      return res.status(422).json({ error: error.message, code: error.code, questions: error.questions });
    }
    return res.status(400).json({ error: "Invalid orchestration request", code: "INVALID_INPUT" });
  }
  const { prompt, retailCase, approvalToken, caseId } = request;
  const requestedBy = req.user!.sub;

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");

  const writeEvent = (event: OrchestrationStreamEvent) => {
    res.write(`${JSON.stringify(event)}\n`);
  };

  try {
    await streamOrchestration(prompt, requestedBy, approvalToken, writeEvent, caseId, req.user!.tenantId, retailCase);
  } catch (error) {
    if (error instanceof OrchestrationInputError) {
      writeEvent({ type: "error", message: error.message, code: error.code, questions: error.questions });
    } else {
      console.error("Orchestration stream error:", error);
      const publicError = toPublicOrchestrationError(error);
      writeEvent({ type: "error", message: publicError.message, code: publicError.code });
    }
  } finally {
    res.end();
  }
};

export const getRunTraces = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { runId } = req.params;
    const run = await getOrchestrationRun(runId, req.user!.tenantId);
    
    if (!run) {
      return res.status(404).json({ error: "Run not found" });
    }

    return res.status(200).json(run);
  } catch (error) {
    return res.status(500).json({ error: "Internal server error fetching traces" });
  }
};

export const getAgentContracts = async (_req: AuthenticatedRequest, res: Response) =>
  res.status(200).json({ agents: AGENT_CONTRACTS });

export const getRegulatoryBaseline = async (_req: AuthenticatedRequest, res: Response) =>
  res.status(200).json(regulatoryBaseline);

export const extractDraftCase = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { prompt } = req.body as { prompt: string };
    if (typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ error: "Prompt is required" });
    }
    const result = await extractDraftCaseFromPrompt(prompt.trim());
    return res.status(200).json(result);
  } catch (error) {
    console.error("Draft extraction handler error:", error);
    return res.status(500).json({ error: "Internal server error performing draft extraction" });
  }
};
