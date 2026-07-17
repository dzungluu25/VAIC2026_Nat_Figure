import { Header } from "../layouts/Header";
import { PerformanceComparison } from "../features/metrics/PerformanceComparison";

export const MetricsPage = () => (
  <>
    <Header title="Hiệu năng hệ thống" subtitle="So sánh quy trình Multi-Agent Orchestration với Chatbot đơn lẻ" />
    <PerformanceComparison />
  </>
);
