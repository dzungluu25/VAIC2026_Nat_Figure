import { Header } from "../layouts/Header";
import { PromptComposer } from "../features/chat/PromptComposer";
import { FinalAnswerPanel } from "../features/chat/FinalAnswerPanel";
import { AgentTimeline } from "../features/agent-trace/AgentTimeline";
import { OrchestrationGraph } from "../features/agent-trace/OrchestrationGraph";
import styles from "./DashboardPage.module.css";

export const DashboardPage = () => (
  <>
    <Header title="Điều phối thẩm định tín dụng AI" subtitle="LangGraph multi-agent orchestration — SHB Retail Credit" />
    <div className={styles.layout}>
      <div className={styles.mainColumn}>
        <PromptComposer />
        <OrchestrationGraph />
        <FinalAnswerPanel />
      </div>
      <div className={styles.sideColumn}>
        <AgentTimeline />
      </div>
    </div>
  </>
);
