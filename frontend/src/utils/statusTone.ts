import type { BadgeTone } from "../components/Badge";
import type { StepStatus } from "../store/orchestrationStore";
import type { FindingSeverity } from "../types/api";

export const stepStatusTone: Record<StepStatus, BadgeTone> = {
  pending: "neutral",
  in_progress: "info",
  done: "success",
  skipped: "neutral",
  degraded: "warning",
  failed: "danger",
  blocked: "danger",
};

export const stepStatusLabel: Record<StepStatus, string> = {
  pending: "Waiting",
  in_progress: "Running",
  done: "Completed",
  skipped: "Skipped by policy",
  degraded: "Degraded",
  failed: "Failed",
  blocked: "Blocked",
};

export const severityTone: Record<FindingSeverity, BadgeTone> = {
  INFO: "info",
  CONDITION: "warning",
  WARNING: "warning",
  BLOCKER: "danger",
};
