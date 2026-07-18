import { create } from "zustand";
import type { AgentRole, AgentTrace, OrchestrationResponse, OrchestrationStreamEvent, RiskTier } from "../types/api";
import { deriveStepKey, stepTemplateForRiskTier, STEP_AGENT, STEP_LABELS, type StepKey } from "../utils/parseAgentState";

export type StepStatus = "pending" | "in_progress" | "done" | "skipped" | "degraded" | "failed" | "blocked";

export interface PipelineStep {
  key: StepKey;
  label: string;
  agent: AgentRole;
  status: StepStatus;
  trace?: AgentTrace;
}

export type RunPhase = "idle" | "running" | "done" | "error";

export interface RunMetrics {
  runId: string;
  prompt: string;
  durationMs: number;
  agentStepCount: number;
  toolCallCount: number;
  modelCallsUsed: number;
  finalAnswer: string;
  completedAt: number;
}

interface OrchestrationStoreState {
  phase: RunPhase;
  prompt: string;
  runId?: string;
  riskTier?: RiskTier;
  startedAt?: number;
  steps: PipelineStep[];
  response?: OrchestrationResponse;
  advisoryMode?: "ADVISORY_QA" | "OUT_OF_DOMAIN";
  advisoryFinalAnswer?: string;
  error?: string;
  history: RunMetrics[];

  startRun: (prompt: string) => void;
  applyStreamEvent: (event: OrchestrationStreamEvent) => void;
  fail: (message: string) => void;
  reset: () => void;
}

const buildStep = (key: StepKey, status: StepStatus): PipelineStep => ({
  key,
  label: STEP_LABELS[key],
  agent: STEP_AGENT[key],
  status,
});

const insertAfter = (items: StepKey[], anchor: StepKey, key: StepKey): StepKey[] => {
  if (items.includes(key)) return items;
  const anchorIndex = items.indexOf(anchor);
  const insertAt = anchorIndex === -1 ? items.length : anchorIndex + 1;
  return [...items.slice(0, insertAt), key, ...items.slice(insertAt)];
};

const expandTemplate = (riskTier: RiskTier | undefined, existing: Map<StepKey, PipelineStep>): StepKey[] => {
  let template = stepTemplateForRiskTier(riskTier);
  if (existing.has("auto_policy")) template = insertAfter(template, "fraud", "auto_policy");
  if (existing.has("self-correction")) template = insertAfter(template, "legal", "self-correction");
  return template;
};

const processedStatusForTrace = (trace: AgentTrace): StepStatus => {
  if (trace.executionStatus === "skipped_by_policy") return "skipped";
  if (trace.executionStatus === "degraded") return "degraded";
  if (trace.executionStatus === "terminal_failure" || trace.status === "failed" || trace.status === "blocked") return "failed";
  return "done";
};

const isUnfinished = (step: PipelineStep): boolean =>
  step.status === "pending" || step.status === "in_progress";

