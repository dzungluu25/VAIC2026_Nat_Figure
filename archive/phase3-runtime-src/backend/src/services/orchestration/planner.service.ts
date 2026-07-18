import { OrchestrationResponse } from "../../types/orchestration.types";
import { runCreditAgent } from "../agents/credit.agent";
import { runLegalAgent } from "../agents/legal.agent";
import { runOperationsAgent } from "../agents/operations.agent";
import { saveOrchestrationRun } from "./trace.service";
import { newId, nowIso } from "../retail/retail-common";

export const executeMockOrchestration = async (prompt: string): Promise<OrchestrationResponse> => {
  const runId = newId("run");
  const traces = [];

  // 1. Planner interprets prompt (mocked)
  traces.push({
    id: newId("trace-planner"),
    runId,
    agent: "planner" as const,
    task: "Analyze prompt and determine workflow",
    status: "completed" as const,
    summary: "Identified need for Credit Assessment, Legal Verification, and Operations Ticketing.",
    toolCalls: [],
    startedAt: nowIso(),
    completedAt: nowIso()
  });

  // 2. Credit Agent
  const creditTrace = await runCreditAgent(runId, prompt);
  traces.push(creditTrace);

  // 3. Legal Agent
  const legalTrace = await runLegalAgent(runId, prompt, creditTrace);
  traces.push(legalTrace);

  // 4. Operations Agent
  const { trace: opsTrace, ticketId } = await runOperationsAgent(runId, legalTrace);
  traces.push(opsTrace);

  const response: OrchestrationResponse = {
    runId,
    finalAnswer: ticketId 
      ? `Request approved and processed. Ticket ID: ${ticketId}` 
      : "Request rejected due to compliance or credit issues.",
    traces,
    approvalTicketId: ticketId
  };

  await saveOrchestrationRun(runId, response);
  return response;
};
