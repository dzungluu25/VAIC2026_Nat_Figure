import { Response } from "express";
import { executeOrchestration, streamOrchestration } from "../services/orchestration/planner.service";
import { getOrchestrationRun } from "../services/orchestration/trace.service";
import { OrchestrationRequest, OrchestrationStreamEvent } from "../types/orchestration.types";
import { AuthenticatedRequest } from "../middleware/auth.middleware";

export const orchestratePrompt = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { prompt, approvalToken } = req.body as OrchestrationRequest;
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }
    // req.user is guaranteed by the requireAuth middleware mounted on this route.
    const requestedBy = req.user!.sub;

    const result = await executeOrchestration(prompt, requestedBy, approvalToken);
    return res.status(200).json(result);
  } catch (error) {
    console.error("Orchestration error:", error);
    return res.status(500).json({ error: "Internal server error during orchestration" });
  }
};

/**
 * NDJSON (newline-delimited JSON) streaming variant: one OrchestrationStreamEvent per
 * line, flushed as each pipeline stage completes. Chosen over SSE/EventSource because
 * this is a POST carrying an Authorization header, which EventSource cannot send.
 */
export const orchestratePromptStream = async (req: AuthenticatedRequest, res: Response) => {
  const { prompt, approvalToken } = req.body as OrchestrationRequest;
  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }
  const requestedBy = req.user!.sub;

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");

  const writeEvent = (event: OrchestrationStreamEvent) => {
    res.write(`${JSON.stringify(event)}\n`);
  };

  try {
    await streamOrchestration(prompt, requestedBy, approvalToken, writeEvent);
  } catch (error) {
    console.error("Orchestration stream error:", error);
    writeEvent({ type: "error", message: "Internal server error during orchestration" });
  } finally {
    res.end();
  }
};

export const getRunTraces = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { runId } = req.params;
    const run = getOrchestrationRun(runId);
    
    if (!run) {
      return res.status(404).json({ error: "Run not found" });
    }

    return res.status(200).json(run);
  } catch (error) {
    return res.status(500).json({ error: "Internal server error fetching traces" });
  }
};
