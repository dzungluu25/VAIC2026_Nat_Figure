import { AgentTrace } from "../../types/trace.types";
import { queryLegalRequirements } from "../rag/legal-rag.service";
import { newId, nowIso } from "../retail/retail-common";

export const runLegalAgent = async (
  runId: string, 
  prompt: string,
  creditTrace: AgentTrace
): Promise<AgentTrace> => {
  const startedAt = nowIso();
  
  // 1. RAG query
  await queryLegalRequirements(prompt);

  // Analyze credit trace output (mocked)
  const isApproved = creditTrace.summary.includes("eligible");

  return {
    id: newId("trace-legal"),
    runId,
    agent: "legal",
    task: "Verify compliance and regulatory requirements",
    status: "completed",
    summary: isApproved 
      ? "Credit assessment complies with Reg L-22 and L-23. Cleared for operations."
      : "Credit assessment rejected. Compliance review halted.",
    toolCalls: [],
    startedAt,
    completedAt: nowIso()
  };
};
