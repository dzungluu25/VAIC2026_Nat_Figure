import { Activity, BadgeCheck, CircleDollarSign } from "lucide-react";
import { Header } from "../layouts/Header";
import { PromptComposer } from "../features/chat/PromptComposer";
import { FinalAnswerPanel } from "../features/chat/FinalAnswerPanel";
import { useOrchestrationStore } from "../store/orchestrationStore";
import styles from "./DashboardPage.module.css";

export const DashboardPage = () => {
  const phase = useOrchestrationStore(s => s.phase);
  const response = useOrchestrationStore(s => s.response);
  const processedAgents = useOrchestrationStore(s =>
    s.steps.filter(step => step.status !== "pending" && step.status !== "in_progress").length
  );

  const phaseLabel =
    phase === "idle" ? "Not started" : phase === "running" ? "Processing" : phase === "error" ? "Error" : "Completed";

  return (
    <>
      <Header
        eyebrow="Tín dụng bán lẻ - NAT FIGURE"
        title="Thẩm định hồ sơ vay"
        subtitle="Nhập yêu cầu của khách hàng và theo dõi quy trình đa tác tử khi hệ thống nhận diện rủi ro, kiểm tra chính sách và chuẩn bị quyết định thẩm định."
      />

      <div className={styles.summaryBar}>
        <div><Activity size={17} /><span><small>Current run</small><strong>{phaseLabel}</strong></span></div>
        <div><BadgeCheck size={17} /><span><small>Agent processed</small><strong>{processedAgents || "-"}</strong></span></div>
        <div><CircleDollarSign size={17} /><span><small>Facility</small><strong>{response?.approvalTicketId ?? "Not created"}</strong></span></div>
      </div>

      <div className={styles.mainColumn}>
        <PromptComposer />
        <FinalAnswerPanel />
      </div>
    </>
  );
};
