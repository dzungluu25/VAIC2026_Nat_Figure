import { useState } from "react";
import { Play, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { Header } from "../layouts/Header";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { createChecklistVersion, getPublishedChecklist, listChecklistVersions, publishChecklistVersion } from "../services/checklistService";
import { ApiError } from "../services/httpClient";
import { useSessionStore } from "../store/sessionStore";
import type { UserRole } from "../types/api";
import type { ChecklistDocumentType, DocumentChecklistVersion, LoanType } from "../types/document-intake";
import styles from "./adminConsole.module.css";

const parseJson = <T,>(value: string): T => JSON.parse(value) as T;
const pretty = (value: unknown): string => JSON.stringify(value, null, 2);
const messageFrom = (error: unknown, fallback: string): string => error instanceof ApiError || error instanceof Error ? error.message : fallback;
const canManageChecklist = (role?: UserRole) => role === "ADMIN";

export const ChecklistAdminPage = () => {
  const { accessToken, tenantId = "bank-default", role } = useSessionStore();
  const token = accessToken ?? "";

  const [loanType, setLoanType] = useState<LoanType>("mortgage");
  const [checklistVersion, setChecklistVersion] = useState("1.0.1");
  const [itemsJson, setItemsJson] = useState("[]");
  const [versions, setVersions] = useState<DocumentChecklistVersion[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const requireToken = () => {
    if (!token) throw new ApiError("AUTHENTICATION_REQUIRED", 401);
    return token;
  };

  const load = async () => {
    setBusy(true); setMessage(null);
    try {
      const [published, list] = await Promise.all([
        getPublishedChecklist(requireToken(), loanType),
        listChecklistVersions(requireToken(), loanType),
      ]);
      setItemsJson(pretty(published.items));
      setVersions(list.versions);
      setMessage(`Đang đọc checklist published ${published.version}.`);
    } catch (error) {
      setMessage(messageFrom(error, "Không tải được checklist."));
    } finally { setBusy(false); }
  };

  const saveDraft = async () => {
    setBusy(true); setMessage(null);
    try {
      const saved = await createChecklistVersion(requireToken(), loanType, checklistVersion.trim(), parseJson<ChecklistDocumentType[]>(itemsJson));
      await load();
      setMessage(`Đã tạo checklist draft ${saved.loanType}/${saved.version}.`);
    } catch (error) {
      setMessage(messageFrom(error, "Không tạo được checklist draft."));
    } finally { setBusy(false); }
  };

  const publish = async () => {
    setBusy(true); setMessage(null);
    try {
      const published = await publishChecklistVersion(requireToken(), loanType, checklistVersion.trim());
      await load();
      setMessage(`Đã publish checklist ${published.loanType}/${published.version}.`);
    } catch (error) {
      setMessage(messageFrom(error, "Không publish được checklist."));
    } finally { setBusy(false); }
  };

  return (
    <>
      <Header
        eyebrow="Quản trị vận hành"
        title="Phiên bản danh sách kiểm tra giấy tờ"
        subtitle={`Quản lý bộ giấy tờ bắt buộc theo loại vay. Phiên: ${role ?? "?"} · đơn vị ${tenantId}`}
        action={<Badge tone="brand"><ShieldCheck size={13} /> RBAC enforced</Badge>}
      />
      <Card title="Đọc, sửa & phát hành checklist" action={<Save size={16} />}>
        <div className={styles.inlineForm}>
          <label>Loại vay
            <select value={loanType} onChange={e => setLoanType(e.target.value as LoanType)}>
              <option value="mortgage">mortgage</option>
              <option value="unsecured">unsecured</option>
            </select>
          </label>
          <label>Version<input value={checklistVersion} onChange={e => setChecklistVersion(e.target.value)} /></label>
          <Button type="button" variant="secondary" isLoading={busy} onClick={load}><RotateCcw size={14} /> Tải checklist</Button>
        </div>
        <textarea className={styles.jsonEditor} value={itemsJson} onChange={e => setItemsJson(e.target.value)} rows={16} />
        {message ? <p className={styles.message}>{message}</p> : null}
        <div className={styles.actionRow}>
          <Button type="button" variant="secondary" disabled={!canManageChecklist(role) || busy} onClick={saveDraft}><Save size={14} /> Tạo draft</Button>
          <Button type="button" variant="ghost" disabled={!canManageChecklist(role) || busy} onClick={publish}><Play size={14} /> Publish</Button>
        </div>
        <div className={styles.versionList}>{versions.map(item => <Badge key={`${item.loanType}-${item.version}`} tone={item.status === "published" ? "success" : "neutral"}>{item.version} · {item.status}</Badge>)}</div>
        {!canManageChecklist(role) ? <p className={styles.locked}>Chỉ ADMIN được tạo draft/publish checklist; đọc vẫn dùng được.</p> : null}
      </Card>
    </>
  );
};
