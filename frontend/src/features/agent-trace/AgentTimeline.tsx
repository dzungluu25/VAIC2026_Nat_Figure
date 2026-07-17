import { CheckCircle2, CircleDashed, Loader2, MinusCircle } from "lucide-react";
import { Card } from "../../components/Card";
import { Badge } from "../../components/Badge";
import { Skeleton } from "../../components/Skeleton";
import { TypingIndicator } from "../../components/TypingIndicator";
import { ToolCallLog } from "./ToolCallLog";
import { FindingsList } from "./FindingsList";
import { useOrchestrationStore, type PipelineStep, type StepStatus } from "../../store/orchestrationStore";
import { stepStatusLabel, stepStatusTone } from "../../utils/statusTone";
import { formatDurationMs, formatTimestamp } from "../../utils/formatters";
import styles from "./AgentTimeline.module.css";

const STEP_ICON: Record<StepStatus, typeof CheckCircle2> = {
  pending: CircleDashed,
  in_progress: Loader2,
  done: CheckCircle2,
  skipped: MinusCircle,
};

const stepDurationMs = (step: PipelineStep): number | null => {
  if (!step.trace?.completedAt) return null;
  return new Date(step.trace.completedAt).getTime() - new Date(step.trace.startedAt).getTime();
};

const StepRow = ({ step, isLast }: { step: PipelineStep; isLast: boolean }) => {
  const Icon = STEP_ICON[step.status];
  const duration = stepDurationMs(step);

  return (
    <li className={styles.item}>
      <div className={styles.markerColumn}>
        <span className={[styles.marker, styles[step.status]].join(" ")}>
          <Icon size={14} className={step.status === "in_progress" ? styles.spin : undefined} />
        </span>
        {!isLast && <span className={styles.connector} />}
      </div>

      <div className={styles.content}>
        <div className={styles.headerRow}>
          <span className={styles.label}>{step.label}</span>
          <div className={styles.headerMeta}>
            {duration !== null && <span className={styles.duration}>{formatDurationMs(duration)}</span>}
            <Badge tone={stepStatusTone[step.status]} pulse={step.status === "in_progress"}>
              {stepStatusLabel[step.status]}
            </Badge>
          </div>
        </div>

        {step.status === "pending" && (
          <div className={styles.skeletonBlock}>
            <Skeleton height={12} width="85%" />
            <Skeleton height={12} width="60%" />
          </div>
        )}

        {step.status === "in_progress" && <TypingIndicator label="Agent đang xử lý…" />}

        {step.status === "skipped" && <p className={styles.skippedNote}>Không thuộc luồng xử lý của hồ sơ này.</p>}

        {step.status === "done" && step.trace && (
          <>
            <p className={styles.summary}>{step.trace.summary}</p>
            {step.trace.findings && <FindingsList findings={step.trace.findings} />}
            <ToolCallLog toolCalls={step.trace.toolCalls} />
            {step.trace.completedAt && <span className={styles.timestamp}>{formatTimestamp(step.trace.completedAt)}</span>}
          </>
        )}
      </div>
    </li>
  );
};

export const AgentTimeline = () => {
  const steps = useOrchestrationStore(s => s.steps);
  const phase = useOrchestrationStore(s => s.phase);

  if (phase === "idle") {
    return (
      <Card title="Luồng xử lý Agent (LangGraph Orchestration)">
        <p className={styles.empty}>Chưa có phiên điều phối nào đang chạy.</p>
      </Card>
    );
  }

  return (
    <Card title="Luồng xử lý Agent (LangGraph Orchestration)">
      <ol className={styles.timeline}>
        {steps.map((step, idx) => (
          <StepRow key={step.key} step={step} isLast={idx === steps.length - 1} />
        ))}
      </ol>
    </Card>
  );
};
