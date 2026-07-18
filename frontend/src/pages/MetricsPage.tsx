import { Header } from "../layouts/Header";
import { PerformanceComparison } from "../features/metrics/PerformanceComparison";

export const MetricsPage = () => (
  <>
    <Header eyebrow="Performance & observability" title="Hiệu năng có thể quan sát." subtitle="Theo dõi thời gian xử lý, số bước agent và tool calls từ các phiên thẩm định trong workspace." />
    <PerformanceComparison />
  </>
);
