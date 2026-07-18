import { Info } from "lucide-react";
import { Card } from "../../components/Card";
import { Badge } from "../../components/Badge";
import { StatTile } from "../../components/StatTile";
import { ComparisonBar } from "./ComparisonBar";
import { SINGLE_AGENT_BASELINE } from "./baseline";
import { useOrchestrationStore } from "../../store/orchestrationStore";
import { formatDurationMs, formatTimestamp } from "../../utils/formatters";
import styles from "./PerformanceComparison.module.css";

export const PerformanceComparison = () => {
  const history = useOrchestrationStore(s => s.history);
  const latest = history[0];

  if (!latest) {
    return (
      <Card title="So sánh hiệu năng: Multi-Agent vs Chatbot đơn lẻ">
        <p className={styles.empty}>Chạy ít nhất một phiên điều phối để xem số liệu hiệu năng thực tế.</p>
      </Card>
    );
  }

  return (
    <div className={styles.stack}>
      <Card title="Kết quả lần chạy gần nhất" action={<Badge tone="brand">{latest.runId.replace("run-", "#")}</Badge>}>
        <div className={styles.tiles}>
          <StatTile label="Thời gian xử lý" value={formatDurationMs(latest.durationMs)} tone="brand" />
          <StatTile label="Số bước Agent" value={latest.agentStepCount} />
          <StatTile label="Số lần gọi Tool" value={latest.toolCallCount} />
          <StatTile label="Số lượt gọi LLM" value={latest.modelCallsUsed} />
        </div>
      </Card>

      <Card
        title="Multi-Agent Orchestration vs Chatbot đơn lẻ (1 LLM call)"
        action={
          <span className={styles.legend}>
            <span className={styles.legendDot} data-tone="multi" /> Multi-Agent
            <span className={styles.legendDot} data-tone="baseline" /> Chatbot đơn lẻ
          </span>
        }
      >
        <ComparisonBar
          label="Thời gian hoàn thành"
          multiAgentValue={latest.durationMs}
          baselineValue={SINGLE_AGENT_BASELINE.durationMs}
          formatValue={formatDurationMs}
          higherIsMore={false}
        />
        <ComparisonBar
          label="Số bước xử lý (Agent steps)"
          multiAgentValue={latest.agentStepCount}
          baselineValue={SINGLE_AGENT_BASELINE.agentStepCount}
          formatValue={v => String(v)}
        />
        <ComparisonBar
          label="Số lần gọi Tool / API"
          multiAgentValue={latest.toolCallCount}
          baselineValue={SINGLE_AGENT_BASELINE.toolCallCount}
          formatValue={v => String(v)}
        />
        <ComparisonBar
          label="Số lượt gọi LLM"
          multiAgentValue={latest.modelCallsUsed}
          baselineValue={SINGLE_AGENT_BASELINE.modelCallsUsed}
          formatValue={v => String(v)}
        />

        <div className={styles.qualitative}>
          <div>
            <span className={styles.qualLabel}>Khả năng truy vết & tuân thủ</span>
            <p className={styles.qualMulti}>Multi-Agent: Hash-chained audit log, trích dẫn quy định thực tế, kiểm soát 4 cổng tuân thủ.</p>
            <p className={styles.qualBaseline}>Chatbot đơn lẻ: {SINGLE_AGENT_BASELINE.auditability}, {SINGLE_AGENT_BASELINE.grounding.toLowerCase()}.</p>
          </div>
        </div>

        <p className={styles.disclaimer}>
          <Info size={12} />
          Số liệu Multi-Agent được đo trực tiếp từ lần chạy thực tế gần nhất. Số liệu Chatbot đơn lẻ là{" "}
          <strong>ước tính minh họa</strong> (1 lệnh gọi LLM, không tool-calling, không truy vấn dữ liệu) — không phải kết quả đo từ một
          hệ thống chạy song song.
        </p>
      </Card>

      {history.length > 1 && (
        <Card title="Lịch sử các lần chạy">
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Run</th>
                <th>Thời gian</th>
                <th>Bước</th>
                <th>Tool calls</th>
                <th>LLM calls</th>
                <th>Lúc</th>
              </tr>
            </thead>
            <tbody>
              {history.map(run => (
                <tr key={run.runId}>
                  <td>{run.runId.replace("run-", "#")}</td>
                  <td>{formatDurationMs(run.durationMs)}</td>
                  <td>{run.agentStepCount}</td>
                  <td>{run.toolCallCount}</td>
                  <td>{run.modelCallsUsed}</td>
                  <td>{formatTimestamp(new Date(run.completedAt).toISOString())}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
};
