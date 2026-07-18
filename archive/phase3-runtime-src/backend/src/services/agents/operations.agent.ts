import { AgentTrace } from "../../types/trace.types";
import { createApprovalTicket } from "../tools/approval-ticket.tool";
import { newId, nowIso } from "../retail/retail-common";

export const runOperationsAgent = async (
  runId: string,
  legalTrace: AgentTrace
): Promise<{ trace: AgentTrace; ticketId?: string }> => {
  const startedAt = nowIso();

  if (legalTrace.summary.includes("rejected")) {
    return {
      trace: {
        id: newId("trace-ops"),
        runId,
        agent: "operations",
        task: "Process final request",
        status: "completed",
        summary: "Process halted due to compliance rejection.",
        toolCalls: [],
        startedAt,
        completedAt: nowIso()
      }
    };
  }

  // 1. Tool call to create ticket
  const ticketResult = await createApprovalTicket({ runId, context: "Auto-approved by Legal Agent" });

  return {
    trace: {
      id: newId("trace-ops"),
      runId,
      agent: "operations",
      task: "Process final request and create ticket",
      status: "completed",
      summary: `Ticket created successfully. Operations flow completed.`,
      toolCalls: [{
        toolName: "createApprovalTicket",
        input: { runId, context: "Auto-approved by Legal Agent" },
        output: ticketResult,
        status: "success"
      }],
      startedAt,
      completedAt: nowIso()
    },
    ticketId: ticketResult.ticketId as string
  };
};
