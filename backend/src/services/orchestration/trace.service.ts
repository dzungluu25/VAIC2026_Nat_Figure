import { OrchestrationResponse } from "../../types/orchestration.types";
import { pgQuery } from "../../config/pg";

// Fallback only: Postgres is the source of truth for completed orchestration runs.
const orchestrationStore: Record<string, OrchestrationResponse> = {};

export const saveOrchestrationRun = async (runId: string, data: OrchestrationResponse) => {
  orchestrationStore[runId] = data;
  try {
    await pgQuery(
      `INSERT INTO orchestration_runs (run_id, case_id, prompt, status, response_payload)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (run_id) DO UPDATE
       SET status = EXCLUDED.status,
           response_payload = EXCLUDED.response_payload`,
      [
        runId,
        data.traces[0]?.toolCalls.find(call => call.toolName === "detectRiskTier")?.output?.caseId ?? null,
        data.traces[0]?.toolCalls.find(call => call.toolName === "detectRiskTier")?.input?.prompt ?? null,
        data.traces.some(trace => trace.status === "failed") ? "failed" : "completed",
        JSON.stringify(data),
      ]
    );
  } catch (error) {
    console.warn("Postgres trace persistence failed; using in-memory fallback for this process:", error);
  }
};

export const getOrchestrationRun = async (runId: string): Promise<OrchestrationResponse | null> => {
  try {
    const result = await pgQuery(
      "SELECT response_payload FROM orchestration_runs WHERE run_id = $1",
      [runId]
    );
    const payload = result.rows[0]?.response_payload;
    if (payload) {
      return payload as OrchestrationResponse;
    }
  } catch (error) {
    console.warn("Postgres trace lookup failed; using in-memory fallback for this process:", error);
  }
  return orchestrationStore[runId] || null;
};