export const useOrchestrationStore = create<OrchestrationStoreState>()((set, get) => ({
  phase: "idle",
  prompt: "",
  steps: [],
  history: [],

  startRun: prompt =>
    set({
      phase: "running",
      prompt,
      runId: undefined,
      riskTier: undefined,
      startedAt: Date.now(),
      steps: [],
      response: undefined,
      advisoryMode: undefined,
      advisoryFinalAnswer: undefined,
      error: undefined,
    }),

  applyStreamEvent: event => {
    const state = get();

    if (event.type === "node_lifecycle" || event.type === "validation" || event.type === "approval" || event.type === "action" || event.type === "compensation") {
      set({ runId: state.runId ?? event.runId });
      return;
    }

    if (event.type === "terminal") {
      // The final event carries the user-facing business outcome. A fail-closed
      // terminal status is expected for blocked required stages and should not hide
      // the response behind a generic transport-error screen.
      set({ runId: state.runId ?? event.runId });
      return;
    }

    if (event.type === "node_update") {
      let steps = state.steps;
      const riskTier = event.riskTier ?? state.riskTier;

      if (steps.length === 0) {
        steps = stepTemplateForRiskTier(riskTier).map((key, idx) => buildStep(key, idx === 0 ? "in_progress" : "pending"));
      } else if (riskTier && state.riskTier && riskTier !== state.riskTier) {
        const existing = new Map(steps.map(step => [step.key, step]));
        steps = expandTemplate(riskTier, existing).map(key => existing.get(key) ?? buildStep(key, "pending"));
      }

      const stepKey = deriveStepKey(event.trace);
      let idx = steps.findIndex(s => s.key === stepKey);

      if (idx === -1) {
        const anchorByStep: Partial<Record<StepKey, StepKey>> = {
          "self-correction": "legal",
          auto_policy: "fraud",
          legal: "auto_policy",
          human_approval: "risk",
          operations: "human_approval",
        };
        const anchor = anchorByStep[stepKey];
        const anchorIdx = anchor ? steps.findIndex(s => s.key === anchor) : -1;
        const insertAt = anchorIdx === -1 ? steps.length : anchorIdx + 1;
        steps = [...steps.slice(0, insertAt), buildStep(stepKey, "pending"), ...steps.slice(insertAt)];
        idx = insertAt;
      }

      const completedStatus = processedStatusForTrace(event.trace);
      const isTerminalBlock = completedStatus === "failed";

      steps = steps.map((s, i) => {
        if (i === idx) return { ...s, status: completedStatus, trace: event.trace };
        if (!isTerminalBlock && i === idx + 1 && s.status === "pending") return { ...s, status: "in_progress" };
        return s;
      });

      set({ steps, runId: state.runId ?? event.trace.runId, riskTier });
      return;
    }

    if (event.type === "final") {
      const unfinishedStatus: StepStatus = event.response.terminalFailure ? "blocked" : "skipped";
      const steps = state.steps.map(s => (isUnfinished(s) ? { ...s, status: unfinishedStatus } : s));
      const completedAt = Date.now();
      const durationMs = state.startedAt ? completedAt - state.startedAt : 0;
      const toolCallCount = event.response.traces.reduce((sum, t) => sum + t.toolCalls.length, 0);

      const metrics: RunMetrics = {
        runId: event.response.runId,
        prompt: state.prompt,
        durationMs,
        agentStepCount: event.response.traces.length,
        toolCallCount,
        modelCallsUsed: event.response.budgetStatus?.modelCallsUsed ?? 0,
        finalAnswer: event.response.finalAnswer,
        completedAt,
      };

      set({
        phase: "done",
        steps,
        response: event.response,
        error: undefined,
        history: [metrics, ...state.history].slice(0, 20),
      });
      return;
    }

    if (event.type === "advisory_final") {
      const template = stepTemplateForRiskTier(state.riskTier);
      const steps = template.map((key, idx) =>
        idx === 0 ? { ...buildStep(key, "done" as StepStatus), trace: event.response.plannerTrace } : buildStep(key, "skipped" as StepStatus)
      );
      const completedAt = Date.now();
      const durationMs = state.startedAt ? completedAt - state.startedAt : 0;

      const metrics: RunMetrics = {
        runId: event.response.runId,
        prompt: state.prompt,
        durationMs,
        agentStepCount: 1,
        toolCallCount: event.response.plannerTrace.toolCalls.length,
        modelCallsUsed: event.response.plannerTrace.toolCalls.length > 0 ? 1 : 0,
        finalAnswer: event.response.finalAnswer,
        completedAt,
      };

      set({
        phase: "done",
        steps,
        runId: event.response.runId,
        advisoryMode: event.response.mode,
        advisoryFinalAnswer: event.response.finalAnswer,
        error: undefined,
        history: [metrics, ...state.history].slice(0, 20),
      });
      return;
    }

    set({ phase: "error", error: event.message });
  },

  fail: message => set({ phase: "error", error: message }),

  reset: () =>
    set({
      phase: "idle",
      prompt: "",
      runId: undefined,
      riskTier: undefined,
      steps: [],
      response: undefined,
      advisoryMode: undefined,
      advisoryFinalAnswer: undefined,
      error: undefined,
    }),
}));
