import { Header } from "../layouts/Header";
import { PerformanceComparison } from "../features/metrics/PerformanceComparison";

export const MetricsPage = () => (
  <>
    <Header eyebrow="Hiệu năng và khả năng quan sát" title="Hiệu năng có thể quan sát." subtitle="Theo dõi thời gian xử lý, số bước tác tử và các lệnh gọi công cụ từ các phiên thẩm định trong không gian làm việc." />
    <PerformanceComparison />
  </>
);
