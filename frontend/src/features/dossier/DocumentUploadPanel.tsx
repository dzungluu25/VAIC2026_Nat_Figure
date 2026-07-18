import { useState, type FormEvent } from "react";
import { Upload } from "lucide-react";
import { Button } from "../../components/Button";
import { ApiError } from "../../services/httpClient";
import { uploadDossierDocument } from "../../services/dossierService";
import { useSessionStore } from "../../store/sessionStore";
import styles from "./DocumentUploadPanel.module.css";

// The intake pipeline reads .docx natively and OCRs pdf/image scans.
const ACCEPTED_FILE_TYPES =
  ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,image/png,image/jpeg,image/tiff,image/bmp,image/webp";

interface UploadTarget {
  documentType: string;
  displayName: string;
}

interface DocumentUploadPanelProps {
  dossierId: string;
  targets: UploadTarget[];
  onUploaded: () => void | Promise<void>;
}

export const DocumentUploadPanel = ({ dossierId, targets, onUploaded }: DocumentUploadPanelProps) => {
  const { accessToken } = useSessionStore();
  const [documentType, setDocumentType] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!accessToken || !documentType || !file) return;
    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      await uploadDossierDocument(accessToken, dossierId, { documentType, file });
      setSuccess("Đã tải lên và xử lý. Xem trạng thái giấy tờ bên dưới.");
      setDocumentType("");
      setFile(null);
      await onUploaded();
    } catch (err) {
      // A wrong-template upload comes back 422; the specific reason is shown on the document row
      // (and via notification), so keep the inline message short and refresh the list either way.
      setError(err instanceof ApiError && err.status === 422
        ? "Giấy tờ bị từ chối (sai mẫu hoặc thiếu thông tin). Xem lý do chi tiết ở giấy tờ vừa nộp bên dưới."
        : err instanceof ApiError ? err.message : "Không thể tải lên giấy tờ.");
      await onUploaded();
    } finally {
      setUploading(false);
    }
  };

  return (
    <form className={styles.panel} onSubmit={submit}>
      <label className={styles.field}>
        <span className={styles.label}>Loại giấy tờ</span>
        <select className={styles.select} value={documentType} onChange={e => setDocumentType(e.target.value)} required>
          <option value="">Chọn giấy tờ cần nộp</option>
          {targets.map(target => (
            <option key={target.documentType} value={target.documentType}>{target.displayName}</option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Tệp (.docx, .pdf hoặc ảnh chụp)</span>
        <input
          className={styles.file}
          type="file"
          accept={ACCEPTED_FILE_TYPES}
          onChange={e => setFile(e.target.files?.[0] ?? null)}
          required
        />
      </label>

      <Button type="submit" variant="primary" isLoading={uploading} disabled={!documentType || !file}>
        <Upload size={15} /> Tải lên & kiểm tra
      </Button>

      {success ? <p className={styles.success}>{success}</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
    </form>
  );
};
