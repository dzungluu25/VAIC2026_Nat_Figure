import { CheckCircle2, CircleDashed, TicketCheck } from "lucide-react";
import { Card } from "../../components/Card";
import { Badge } from "../../components/Badge";
import { Skeleton } from "../../components/Skeleton";
import { TypingIndicator } from "../../components/TypingIndicator";
import { useOrchestrationStore } from "../../store/orchestrationStore";
import styles from "./FinalAnswerPanel.module.css";

export const FinalAnswerPanel = () => {
  const phase = useOrchestrationStore(s => s.phase);
  const response = useOrchestrationStore(s => s.response);
  const error = useOrchestrationStore(s => s.error);

  if (phase === "idle") {
    return (
      <Card title="Kết luận thẩm định">
        <p className={styles.empty}>Nhập yêu cầu thẩm định ở trên để bắt đầu một phiên điều phối AI.</p>
      </Card>
    );
  }

  if (phase === "error") {
    return (
      <Card title="Kết luận thẩm định">
        <div className={styles.errorBox}>{error ?? "Đã xảy ra lỗi không xác định."}</div>
      </Card>
    );
  }

  if (phase === "running" && !response) {
    return (
      <Card title="Kết luận thẩm định">
        <div className={styles.loading}>
          <TypingIndicator label="Đang tổng hợp kết luận từ các Agent…" />
          <Skeleton height={16} width="90%" />
          <Skeleton height={16} width="70%" />
        </div>
      </Card>
    );
  }

  if (!response) return null;

  return (
    <Card title="Kết luận thẩm định" action={<Badge tone="brand">Run {response.runId.replace("run-", "#")}</Badge>}>
      <p className={styles.answer}>{response.finalAnswer}</p>

      {response.approvalTicketId && (
        <div className={styles.ticket}>
          <TicketCheck size={15} />
          Facility ID: <strong>{response.approvalTicketId}</strong>
        </div>
      )}

      {response.conditions && response.conditions.length > 0 && (
        <div className={styles.conditions}>
          <p className={styles.conditionsTitle}>Điều kiện tiên quyết ({response.conditions.length})</p>
          <ul className={styles.conditionList}>
            {response.conditions.map(condition => (
              <li key={condition.id}>
                {condition.status === "fulfilled" ? (
                  <CheckCircle2 size={14} className={styles.fulfilled} />
                ) : (
                  <CircleDashed size={14} className={styles.pending} />
                )}
                <span>{condition.description}</span>
                <Badge tone="neutral">{condition.blocksAt}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
};
