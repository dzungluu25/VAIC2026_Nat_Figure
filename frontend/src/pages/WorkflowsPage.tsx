import { useEffect, useMemo, useState } from "react";
import { GitBranch, Play, Save, ShieldCheck, Workflow } from "lucide-react";
import { Header } from "../layouts/Header";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { createWorkflowVersion, listWorkflowVersions, publishWorkflowVersion, validateWorkflow } from "../services/platformService";
import { ApiError } from "../services/httpClient";
import { useSessionStore } from "../store/sessionStore";
import type { UserRole, ValidationIssue, WorkflowDefinition, WorkflowVersion } from "../types/api";
import styles from "./adminConsole.module.css";

const buildWorkflowDraft = (tenantId: string): WorkflowDefinition => ({
  id: "loan-pre-approval",
  tenantId,
  name: "Loan pre-approval",
  nodes: [
    { id: "start", type: "start" },
    { id: "planner", type: "planner" },
    { id: "profile", type: "agent", citationRequired: true, retryLimit: 2, outputSchema: { type: "object" } },
    { id: "product", type: "agent", citationRequired: true, retryLimit: 3, outputSchema: { type: "object" } },
    { id: "credit", type: "agent", citationRequired: true, retryLimit: 3, outputSchema: { type: "object" } },
    { id: "fraud", type: "agent", citationRequired: true, retryLimit: 3, outputSchema: { type: "object" } },
    { id: "legal", type: "agent", citationRequired: true, retryLimit: 3, outputSchema: { type: "object" } },
    { id: "legal-audit", type: "agent", citationRequired: true, outputSchema: { type: "object" } },
    { id: "risk-consolidation", type: "agent", citationRequired: true, outputSchema: { type: "object" } },
    { id: "human-approval", type: "human_gate" },
    { id: "activate-loan", type: "action", risk: "high", allowedTools: ["reserveCreditLimit", "createLoanCase"], compensationNodeId: "compensate-loan" },
    { id: "compensate-loan", type: "compensation" },
    { id: "end", type: "end" },
  ],
  edges: [
    { from: "start", to: "planner" },
    { from: "planner", to: "profile" },
    { from: "profile", to: "product" },
    { from: "product", to: "credit" },
    { from: "credit", to: "fraud" },
    { from: "fraud", to: "legal" },
    { from: "legal", to: "product", condition: "insurance_tying_pricing_conflict" },
    { from: "legal", to: "legal-audit", fallback: true },
    { from: "legal-audit", to: "risk-consolidation" },
    { from: "risk-consolidation", to: "human-approval" },
    { from: "human-approval", to: "activate-loan" },
    { from: "activate-loan", to: "end" },
  ],
});

const parseJson = <T,>(value: string): T => JSON.parse(value) as T;
const pretty = (value: unknown): string => JSON.stringify(value, null, 2);
const messageFrom = (error: unknown, fallback: string): string => error instanceof ApiError || error instanceof Error ? error.message : fallback;
const canApprove = (role?: UserRole) => role === "CREDIT_APPROVER";

