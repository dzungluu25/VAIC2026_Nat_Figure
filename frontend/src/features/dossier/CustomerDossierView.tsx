import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CircleAlert, FileCheck2, Download, FileText, FolderArchive } from "lucide-react";
import { Header } from "../../layouts/Header";
import { Card } from "../../components/Card";
import { Badge } from "../../components/Badge";
import { Skeleton } from "../../components/Skeleton";
import type { BadgeTone } from "../../components/Badge";
import { ApiError } from "../../services/httpClient";
import { getCustomerDossierDetail } from "../../services/dossierService";
import { useSessionStore } from "../../store/sessionStore";
import type { CustomerDossierDetail, CustomerDossierStatus } from "../../types/document-intake";
import { documentStatusLabel, documentStatusTone, loanTypeLabel } from "./dossierStatus";
import { DocumentUploadPanel } from "./DocumentUploadPanel";
import styles from "./CustomerDossierView.module.css";

const customerStatusTone: Record<CustomerDossierStatus, BadgeTone> = {
  THIEU_GIAY_TO: "warning",
  DANG_XU_LY: "info",
  CHO_DUYET: "info",
  DA_DUYET: "success",
  TU_CHOI: "danger",
};

export const CustomerDossierView = () => {
  const { id } = useParams<{ id: string }>();
  const { accessToken } = useSessionStore();
  const [detail, setDetail] = useState<CustomerDossierDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id || !accessToken) return;
    try {
      setDetail(await getCustomerDossierDetail(accessToken, id));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không tải được hồ sơ.");
    } finally {
      setLoading(false);
    }
  }, [id, accessToken]);

  useEffect(() => { load(); }, [load]);

  if (loading && !detail) {
    return (
      <>
        <Header eyebrow="Hồ sơ của tôi" title="Đang tải..." />
        <div className={styles.stack}>{[0, 1, 2].map(i => <Skeleton key={i} height={80} />)}</div>
      </>
    );
  }

  if (error && !detail) {
    return (
      <>
        <Header eyebrow="Hồ sơ của tôi" title="Không tải được hồ sơ" />
        <p className={styles.error}>{error}</p>
      </>
    );
  }
  if (!detail) return null;

  const { dossier, loanType, completeness, documents, approvedProduct } = detail;
  const canUpload = dossier.status === "THIEU_GIAY_TO";

  return (
    <>
      <Header
        eyebrow={`Khoản vay ${loanTypeLabel[loanType]}`}
        title={`Hồ sơ ${dossier.dossierId}`}
        action={<Badge tone={customerStatusTone[dossier.status]}>{dossier.statusLabel}</Badge>}
      />
      <Link to="/dossiers" className={styles.back}><ArrowLeft size={15} /> Về danh sách hồ sơ</Link>

      {approvedProduct ? (
        <Card title="🎉 Khoản vay đã được duyệt">
          <p className={styles.approvedProduct}>{approvedProduct}</p>
        </Card>
      ) : null}

      <Card title="Giấy tờ cần bổ sung">
        {completeness.missingDocumentTypes.length === 0 ? (
          <p className={styles.allDone}><FileCheck2 size={16} /> Bạn đã nộp đủ giấy tờ. Hồ sơ đang được xử lý.</p>
        ) : (
          <>
            <p className={styles.warnLine}><CircleAlert size={16} /> Còn thiếu {completeness.missingDocumentTypes.length} giấy tờ:</p>
            <ul className={styles.missingList}>
              {completeness.missingDocumentTypes.map(item => <li key={item.documentType}>{item.displayName}</li>)}
            </ul>
          </>
        )}
      </Card>

      {canUpload ? (
        <>
          <Card title="Tải biểu mẫu tài liệu (.docx)">
            <div className={styles.templateList}>
              <div className={styles.templateItem}>
                <div className={styles.templateInfo}>
                  <div className={styles.templateIcon}>
                    <FileText size={24} />
                  </div>
                  <div>
                    <span className={styles.templateName}>Đơn đề nghị vay vốn tín chấp kiêm HĐTD</span>
                    <span className={styles.templateCode}>Mẫu số: 01/TC-KHCN</span>
                  </div>
                </div>
                <a
                  href="/templates/Mau-01-Don-vay-tin-chap.docx"
                  download="Mau-01-Don-vay-tin-chap.docx"
                  className={styles.downloadLink}
                >
                  <Download size={14} /> Tải xuống
                </a>
              </div>

              <div className={styles.templateItem}>
                <div className={styles.templateInfo}>
                  <div className={styles.templateIcon}>
                    <FileText size={24} />
                  </div>
                  <div>
                    <span className={styles.templateName}>Đơn đề nghị vay vốn thế chấp kiêm PATN</span>
                    <span className={styles.templateCode}>Mẫu số: 02/TC-KHCN</span>
                  </div>
                </div>
                <a
                  href="/templates/Mau-02-Don-vay-the-chap.docx"
                  download="Mau-02-Don-vay-the-chap.docx"
                  className={styles.downloadLink}
                >
                  <Download size={14} /> Tải xuống
                </a>
              </div>

              <div className={styles.templateItem}>
                <div className={styles.templateInfo}>
                  <div className={styles.templateIcon}>
                    <FileText size={24} />
                  </div>
                  <div>
                    <span className={styles.templateName}>Giấy xác nhận thu nhập</span>
                    <span className={styles.templateCode}>Mẫu số: 03/TC-KHCN</span>
                  </div>
                </div>
                <a
                  href="/templates/Mau-03-Giay-xac-nhan-thu-nhap.docx"
                  download="Mau-03-Giay-xac-nhan-thu-nhap.docx"
                  className={styles.downloadLink}
                >
                  <Download size={14} /> Tải xuống
                </a>
              </div>
            </div>

            <div className={styles.zipContainer}>
              <a
                href="/templates/Mau-Bieu-De-Nghi-Vay.zip"
                download="Mau-Bieu-De-Nghi-Vay.zip"
                className={styles.zipButton}
              >
                <FolderArchive size={16} /> Tải trọn bộ 3 biểu mẫu (ZIP)
              </a>
            </div>
          </Card>

          <Card title="Nộp / bổ sung giấy tờ">
            <DocumentUploadPanel
              dossierId={dossier.dossierId}
              targets={completeness.missingDocumentTypes}
              onUploaded={load}
            />
          </Card>
        </>
      ) : null}

      <Card title={`Giấy tờ đã nộp (${documents.length})`}>
        {documents.length === 0 ? (
          <p className={styles.empty}>Bạn chưa nộp giấy tờ nào.</p>
        ) : (
          <div className={styles.docList}>
            {documents.map((doc, index) => (
              <div key={`${doc.documentType}-${index}`} className={styles.docRow}>
                <div className={styles.docHead}>
                  <strong>{doc.displayName}</strong>
                  <Badge tone={documentStatusTone[doc.status]}>{documentStatusLabel[doc.status]}</Badge>
                </div>
                <span className={styles.docMeta}>{doc.originalFilename} · {new Date(doc.uploadedAt).toLocaleString("vi-VN")}</span>
                {doc.formRejectReason ? <p className={styles.rejectReason}>{doc.formRejectReason}</p> : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
};
