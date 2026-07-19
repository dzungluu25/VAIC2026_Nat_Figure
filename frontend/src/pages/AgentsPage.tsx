import { Activity, Braces, GitBranch, ShieldCheck } from "lucide-react";
import { Header } from "../layouts/Header";
import { OrchestrationGraph } from "../features/agent-trace/OrchestrationGraph";
import { AgentTimeline } from "../features/agent-trace/AgentTimeline";
import { useOrchestrationStore } from "../store/orchestrationStore";
import styles from "./AgentsPage.module.css";

export const AgentsPage = () => {
  const phase = useOrchestrationStore(s => s.phase);
  const steps = useOrchestrationStore(s => s.steps);
  const riskTier = useOrchestrationStore(s => s.riskTier);
  const processedSteps = steps.filter(step => step.status !== "pending" && step.status !== "in_progress").length;

  const phaseLabel = phase === "running" ? "Running" : phase === "done" ? "Completed" : "Ready";

  return (
    <>
      <Header
        eyebrow="Theo dõi điều phối"
        title="Giám sát quy trình tác tử"
        subtitle="Kiểm tra đồ thị trạng thái, các lệnh gọi công cụ, quyết định, các giai đoạn bị bỏ qua, suy giảm và các điểm dừng an toàn của từng lần thẩm định."
      />
      <div className={styles.stats}>
        <div><Activity size={17} /><span><small>Status</small><strong>{phaseLabel}</strong></span></div>
        <div><GitBranch size={17} /><span><small>Risk lane</small><strong>{riskTier ?? "Unclassified"}</strong></span></div>
        <div><Braces size={17} /><span><small>Agent steps</small><strong>{processedSteps} / {steps.length || "-"}</strong></span></div>
        <div><ShieldCheck size={17} /><span><small>Traceability</small><strong>Enabled</strong></span></div>
      </div>
      <div className={styles.layout}>
        <OrchestrationGraph />
        <AgentTimeline />
      </div>
    </>
  );
};
