import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ClipboardList, Plus, Upload } from "lucide-react";
import { Header } from "../layouts/Header";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { Badge } from "../components/Badge";
import { Skeleton } from "../components/Skeleton";
import { createDossier, listDossiers } from "../services/dossierService";
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
  const navigate = useNavigate();
  const [dossiers, setDossiers] = useState<Array<LoanDossier | CustomerDossierSummary>>([]);
  const [status, setStatus] = useState<DossierStatus | "ALL">("PENDING_REVIEW");
  const [loanType, setLoanType] = useState<LoanType | "ALL">("ALL");
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newLoanType, setNewLoanType] = useState<LoanType>("unsecured");
  const [newEmail, setNewEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreateDossier = async (event: FormEvent) => {
    event.preventDefault();
    if (!accessToken || !newEmail.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await createDossier(accessToken, { customerEmail: newEmail.trim(), loanType: newLoanType });
      navigate(`/dossiers/${created.dossierId}`);
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "Không thể tạo hồ sơ mới.");
    } finally {
      setCreating(false);
    }
  };

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

      {role === "CUSTOMER" ? (
        <Card title="Bắt đầu hồ sơ vay mới" className={styles.createCard}>
          <form className={styles.createForm} onSubmit={handleCreateDossier}>
            <label className={styles.createField}>
              Loại vay
              <select value={newLoanType} onChange={e => setNewLoanType(e.target.value as LoanType)}>
                <option value="unsecured">{loanTypeLabel.unsecured}</option>
                <option value="mortgage">{loanTypeLabel.mortgage}</option>
              </select>
            </label>
            <label className={styles.createField}>
              Email nhận thông báo
              <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="ban@example.com" required />
            </label>
            <Button type="submit" variant="primary" isLoading={creating} disabled={!newEmail.trim()}>
              <Plus size={15} /> Tạo hồ sơ
            </Button>
          </form>
          {createError ? <p className={styles.error}>{createError}</p> : null}
        </Card>
      ) : null}

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
              const shortCode = dossier.dossierId.replace(/^dossier-/, "").slice(0, 8).toUpperCase();
              const canUpload = dossier.status === "THIEU_GIAY_TO";
              return (
                <div key={dossier.dossierId} className={styles.customerRow}>
                  <Link to={`/dossiers/${dossier.dossierId}`} className={styles.customerInfo}>
                    <strong>Hồ sơ vay {loanTypeLabel[dossier.loanType]}</strong>
                    <span className={styles.meta}>Mã {shortCode} · Tạo ngày {new Date(dossier.createdAt).toLocaleDateString("vi-VN")}</span>
                  </Link>
                  <Badge tone={tone}>{dossier.statusLabel}</Badge>
                  {canUpload ? (
                    <Link to={`/dossiers/${dossier.dossierId}`} className={styles.uploadBtn}>
                      <Upload size={14} /> Tải giấy tờ
                    </Link>
                  ) : null}
                </div>
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
