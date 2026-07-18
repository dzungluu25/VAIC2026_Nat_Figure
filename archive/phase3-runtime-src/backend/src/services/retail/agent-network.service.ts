import { RetailCaseRun } from "../../types/orchestration.types";
import { AgentRole } from "../../types/agent.types";

const agentProfiles: Record<AgentRole, { label: string; bankingDomain: string; responsibility: string }> = {
  router: {
    label: "Routing Agent",
    bankingDomain: "Retail risk triage",
    responsibility: "Classify the request and choose the approval lane.",
  },
  planner: {
    label: "Planner Agent",
    bankingDomain: "Orchestration",
    responsibility: "Decompose the case into specialist work packages and dependencies.",
  },
  credit: {
    label: "Credit Expert Agent",
    bankingDomain: "Credit policy and affordability",
    responsibility: "Compute income haircut, DTI/LTV, restructure options, and proposed amount.",
  },
  legal: {
    label: "Legal and Compliance Agent",
    bankingDomain: "Legal, consent, and product conduct",
    responsibility: "Ground findings in legal/policy rules and create blocking conditions.",
  },
  gate: {
    label: "Compliance Gate Agent",
    bankingDomain: "Decision control",
    responsibility: "Merge credit/legal/security outputs into the final gate status.",
  },
  operations: {
    label: "Operations Agent",
    bankingDomain: "LOS/Core execution",
    responsibility: "Prepare operational actions and enforce approval-token guards.",
  },
  system: {
    label: "Security Agent",
    bankingDomain: "AI safety",
    responsibility: "Detect prompt injection and prevent unsafe model-facing instructions.",
  },
};

const artifactByAgent: Partial<Record<AgentRole, string>> = {
  router: "routing decision and required specialist list",
  planner: "dependency graph and execution order",
  credit: "credit proposal, DTI/LTV, and restructuring levers",
  legal: "legal findings and condition set",
  system: "sanitized prompt-injection scan result",
  gate: "gate status and approval route",
  operations: "execution plan with side-effect guard state",
};

export const buildAgentNetworkReport = (run: RetailCaseRun) => {
  const specialists = run.traces.map((trace, index) => {
    const profile = agentProfiles[trace.agent];
    return {
      agent: trace.agent,
      label: profile.label,
      bankingDomain: profile.bankingDomain,
      responsibility: profile.responsibility,
      task: trace.task,
      status: trace.status,
      decision: trace.summary,
      toolCount: trace.toolCalls.length,
      tools: trace.toolCalls.map((toolCall) => ({
        name: toolCall.toolName,
        status: toolCall.status,
      })),
      sequence: index + 1,
    };
  });

  const handoffs = run.traces.slice(0, -1).map((trace, index) => {
    const nextTrace = run.traces[index + 1];
    return {
      from: trace.agent,
      to: nextTrace.agent,
      artifact: artifactByAgent[trace.agent] ?? "agent output",
      status: nextTrace.status === "failed" ? "FAILED" : nextTrace.status === "blocked" ? "BLOCKED" : "DELIVERED",
    };
  });

  const orchestrationPlan = run.traces.map((trace, index) => ({
    step: index + 1,
    assignedAgent: trace.agent,
    task: trace.task,
    dependsOn: index === 0 ? [] : [run.traces[index - 1].agent],
    status: trace.status,
    output: trace.summary,
  }));

  const toolCalls = run.traces.flatMap((trace) => trace.toolCalls.map((toolCall) => ({ agent: trace.agent, ...toolCall })));
  const highSideEffectActions = run.executionActions.filter((action) => action.sideEffect === "HIGH");
  const blockedHighActions = highSideEffectActions.filter((action) => action.status === "BLOCKED");
  const operationalActions = run.executionActions.filter((action) => action.sideEffect !== "NONE");

  return {
    reportId: `AGENT-NETWORK-${run.requestId}`,
    requestId: run.requestId,
    caseId: run.caseId,
    title: run.title,
    objective: "Digital Expert Agents collaborate on one banking operation case and execute guarded actions.",
    specialists,
    orchestrationPlan,
    handoffs,
    toolUseSummary: {
      agentCount: new Set(run.traces.map((trace) => trace.agent)).size,
      toolCallCount: toolCalls.length,
      operationalActionCount: operationalActions.length,
      highSideEffectActionCount: highSideEffectActions.length,
      blockedHighSideEffectCount: blockedHighActions.length,
      auditEventCount: run.audit.length,
      usesInternalKnowledge: toolCalls.some((toolCall) =>
        ["legal", "credit", "compliance_gate"].some((prefix) => toolCall.toolName.startsWith(prefix))
      ),
      executesBankingActions: operationalActions.length > 0,
    },
    decisionSynthesis: {
      riskTier: run.riskTier,
      approvalRoute: run.approvalRoute,
      gateStatus: run.gateStatus,
      lifecycleStatus: run.status,
      finalAnswer: run.finalAnswer,
      conditions: run.conditions.map((condition) => ({
        blocksAt: condition.blocksAt,
        ruleId: condition.basisRuleId,
        text: condition.text,
      })),
    },
    singleAgentComparison: {
      baseline: {
        name: "Single chatbot baseline",
        expectedBehavior: "Return a textual recommendation without specialist decomposition or operational tool execution.",
        toolCallCount: 0,
        missingCapabilities: [
          "No explicit planner dependency graph",
          "No specialist credit/legal/operations separation",
          "No auditable handoff chain",
          "No HIGH side-effect approval guard",
        ],
      },
      multiAgent: {
        name: "Digital Expert Agents",
        expectedBehavior: "Plan, delegate to specialists, use tools, ground decisions, and prepare guarded bank actions.",
        toolCallCount: toolCalls.length,
        coveredDomains: specialists.map((specialist) => specialist.bankingDomain),
      },
    },
  };
};
