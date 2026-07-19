import { useState, type FormEvent } from "react";
import { History, Play, ShieldCheck } from "lucide-react";
import { Header } from "../layouts/Header";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { decideRunApproval, getRun, getRunEvents, resumeRun } from "../services/platformService";
import { ApiError } from "../services/httpClient";
import { useSessionStore } from "../store/sessionStore";
import type { ApprovalDecision, AuditEvent, RunRecord, UserRole } from "../types/api";
import styles from "./adminConsole.module.css";

const APPROVAL_OPTIONS: ApprovalDecision[] = ["approved", "rejected", "more_information"];
const messageFrom = (error: unknown, fallback: string): string => error instanceof ApiError || error instanceof Error ? error.message : fallback;
const canApprove = (role?: UserRole) => role === "CREDIT_APPROVER";

export const RunsPage = () => {
  const { accessToken, tenantId = "bank-default", role } = useSessionStore();
  const token = accessToken ?? "";

  const [runId, setRunId] = useState("");
  const [run, setRun] = useState<RunRecord | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [approvalId, setApprovalId] = useState("");
  const [decision, setDecision] = useState<ApprovalDecision>("approved");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const requireToken = () => {
    if (!token) throw new ApiError("AUTHENTICATION_REQUIRED", 401);
    return token;
  };

  const loadRun = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!runId.trim()) return;
    setBusy(true); setMessage(null);
    try {
      const [runResult, eventResult] = await Promise.all([getRun(requireToken(), runId.trim()), getRunEvents(requireToken(), runId.trim())]);
      setRun(runResult); setEvents(eventResult.events);
    } catch (error) {
      setRun(null); setEvents([]); setMessage(messageFrom(error, "Không tải được run."));
    } finally { setBusy(false); }
  };

  const submitApproval = async () => {
    if (!runId.trim() || !approvalId.trim()) return;
    setBusy(true); setMessage(null);
    try {
      await decideRunApproval(requireToken(), runId.trim(), approvalId.trim(), decision, comment.trim() || undefined);
      setMessage("Đã ghi nhận quyết định phê duyệt.");
      await loadRun();
    } catch (error) {
      setMessage(messageFrom(error, "Không thể phê duyệt run."));
    } finally { setBusy(false); }
  };

  const resumeSelectedRun = async () => {
    if (!runId.trim()) return;
    setBusy(true); setMessage(null);
    try {
      await resumeRun(requireToken(), runId.trim());
      setMessage("Đã resume run.");
      await loadRun();
    } catch (error) {
      setMessage(messageFrom(error, "Không thể resume run."));
    } finally { setBusy(false); }
  };

  return (
    <>
      <Header
        eyebrow="Quản trị vận hành"
        title="Lần chạy, phê duyệt và kiểm toán"
        subtitle={`Tra cứu lần chạy, quyết định qua cổng phê duyệt thủ công và xem nhật ký kiểm toán. Phiên: ${role ?? "?"} · đơn vị ${tenantId}`}
        action={<Badge tone="brand"><ShieldCheck size={13} /> RBAC enforced</Badge>}
      />
      <Card title="Tra cứu & quyết định run" action={<History size={16} />}>
        <form className={styles.inlineForm} onSubmit={loadRun}>
          <label>Run ID<input value={runId} onChange={e => setRunId(e.target.value)} placeholder="run-..." /></label>
          <Button type="submit" variant="secondary" isLoading={busy}><History size={14} /> Tải run</Button>
        </form>
        {message ? <p className={styles.message}>{message}</p> : null}
        {run ? (
          <div className={styles.summary}>
            <div><small>Trạng thái</small><strong>{run.status}</strong></div>
            <div><small>Case</small><strong>{run.case_id}</strong></div>
            <div><small>Workflow</small><strong>{run.workflow_id}/{run.workflow_version}</strong></div>
            <div><small>Config</small><strong>{run.config_version}</strong></div>
          </div>
        ) : null}
        <div className={styles.inlineForm}>
          <label>Approval ID<input value={approvalId} onChange={e => setApprovalId(e.target.value)} placeholder="approval id" /></label>
          <label>Quyết định
            <select value={decision} onChange={e => setDecision(e.target.value as ApprovalDecision)}>
              {APPROVAL_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <label>Ghi chú<input value={comment} onChange={e => setComment(e.target.value)} /></label>
          <Button type="button" variant="secondary" disabled={!canApprove(role) || busy || !runId.trim() || !approvalId.trim()} onClick={submitApproval}>
            <ShieldCheck size={14} /> Quyết định
          </Button>
          <Button type="button" variant="ghost" disabled={!canApprove(role) || busy || !runId.trim()} onClick={resumeSelectedRun}>
            <Play size={14} /> Resume
          </Button>
        </div>
        {!canApprove(role) ? <p className={styles.locked}>Chỉ CREDIT_APPROVER được quyết định/resume run; tra cứu vẫn dùng được.</p> : null}
        <ul className={styles.eventList}>
          {events.map(event => (
            <li key={event.eventId}>
              <span><strong>{event.actionType}</strong><small>{new Date(event.timestamp).toLocaleString("vi-VN")} · {event.actor}</small></span>
              <Badge tone={event.status === "blocked" ? "danger" : "success"}>{event.status}</Badge>
              <p>{event.details}</p>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
};