export const WorkflowsPage = () => {
  const { accessToken, tenantId = "bank-default", role } = useSessionStore();
  const token = accessToken ?? "";
  const workflowDraft = useMemo(() => buildWorkflowDraft(tenantId), [tenantId]);

  const [workflowId, setWorkflowId] = useState("loan-pre-approval");
  const [workflowVersion, setWorkflowVersion] = useState("1.0.1");
  const [workflowJson, setWorkflowJson] = useState(pretty(workflowDraft));
  const [versions, setVersions] = useState<WorkflowVersion[]>([]);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setWorkflowJson(pretty(workflowDraft)); }, [workflowDraft]);

  const requireToken = () => {
    if (!token) throw new ApiError("AUTHENTICATION_REQUIRED", 401);
    return token;
  };

  const loadVersions = async () => {
    if (!workflowId.trim()) return;
    setBusy(true); setMessage(null);
    try {
      setVersions((await listWorkflowVersions(requireToken(), workflowId.trim())).versions);
    } catch (error) {
      setVersions([]); setMessage(messageFrom(error, "Không tải được danh sách version."));
    } finally { setBusy(false); }
  };

  const validateDraft = async () => {
    setBusy(true); setMessage(null);
    try {
      const result = await validateWorkflow(requireToken(), parseJson<WorkflowDefinition>(workflowJson));
      setIssues(result.issues);
      setMessage(result.valid ? "Workflow hợp lệ." : "Workflow cần sửa trước khi publish.");
    } catch (error) {
      setIssues([]); setMessage(messageFrom(error, "Không validate được workflow (kiểm tra JSON)."));
    } finally { setBusy(false); }
  };

  const saveDraft = async () => {
    setBusy(true); setMessage(null);
    try {
      const saved = await createWorkflowVersion(requireToken(), parseJson<WorkflowDefinition>(workflowJson), workflowVersion.trim());
      await loadVersions();
      setMessage(`Đã tạo workflow draft ${saved.workflowId}/${saved.version}.`);
    } catch (error) {
      setMessage(messageFrom(error, "Không tạo được workflow draft."));
    } finally { setBusy(false); }
  };

  const publish = async () => {
    setBusy(true); setMessage(null);
    try {
      const published = await publishWorkflowVersion(requireToken(), workflowId.trim(), workflowVersion.trim());
      await loadVersions();
      setMessage(`Đã publish workflow ${published.workflowId}/${published.version}.`);
    } catch (error) {
      setMessage(messageFrom(error, "Không publish được workflow."));
    } finally { setBusy(false); }
  };

  return (
    <>
      <Header
        eyebrow="Quản trị vận hành"
        title="Workflow registry"
        subtitle={`Định nghĩa, kiểm tra và phát hành phiên bản workflow. Phiên: ${role ?? "?"} · tenant ${tenantId}`}
        action={<Badge tone="brand"><ShieldCheck size={13} /> RBAC enforced</Badge>}
      />
      <Card title="Định nghĩa & phát hành" action={<Workflow size={16} />}>
        <div className={styles.inlineForm}>
          <label>Workflow ID<input value={workflowId} onChange={e => setWorkflowId(e.target.value)} /></label>
          <label>Version<input value={workflowVersion} onChange={e => setWorkflowVersion(e.target.value)} /></label>
          <Button type="button" variant="secondary" isLoading={busy} onClick={loadVersions}><GitBranch size={14} /> Versions</Button>
        </div>
        <textarea className={styles.jsonEditor} value={workflowJson} onChange={e => setWorkflowJson(e.target.value)} rows={16} />
        {message ? <p className={styles.message}>{message}</p> : null}
        {issues.length > 0 ? <ul className={styles.issueList}>{issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.nodeId ? `${issue.nodeId}: ` : ""}{issue.message}</li>)}</ul> : null}
        <div className={styles.actionRow}>
          <Button type="button" variant="secondary" isLoading={busy} onClick={validateDraft}><ShieldCheck size={14} /> Validate</Button>
          <Button type="button" variant="secondary" isLoading={busy} onClick={saveDraft}><Save size={14} /> Tạo draft</Button>
          <Button type="button" variant="ghost" disabled={!canApprove(role) || busy} onClick={publish}><Play size={14} /> Publish</Button>
        </div>
        <div className={styles.versionList}>{versions.map(item => <Badge key={`${item.workflowId}-${item.version}`} tone={item.status === "published" ? "success" : "neutral"}>{item.version} · {item.status}</Badge>)}</div>
        {!canApprove(role) ? <p className={styles.locked}>Chỉ CREDIT_APPROVER được publish; các thao tác khác vẫn dùng được.</p> : null}
      </Card>
    </>
  );
};
