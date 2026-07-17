import type { BadgeTone } from "../components/Badge";
import type { StepStatus } from "../store/orchestrationStore";
import type { FindingSeverity } from "../types/api";

export const stepStatusTone: Record<StepStatus, BadgeTone> = {
  pending: "neutral",
  in_progress: "info",
  done: "success",
  skipped: "neutral",
};

export const stepStatusLabel: Record<StepStatus, string> = {
  pending: "Chờ xử lý",
  in_progress: "Đang xử lý",
  done: "Hoàn tất",
  skipped: "Bỏ qua",
};

export const severityTone: Record<FindingSeverity, BadgeTone> = {
  INFO: "info",
  CONDITION: "warning",
  WARNING: "warning",
  BLOCKER: "danger",
};
