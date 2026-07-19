import { useCallback, useEffect, useState } from "react";
import { Activity, Boxes, GaugeCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { Header } from "../layouts/Header";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Skeleton } from "../components/Skeleton";
import type { BadgeTone } from "../components/Badge";
import { getAdminSystem, type AdminSystemOverview, type HealthStatus } from "../services/adminService";
import { ApiError } from "../services/httpClient";
import { useSessionStore } from "../store/sessionStore";
import styles from "./AdminPage.module.css";

const STATUS_TONE: Record<HealthStatus, BadgeTone> = {
  ok: "success",
  degraded: "warning",
  error: "danger",
  not_configured: "neutral",
};
const STATUS_LABEL: Record<HealthStatus, string> = {
  ok: "OK",
  degraded: "Hạn chế",
  error: "Lỗi",
  not_configured: "Chưa cấu hình",
};

export const AdminPage = () => {
  const { accessToken, role } = useSessionStore();
  const [data, setData] = useState<AdminSystemOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      setData(await getAdminSystem(accessToken));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không tải được dữ liệu hệ thống.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { load(); }, [load]);

  if (role !== "ADMIN") {
    return (
      <>
        <Header eyebrow="Quản trị hệ thống" title="Bảng điều khiển Admin" />
        <p className={styles.locked}>Chỉ ADMIN được xem trang này.</p>
      </>
    );
  }

  return (
    <>
      <Header
        eyebrow="Quản trị hệ thống"
        title="Công cụ · Bảo trì · Vận hành"
        subtitle={data ? `Cập nhật: ${new Date(data.generatedAt).toLocaleString("vi-VN")}` : "Tình trạng dịch vụ, công cụ, phiên bản và thống kê."}
        action={<Button variant="secondary" isLoading={loading} onClick={load}><RefreshCw size={14} /> Làm mới</Button>}
      />

      {error ? <p className={styles.error}>{error}</p> : null}
      {loading && !data ? <div className={styles.stack}>{[0, 1, 2].map(i => <Skeleton key={i} height={90} />)}</div> : null}

      {data ? (
        <div className={styles.stack}>
          <Card title="Tình trạng hệ thống" action={<Activity size={16} />}>
            <div className={styles.healthGrid}>
              {data.health.map(entry => (
                <div key={entry.name} className={styles.healthRow}>
                  <div>
                    <strong>{entry.name}</strong>
                    <span className={styles.healthDetail}>{entry.detail}</span>
                  </div>
                  <Badge tone={STATUS_TONE[entry.status]}>{STATUS_LABEL[entry.status]}</Badge>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Thống kê vận hành" action={<GaugeCircle size={16} />}>
            <div className={styles.statGrid}>
              <div className={styles.statTile}><small>Tổng hồ sơ</small><strong>{data.stats.totalDossiers}</strong></div>
              <div className={styles.statTile}><small>Orchestration runs</small><strong>{data.stats.runs}</strong></div>
              <div className={styles.statTile}><small>Noti đã gửi</small><strong>{data.stats.notificationsSent}</strong></div>
              <div className={styles.statTile}><small>Email gửi / lỗi</small><strong>{data.stats.emailsSent} / {data.stats.emailsFailed}</strong></div>
              <div className={styles.statTile}><small>Từ chối sai mẫu</small><strong>{data.stats.formRejections}</strong></div>
            </div>
            {Object.keys(data.stats.dossiersByStatus).length > 0 ? (
              <div className={styles.statusRow}>
                {Object.entries(data.stats.dossiersByStatus).map(([status, count]) => (
                  <Badge key={status} tone="neutral">{status}: {count}</Badge>
                ))}
              </div>
            ) : null}
          </Card>

          <Card title="Danh mục tools & agents" action={<Boxes size={16} />}>
            <div className={styles.toolGrid}>
              {data.tools.map(tool => (
                <div key={tool.key} className={styles.toolCard}>
                  <div className={styles.toolHead}>
                    <span className={styles.toolKind}>{tool.kind === "agent" ? "AGENT" : "TOOL"}</span>
                    <Badge tone={STATUS_TONE[tool.status]}>{STATUS_LABEL[tool.status]}</Badge>
                  </div>
                  <strong>{tool.label}</strong>
                  <span className={styles.toolNote}>{tool.note}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Phiên bản & cấu hình" action={<ShieldCheck size={16} />}>
            <ul className={styles.versionList}>
              <li><span>Decision policy</span><strong>{data.versions.decisionPolicy.id} @ {data.versions.decisionPolicy.version}</strong></li>
              <li><span>Routing catalog</span><strong>{data.versions.routingCatalog.id} @ {data.versions.routingCatalog.version}</strong></li>
              <li><span>Product catalog</span><strong>{data.versions.productCatalog.id} @ {data.versions.productCatalog.version}</strong></li>
              <li><span>Agent contracts</span><strong>{data.versions.agentContracts.id} @ {data.versions.agentContracts.version}</strong></li>
              <li><span>Regulatory baseline</span><strong>{data.versions.regulatoryBaseline.id} @ {data.versions.regulatoryBaseline.version}</strong></li>
            </ul>
            {data.versions.decisionPolicy.profitabilityOverrides.length > 0 ? (
              <p className={styles.overrides}>Override lợi nhuận: {data.versions.decisionPolicy.profitabilityOverrides.join(", ")}</p>
            ) : null}
          </Card>
        </div>
      ) : null}
    </>
  );
};
