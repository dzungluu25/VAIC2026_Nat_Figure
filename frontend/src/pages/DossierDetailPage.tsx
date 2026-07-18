import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, CircleAlert, Search, Upload, XCircle } from "lucide-react";
import { Header } from "../layouts/Header";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Skeleton } from "../components/Skeleton";
import { getDossierAudit, getDossierDetail, reassignDossier, submitCicReport, submitReviewDecision, uploadDossierDocument } from "../services/dossierService";
import { useSessionStore } from "../store/sessionStore";
import { ApiError } from "../services/httpClient";
import {
  documentStatusLabel, documentStatusTone, documentTypeLabel,
  dossierStatusLabel, dossierStatusTone, humanizeFieldKey, loanTypeLabel,
} from "../features/dossier/dossierStatus";
import { isCustomerDossierSummary, type DossierDetail, type ReviewDecision } from "../types/document-intake";
import styles from "./DossierDetailPage.module.css";

const AUDIT_ROLES = new Set(["CREDIT_APPROVER", "ADMIN", "AUDITOR"]);

export const DossierDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { accessToken, role } = useSessionStore();
  const activeRole = role ?? "CREDIT_OFFICER";
  const getAccessToken = useCallback(() => {
    if (!accessToken) throw new ApiError("AUTHENTICATION_REQUIRED", 401);
    return Promise.resolve(accessToken);
  }, [accessToken]);
  const [detail, setDetail] = useState<DossierDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [auditEvents, setAuditEvents] = useState<Array<{ eventId: string; timestamp: string; actor: string; actionType: string; status: string; details: string }>>([]);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState<ReviewDecision | null>(null);
  const [cicForm, setCicForm] = useState({ creditScore: "", totalOutstandingDebt: "", debtGroup: "", reportDate: "", notes: "" });
  const [cicFile, setCicFile] = useState<File | null>(null);
  const [cicSubmitting, setCicSubmitting] = useState(false);
  const [cicError, setCicError] = useState<string | null>(null);
  const [documentType, setDocumentType] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentUploading, setDocumentUploading] = useState(false);
  const [documentUploadError, setDocumentUploadError] = useState<string | null>(null);
  const [targetOfficerId, setTargetOfficerId] = useState("");
  const [reassigning, setReassigning] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      setDetail(await getDossierDetail(token, id));
      if (role && AUDIT_ROLES.has(role)) {
        try {
          const audit = await getDossierAudit(token, id);
          setAuditEvents(audit.events);
          setAuditError(null);
        } catch (err) {
          setAuditEvents([]);
          setAuditError(err instanceof ApiError ? err.message : "Khong tai duoc audit log.");
        }
      } else {
        setAuditEvents([]);
        setAuditError(null);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không tải được chi tiết hồ sơ.");
    } finally {
      setLoading(false);
    }
  }, [getAccessToken, id, role]);

  useEffect(() => { load(); }, [load]);

  const decide = async (decision: ReviewDecision) => {
    if (!id) return;
    setSubmitting(decision);
    setError(null);
    try {
      const token = await getAccessToken();
      await submitReviewDecision(token, id, decision, comment.trim() || undefined);
      setComment("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không thể ghi nhận quyết định.");
    } finally {
      setSubmitting(null);
    }
  };

  const submitCic = async (e: FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setCicSubmitting(true);
    setCicError(null);
    try {
      const token = await getAccessToken();
      await submitCicReport(token, id, { ...cicForm, notes: cicForm.notes.trim() || undefined, file: cicFile ?? undefined });
      setCicForm({ creditScore: "", totalOutstandingDebt: "", debtGroup: "", reportDate: "", notes: "" });
      setCicFile(null);
      await load();
    } catch (err) {
      setCicError(err instanceof ApiError ? err.message : "Không thể lưu CIC.");
    } finally {
      setCicSubmitting(false);
    }
  };

  const submitDocumentUpload = async (e: FormEvent) => {
    e.preventDefault();
    if (!id || !documentType || !documentFile) return;
    setDocumentUploading(true);
    setDocumentUploadError(null);
    try {
      const token = await getAccessToken();
      await uploadDossierDocument(token, id, { documentType, file: documentFile });
      setDocumentType("");
      setDocumentFile(null);
      await load();
    } catch (err) {
      setDocumentUploadError(err instanceof ApiError ? err.message : "KhÃ´ng thá»ƒ táº£i lÃªn giáº¥y tá».");
      await load();
    } finally {
      setDocumentUploading(false);
    }
  };

  const reassign = async () => {
    if (!id || !targetOfficerId.trim()) return;
    setReassigning(true);
    setError(null);
    try {
      await reassignDossier(await getAccessToken(), id, targetOfficerId.trim());
      setTargetOfficerId("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không thể phân công lại hồ sơ.");
    } finally {
      setReassigning(false);
    }
  };

  if (loading && !detail) {
    return (
      <>
        <Header eyebrow="Chi tiết hồ sơ" title="Đang tải..." />
        <div className={styles.skeletonStack}>
          {[0, 1, 2].map(i => <Skeleton key={i} height={80} />)}
        </div>
      </>
    );
  }

  if (error && !detail) {
    return (
      <>
        <Header eyebrow="Chi tiết hồ sơ" title="Không tải được hồ sơ" />
        <p className={styles.error}>{error}</p>
      </>
    );
  }

  if (!detail) return null;
  if (isCustomerDossierSummary(detail)) {
    const tone = detail.status === "DA_DUYET" ? "success" : detail.status === "TU_CHOI" ? "danger" : detail.status === "THIEU_GIAY_TO" ? "warning" : "info";
    return (
      <>
        <Link to="/dossiers" className={styles.backLink}><ArrowLeft size={14} /> Quay lại danh sách hồ sơ</Link>
        <Header
          eyebrow="Trạng thái hồ sơ"
          title={detail.dossierId}
          subtitle="Thông tin chấm điểm, CIC và đánh giá nội bộ chỉ dành cho chuyên viên ngân hàng."
          action={<Badge tone={tone}>{detail.statusLabel}</Badge>}
        />
        <Card title="Tiến độ xử lý">
          <p>Hồ sơ hiện ở trạng thái: <strong>{detail.statusLabel}</strong>.</p>
        </Card>
      </>
    );
  }
  const { dossier, documents, completeness, cicReport, scoring, assignedOfficer, reviewDecisions } = detail;
  const dossierFinalized = dossier.status === "APPROVED" || dossier.status === "REJECTED";
  const uploadAllowedStatuses = new Set(["COLLECTING", "INCOMPLETE", "NEEDS_MORE_INFO"]);
  const canUploadDocuments = uploadAllowedStatuses.has(dossier.status) && (activeRole === "CUSTOMER" || activeRole === "CREDIT_OFFICER");
  const uploadOptions = completeness.missingDocumentTypes.length > 0
    ? completeness.missingDocumentTypes
    : Array.from(new Map(documents.map(doc => [doc.documentType, { documentType: doc.documentType, displayName: documentTypeLabel[doc.documentType] ?? doc.documentType }])).values());

  return (
    <>
      <Link to="/dossiers" className={styles.backLink}><ArrowLeft size={14} /> Quay lại hàng đợi</Link>
      <Header
        eyebrow={loanTypeLabel[dossier.loanType]}
        title={dossier.dossierId}
        subtitle={`Khách hàng ${dossier.customerId} · ${dossier.customerEmail}`}
        action={<Badge tone={dossierStatusTone[dossier.status]}>{dossierStatusLabel[dossier.status]}</Badge>}
      />

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.grid}>
        <Card title="Checklist">
          {completeness.complete ? (
            <p className={styles.okLine}><CheckCircle2 size={16} /> Đã đủ toàn bộ giấy tờ bắt buộc.</p>
          ) : (
            <>
              <p className={styles.warnLine}><CircleAlert size={16} /> Còn thiếu {completeness.missingDocumentTypes.length} giấy tờ:</p>
              <ul className={styles.missingList}>
                {completeness.missingDocumentTypes.map(item => <li key={item.documentType}>{item.displayName}</li>)}
              </ul>
            </>
          )}
          {assignedOfficer ? <p className={styles.assigned}>Chuyên viên phụ trách: <strong>{assignedOfficer}</strong></p> : null}
          {activeRole === "CREDIT_APPROVER" ? (
            <div className={styles.actionRow}>
              <input
                aria-label="Mã chuyên viên nhận hồ sơ"
                placeholder="officer.tam"
                value={targetOfficerId}
                onChange={event => setTargetOfficerId(event.target.value)}
              />
              <Button variant="secondary" isLoading={reassigning} disabled={reassigning || !targetOfficerId.trim()} onClick={reassign}>
                Phân công lại
              </Button>
            </div>
          ) : null}
        </Card>

        {scoring ? (
          <Card title="Kết quả đánh giá sơ bộ">
            <div className={styles.scoreBox}>
              <Badge tone={scoring.status === "scored" ? "success" : "warning"}>{scoring.status === "scored" ? "Đã có kết quả" : "Không lấy được kết quả"}</Badge>
              <pre className={styles.scoreJson}>{JSON.stringify(scoring.score_result, null, 2)}</pre>
              <p className={styles.disclaimer}>Kết quả mô hình chỉ mang tính tham khảo (DEMO_ONLY) — quyết định cuối cùng luôn do chuyên viên thực hiện.</p>
            </div>
          </Card>
        ) : null}
      </div>

      <Card title="CIC — chuyên viên tự tra cứu / nhập tay" action={<Search size={16} />} className={styles.documentsCard}>
        <p className={styles.disclaimer}>
          Khách hàng không nộp CIC. Chuyên viên tự tra cứu và nhập trực tiếp — dữ liệu này không qua OCR, không do khách hàng cung cấp.
        </p>
        {cicReport ? (
          <div className={styles.fieldGrid}>
            <div className={styles.fieldCell}><span className={styles.fieldLabel}>Điểm tín dụng</span><span className={styles.fieldValue}>{cicReport.creditScore}</span></div>
            <div className={styles.fieldCell}><span className={styles.fieldLabel}>Tổng dư nợ</span><span className={styles.fieldValue}>{cicReport.totalOutstandingDebt}</span></div>
            <div className={styles.fieldCell}><span className={styles.fieldLabel}>Nhóm nợ</span><span className={styles.fieldValue}>{cicReport.debtGroup}</span></div>
            <div className={styles.fieldCell}><span className={styles.fieldLabel}>Ngày tra cứu</span><span className={styles.fieldValue}>{cicReport.reportDate}</span></div>
          </div>
        ) : (
          <p className={styles.warnLine}><CircleAlert size={16} /> Chưa có CIC — hồ sơ sẽ không vào hàng đợi đánh giá cho tới khi được bổ sung.</p>
        )}
        {cicReport ? (
          <p className={styles.assigned}>
            Do <strong>{cicReport.uploadedBy}</strong> nhập lúc {new Date(cicReport.uploadedAt).toLocaleString("vi-VN")} (vai trò: STAFF)
            {cicReport.originalFilename ? ` · Đính kèm: ${cicReport.originalFilename}` : ""}
          </p>
        ) : null}
        {cicReport?.notes ? <p className={styles.decisionComment}>{cicReport.notes}</p> : null}

        {!dossierFinalized && activeRole === "CREDIT_OFFICER" ? (
          <form className={styles.cicForm} onSubmit={submitCic}>
            <div className={styles.cicFormGrid}>
              <label>Điểm tín dụng
                <input required value={cicForm.creditScore} onChange={e => setCicForm(f => ({ ...f, creditScore: e.target.value }))} />
              </label>
              <label>Tổng dư nợ
                <input required value={cicForm.totalOutstandingDebt} onChange={e => setCicForm(f => ({ ...f, totalOutstandingDebt: e.target.value }))} />
              </label>
              <label>Nhóm nợ
                <input required value={cicForm.debtGroup} onChange={e => setCicForm(f => ({ ...f, debtGroup: e.target.value }))} />
              </label>
              <label>Ngày tra cứu
                <input required type="date" value={cicForm.reportDate} onChange={e => setCicForm(f => ({ ...f, reportDate: e.target.value }))} />
              </label>
            </div>
            <label className={styles.cicNotesLabel}>Ghi chú (tuỳ chọn)
              <textarea rows={2} value={cicForm.notes} onChange={e => setCicForm(f => ({ ...f, notes: e.target.value }))} />
            </label>
            <label className={styles.cicNotesLabel}>File đính kèm (tuỳ chọn — chỉ lưu làm bằng chứng, không OCR)
              <input type="file" onChange={e => setCicFile(e.target.files?.[0] ?? null)} />
            </label>
            {cicError ? <p className={styles.error}>{cicError}</p> : null}
            <Button type="submit" variant="secondary" isLoading={cicSubmitting} disabled={cicSubmitting}>
              <Upload size={15} /> {cicReport ? "Cập nhật CIC" : "Nhập CIC"}
            </Button>
          </form>
        ) : null}
      </Card>

      {canUploadDocuments ? (
        <Card title="OCR giấy tờ khách hàng" action={<Upload size={16} />} className={styles.documentsCard}>
          <form className={styles.uploadForm} onSubmit={submitDocumentUpload}>
            <div className={styles.uploadFormGrid}>
              <label>Loại giấy tờ
                <select required value={documentType} onChange={event => setDocumentType(event.target.value)}>
                  <option value="">Chọn giấy tờ cần OCR</option>
                  {uploadOptions.map(item => (
                    <option key={item.documentType} value={item.documentType}>{item.displayName}</option>
                  ))}
                </select>
              </label>
              <label>File
                <input required type="file" accept="application/pdf,image/bmp,image/jpeg,image/png,image/tiff,image/webp" onChange={event => setDocumentFile(event.target.files?.[0] ?? null)} />
              </label>
            </div>
            {documentUploadError ? <p className={styles.error}>{documentUploadError}</p> : null}
            <Button type="submit" variant="secondary" isLoading={documentUploading} disabled={documentUploading || !documentType || !documentFile}>
              <Upload size={15} /> Tải lên và chạy OCR
            </Button>
          </form>
        </Card>
      ) : null}

      <Card title={`Giấy tờ đã nộp (${documents.length})`} className={styles.documentsCard}>
        {documents.length === 0 ? (
          <p className={styles.empty}>Chưa có giấy tờ nào được tải lên.</p>
        ) : (
          <div className={styles.documentList}>
            {documents.map(doc => (
              <div key={doc.documentId} className={styles.documentRow}>
                <div className={styles.documentHead}>
                  <strong>{documentTypeLabel[doc.documentType] ?? doc.documentType}</strong>
                  <Badge tone={documentStatusTone[doc.status]}>{documentStatusLabel[doc.status]}</Badge>
                </div>
                <span className={styles.documentMeta}>{doc.originalFilename} · {new Date(doc.uploadedAt).toLocaleString("vi-VN")}</span>
                {doc.ocrResult ? (
                  <div className={styles.fieldGrid}>
                    {Object.entries(doc.ocrResult.extractedFields).map(([key, value]) => (
                      <div key={key} className={styles.fieldCell}>
                        <span className={styles.fieldLabel}>{humanizeFieldKey(key)}</span>
                        <span className={styles.fieldValue}>{value}</span>
                        <span className={styles.fieldConfidence}>{Math.round((doc.ocrResult!.fieldConfidence[key] ?? 0) * 100)}%</span>
                      </div>
                    ))}
                    {doc.ocrResult.missingRequiredFields.map(key => (
                      <div key={key} className={[styles.fieldCell, styles.fieldMissing].join(" ")}>
                        <span className={styles.fieldLabel}>{humanizeFieldKey(key)}</span>
                        <span className={styles.fieldValue}>— thiếu —</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      {dossier.status === "PENDING_REVIEW" && (activeRole === "CREDIT_OFFICER" || activeRole === "CREDIT_APPROVER") ? (
        <Card title="Quyết định của chuyên viên">
          <textarea
            className={styles.commentBox}
            placeholder="Ghi chú / lý do (không bắt buộc)"
            value={comment}
            onChange={e => setComment(e.target.value)}
            rows={3}
          />
          <div className={styles.actionRow}>
            <Button variant="primary" isLoading={submitting === "approved"} disabled={!!submitting} onClick={() => decide("approved")}>
              <CheckCircle2 size={15} /> Duyệt
            </Button>
            <Button variant="secondary" isLoading={submitting === "more_info"} disabled={!!submitting} onClick={() => decide("more_info")}>
              <CircleAlert size={15} /> Yêu cầu bổ sung
            </Button>
            <Button variant="ghost" isLoading={submitting === "rejected"} disabled={!!submitting} onClick={() => decide("rejected")}>
              <XCircle size={15} /> Từ chối
            </Button>
          </div>
        </Card>
      ) : null}

      {reviewDecisions.length > 0 ? (
        <Card title="Lịch sử xét duyệt">
          <ul className={styles.decisionList}>
            {reviewDecisions.map(decision => (
              <li key={decision.id}>
                <strong>{decision.reviewer}</strong> — {decision.decision === "approved" ? "Duyệt" : decision.decision === "rejected" ? "Từ chối" : "Yêu cầu bổ sung"}
                <span className={styles.decisionMeta}>{new Date(decision.decidedAt).toLocaleString("vi-VN")}</span>
                {decision.comment ? <p className={styles.decisionComment}>{decision.comment}</p> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {role && AUDIT_ROLES.has(role) ? (
        <Card title="Audit log hồ sơ" className={styles.documentsCard}>
          {auditError ? <p className={styles.error}>{auditError}</p> : null}
          {auditEvents.length === 0 && !auditError ? (
            <p className={styles.empty}>Chưa có sự kiện audit nào cho hồ sơ này.</p>
          ) : (
            <ul className={styles.auditList}>
              {auditEvents.map(event => (
                <li key={event.eventId}>
                  <span>
                    <strong>{event.actionType}</strong>
                    <small>{new Date(event.timestamp).toLocaleString("vi-VN")} · {event.actor}</small>
                  </span>
                  <Badge tone={event.status === "blocked" ? "danger" : "success"}>{event.status}</Badge>
                  <p>{event.details}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
    </>
  );
};
