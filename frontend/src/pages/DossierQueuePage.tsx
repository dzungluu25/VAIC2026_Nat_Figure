import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardList } from "lucide-react";
import { Header } from "../layouts/Header";
import { Badge } from "../components/Badge";
import { Skeleton } from "../components/Skeleton";
import { listDossiers } from "../services/dossierService";
import { ApiError } from "../services/httpClient";
import { useSessionStore } from "../store/sessionStore";
import { dossierStatusLabel, dossierStatusTone, loanTypeLabel } from "../features/dossier/dossierStatus";
import { isCustomerDossierSummary, type CustomerDossierSummary, type DossierStatus, type LoanDossier, type LoanType } from "../types/document-intake";
import styles from "./DossierQueuePage.module.css";

const STATUS_OPTIONS: Array<DossierStatus | "ALL"> = [
  "ALL", "PENDING_REVIEW", "NEEDS_MORE_INFO", "INCOMPLETE", "COMPLETE", "SCORED", "APPROVED", "REJECTED",
];
const LOAN_TYPE_OPTIONS: Array<LoanType | "ALL"> = ["ALL", "unsecured", "mortgage"];

export const DossierQueuePage = () => {
  const { accessToken, role } = useSessionStore();
  const [dossiers, setDossiers] = useState<Array<LoanDossier | CustomerDossierSummary>>([]);
  const [status, setStatus] = useState<DossierStatus | "ALL">("PENDING_REVIEW");
  const [loanType, setLoanType] = useState<LoanType | "ALL">("ALL");
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        if (!accessToken) return;
        const token = accessToken;
        const result = await listDossiers(token, {
          status: status === "ALL" ? undefined : status,
          loanType: loanType === "ALL" ? undefined : loanType,
          assignedToMe,
        });
        if (!cancelled) setDossiers(result.dossiers);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Không tải được danh sách hồ sơ.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [accessToken, status, loanType, assignedToMe]);

  return (
    <>
      <Header
        eyebrow={role === "CUSTOMER" ? "Hồ sơ của tôi" : "Hàng đợi xét duyệt"}
        title={role === "CUSTOMER" ? "Trạng thái hồ sơ vay" : "Hồ sơ chờ duyệt"}
        subtitle={role === "CUSTOMER" ? "Theo dõi tiến độ xử lý hồ sơ." : "Lọc theo trạng thái và loại vay. Bấm vào một hồ sơ để xem chi tiết giấy tờ, kết quả OCR và đánh giá sơ bộ."}
      />

      {role !== "CUSTOMER" ? <div className={styles.filters}>
        <label>
          Trạng thái
          <select value={status} onChange={e => setStatus(e.target.value as DossierStatus | "ALL")}>
            {STATUS_OPTIONS.map(option => (
              <option key={option} value={option}>{option === "ALL" ? "Tất cả" : dossierStatusLabel[option]}</option>
            ))}
          </select>
        </label>
        <label>
          Loại vay
          <select value={loanType} onChange={e => setLoanType(e.target.value as LoanType | "ALL")}>
            {LOAN_TYPE_OPTIONS.map(option => (
              <option key={option} value={option}>{option === "ALL" ? "Tất cả" : loanTypeLabel[option]}</option>
            ))}
          </select>
        </label>
        <label className={styles.checkboxLabel}>
          <input type="checkbox" checked={assignedToMe} onChange={e => setAssignedToMe(e.target.checked)} />
          Chỉ hồ sơ của tôi
        </label>
      </div> : null}

      {error ? <p className={styles.error}>{error}</p> : null}

      {loading ? (
        <div className={styles.list}>
          {[0, 1, 2].map(i => <Skeleton key={i} height={64} />)}
        </div>
      ) : dossiers.length === 0 ? (
        <div className={styles.empty}>
          <ClipboardList size={22} />
          <p>Không có hồ sơ nào khớp bộ lọc hiện tại.</p>
        </div>
      ) : (
        <div className={styles.list}>
          {dossiers.map(dossier => {
            if (isCustomerDossierSummary(dossier)) {
              const tone = dossier.status === "DA_DUYET" ? "success" : dossier.status === "TU_CHOI" ? "danger" : dossier.status === "THIEU_GIAY_TO" ? "warning" : "info";
              return (
                <Link key={dossier.dossierId} to={`/dossiers/${dossier.dossierId}`} className={styles.row}>
                  <div><strong>{dossier.dossierId}</strong></div>
                  <Badge tone={tone}>{dossier.statusLabel}</Badge>
                </Link>
              );
            }
            return (
              <Link key={dossier.dossierId} to={`/dossiers/${dossier.dossierId}`} className={styles.row}>
                <div>
                  <strong>{dossier.dossierId}</strong>
                  <span className={styles.meta}>{dossier.customerId} · {loanTypeLabel[dossier.loanType]}</span>
                </div>
                <Badge tone={dossierStatusTone[dossier.status]}>{dossierStatusLabel[dossier.status]}</Badge>
                <span className={styles.updatedAt}>{new Date(dossier.updatedAt).toLocaleString("vi-VN")}</span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
};
