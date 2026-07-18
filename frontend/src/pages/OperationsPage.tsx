import { useEffect, useMemo, useState, type FormEvent } from "react";
import { GitBranch, History, Play, RotateCcw, Save, ShieldCheck, UserCog, Workflow } from "lucide-react";
import { Header } from "../layouts/Header";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { changeUserRole } from "../services/authorizationService";
import { createChecklistVersion, getPublishedChecklist, listChecklistVersions, publishChecklistVersion } from "../services/checklistService";
import { createWorkflowVersion, decideRunApproval, getRun, getRunEvents, listWorkflowVersions, publishWorkflowVersion, resumeRun, validateWorkflow } from "../services/platformService";
import { ApiError } from "../services/httpClient";
import { useSessionStore } from "../store/sessionStore";
import type { ApprovalDecision, AuditEvent, RunRecord, UserRole, ValidationIssue, WorkflowDefinition, WorkflowVersion } from "../types/api";
import type { ChecklistDocumentType, DocumentChecklistVersion, LoanType } from "../types/document-intake";
import styles from "./OperationsPage.module.css";

const ROLE_OPTIONS: UserRole[] = ["CUSTOMER", "CREDIT_OFFICER", "CREDIT_APPROVER", "ADMIN", "AUDITOR"];
const APPROVAL_OPTIONS: ApprovalDecision[] = ["approved", "rejected", "more_information"];

const buildWorkflowDraft = (tenantId: string): WorkflowDefinition => ({
  id: "loan-pre-approval",
  tenantId,
  name: "Loan pre-approval",
  nodes: [
    { id: "start", type: "start" },
    { id: "profile", type: "agent", citationRequired: true, retryLimit: 2, outputSchema: { type: "object" } },
    { id: "human-approval", type: "human_gate" },
    { id: "activate-loan", type: "action", risk: "high", allowedTools: ["reserveCreditLimit", "createLoanCase"], compensationNodeId: "compensate-loan" },
    { id: "compensate-loan", type: "compensation" },
    { id: "end", type: "end" },
  ],
  edges: [
    { from: "start", to: "profile" },
    { from: "profile", to: "human-approval" },
    { from: "human-approval", to: "activate-loan" },
    { from: "activate-loan", to: "end" },
  ],
});

const parseJson = <T,>(value: string): T => JSON.parse(value) as T;
const pretty = (value: unknown): string => JSON.stringify(value, null, 2);
const messageFrom = (error: unknown, fallback: string): string => error instanceof ApiError || error instanceof Error ? error.message : fallback;
const canManageChecklist = (role?: UserRole) => role === "ADMIN";
const canManageUsers = (role?: UserRole) => role === "ADMIN";
const canApprove = (role?: UserRole) => role === "CREDIT_APPROVER";

export const OperationsPage = () => {
  const { accessToken, tenantId = "bank-default", role } = useSessionStore();
  const token = accessToken ?? "";
  const workflowDraft = useMemo(() => buildWorkflowDraft(tenantId), [tenantId]);

  const [runId, setRunId] = useState("");
  const [run, setRun] = useState<RunRecord | null>(null);
  const [runEvents, setRunEvents] = useState<AuditEvent[]>([]);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [approvalId, setApprovalId] = useState("");
  const [approvalDecision, setApprovalDecision] = useState<ApprovalDecision>("approved");
  const [approvalComment, setApprovalComment] = useState("");
  const [runBusy, setRunBusy] = useState(false);

  const [workflowId, setWorkflowId] = useState("loan-pre-approval");
  const [workflowVersion, setWorkflowVersion] = useState("1.0.1");
  const [workflowJson, setWorkflowJson] = useState(pretty(workflowDraft));
  const [workflowVersions, setWorkflowVersions] = useState<WorkflowVersion[]>([]);
  const [workflowIssues, setWorkflowIssues] = useState<ValidationIssue[]>([]);
  const [workflowMessage, setWorkflowMessage] = useState<string | null>(null);
  const [workflowBusy, setWorkflowBusy] = useState(false);

  const [loanType, setLoanType] = useState<LoanType>("mortgage");
  const [checklistVersion, setChecklistVersion] = useState("1.0.1");
  const [checklistItemsJson, setChecklistItemsJson] = useState("[]");
  const [checklistVersions, setChecklistVersions] = useState<DocumentChecklistVersion[]>([]);
  const [checklistMessage, setChecklistMessage] = useState<string | null>(null);
  const [checklistBusy, setChecklistBusy] = useState(false);

  const [targetUserId, setTargetUserId] = useState("");
  const [targetRole, setTargetRole] = useState<UserRole>("CREDIT_OFFICER");
  const [roleMessage, setRoleMessage] = useState<string | null>(null);
  const [roleBusy, setRoleBusy] = useState(false);

  useEffect(() => {
    setWorkflowJson(pretty(workflowDraft));
  }, [workflowDraft]);

  const requireToken = () => {
    if (!token) throw new ApiError("AUTHENTICATION_REQUIRED", 401);
    return token;
  };

  const loadRun = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!runId.trim()) return;
    setRunBusy(true);
    setRunMessage(null);
    try {
      const currentToken = requireToken();
      const [runResult, eventResult] = await Promise.all([getRun(currentToken, runId.trim()), getRunEvents(currentToken, runId.trim())]);
      setRun(runResult);
      setRunEvents(eventResult.events);
    } catch (error) {
      setRun(null);
      setRunEvents([]);
      setRunMessage(messageFrom(error, "Khong tai duoc run."));
    } finally {
      setRunBusy(false);
    }
  };

  const submitApproval = async () => {
    if (!runId.trim() || !approvalId.trim()) return;
    setRunBusy(true);
    setRunMessage(null);
    try {
      await decideRunApproval(requireToken(), runId.trim(), approvalId.trim(), approvalDecision, approvalComment.trim() || undefined);
      setRunMessage("Da ghi nhan quyet dinh phe duyet.");
      await loadRun();
    } catch (error) {
      setRunMessage(messageFrom(error, "Khong the phe duyet run."));
    } finally {
      setRunBusy(false);
    }
  };

  const resumeSelectedRun = async () => {
    if (!runId.trim()) return;
    setRunBusy(true);
    setRunMessage(null);
    try {
      await resumeRun(requireToken(), runId.trim());
      setRunMessage("Da resume run.");
      await loadRun();
    } catch (error) {
      setRunMessage(messageFrom(error, "Khong the resume run."));
    } finally {
      setRunBusy(false);
    }
  };

  const loadWorkflowVersions = async () => {
    if (!workflowId.trim()) return;
    setWorkflowBusy(true);
    setWorkflowMessage(null);
    try {
      const result = await listWorkflowVersions(requireToken(), workflowId.trim());
      setWorkflowVersions(result.versions);
    } catch (error) {
      setWorkflowVersions([]);
      setWorkflowMessage(messageFrom(error, "Khong tai duoc workflow versions."));
    } finally {
      setWorkflowBusy(false);
    }
  };

  const validateWorkflowDraft = async () => {
    setWorkflowBusy(true);
    setWorkflowMessage(null);
    try {
      const result = await validateWorkflow(requireToken(), parseJson<WorkflowDefinition>(workflowJson));
      setWorkflowIssues(result.issues);
      setWorkflowMessage(result.valid ? "Workflow hop le." : "Workflow can sua truoc khi publish.");
    } catch (error) {
      setWorkflowIssues([]);
      setWorkflowMessage(messageFrom(error, "Khong validate duoc workflow."));
    } finally {
      setWorkflowBusy(false);
    }
  };

  const saveWorkflowDraft = async () => {
    setWorkflowBusy(true);
    setWorkflowMessage(null);
    try {
      const saved = await createWorkflowVersion(requireToken(), parseJson<WorkflowDefinition>(workflowJson), workflowVersion.trim());
      await loadWorkflowVersions();
      setWorkflowMessage(`Da tao workflow draft ${saved.workflowId}/${saved.version}.`);
    } catch (error) {
      setWorkflowMessage(messageFrom(error, "Khong tao duoc workflow draft."));
    } finally {
      setWorkflowBusy(false);
    }
  };

  const publishWorkflow = async () => {
    setWorkflowBusy(true);
    setWorkflowMessage(null);
    try {
      const published = await publishWorkflowVersion(requireToken(), workflowId.trim(), workflowVersion.trim());
      await loadWorkflowVersions();
      setWorkflowMessage(`Da publish workflow ${published.workflowId}/${published.version}.`);
    } catch (error) {
      setWorkflowMessage(messageFrom(error, "Khong publish duoc workflow."));
    } finally {
      setWorkflowBusy(false);
    }
  };

  const loadChecklist = async () => {
    setChecklistBusy(true);
    setChecklistMessage(null);
    try {
      const [published, versions] = await Promise.all([
        getPublishedChecklist(requireToken(), loanType),
        listChecklistVersions(requireToken(), loanType),
      ]);
      setChecklistItemsJson(pretty(published.items));
      setChecklistVersions(versions.versions);
      setChecklistMessage(`Dang doc checklist published ${published.version}.`);
    } catch (error) {
      setChecklistMessage(messageFrom(error, "Khong tai duoc checklist."));
    } finally {
      setChecklistBusy(false);
    }
  };

  const saveChecklist = async () => {
    setChecklistBusy(true);
    setChecklistMessage(null);
    try {
      const saved = await createChecklistVersion(requireToken(), loanType, checklistVersion.trim(), parseJson<ChecklistDocumentType[]>(checklistItemsJson));
      await loadChecklist();
      setChecklistMessage(`Da tao checklist draft ${saved.loanType}/${saved.version}.`);
    } catch (error) {
      setChecklistMessage(messageFrom(error, "Khong tao duoc checklist draft."));
    } finally {
      setChecklistBusy(false);
    }
  };

  const publishChecklist = async () => {
    setChecklistBusy(true);
    setChecklistMessage(null);
    try {
      const published = await publishChecklistVersion(requireToken(), loanType, checklistVersion.trim());
      await loadChecklist();
      setChecklistMessage(`Da publish checklist ${published.loanType}/${published.version}.`);
    } catch (error) {
      setChecklistMessage(messageFrom(error, "Khong publish duoc checklist."));
    } finally {
      setChecklistBusy(false);
    }
  };

  const submitRoleChange = async (event: FormEvent) => {
    event.preventDefault();
    setRoleBusy(true);
    setRoleMessage(null);
    try {
      const changed = await changeUserRole(requireToken(), targetUserId.trim(), targetRole);
      setRoleMessage(`Da doi ${changed.userId} thanh ${changed.role}.`);
    } catch (error) {
      setRoleMessage(messageFrom(error, "Khong doi duoc role."));
    } finally {
      setRoleBusy(false);
    }
  };

  return (
    <>
      <Header
        eyebrow="Backend operations"
        title="Các luồng backend chưa nằm trong workspace"
        subtitle={`Phiên hiện tại: ${role ?? "chưa xác định"} · tenant ${tenantId}`}
        action={<Badge tone="brand"><ShieldCheck size={13} /> RBAC enforced</Badge>}
      />

      <div className={styles.grid}>
        <Card title="Run, approval và audit events" action={<History size={16} />}>
          <form className={styles.inlineForm} onSubmit={loadRun}>
            <label>Run ID<input value={runId} onChange={event => setRunId(event.target.value)} placeholder="run-..." /></label>
            <Button type="submit" variant="secondary" isLoading={runBusy}><History size={14} /> Tải run</Button>
          </form>
          {runMessage ? <p className={styles.message}>{runMessage}</p> : null}
          {run ? (
            <div className={styles.summary}>
              <div><small>Trạng thái</small><strong>{run.status}</strong></div>
              <div><small>Case</small><strong>{run.case_id}</strong></div>
              <div><small>Workflow</small><strong>{run.workflow_id}/{run.workflow_version}</strong></div>
              <div><small>Config</small><strong>{run.config_version}</strong></div>
            </div>
          ) : null}
          <div className={styles.inlineForm}>
            <label>Approval ID<input value={approvalId} onChange={event => setApprovalId(event.target.value)} placeholder="approval id" /></label>
            <label>Quyết định
              <select value={approvalDecision} onChange={event => setApprovalDecision(event.target.value as ApprovalDecision)}>
                {APPROVAL_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label>Ghi chú<input value={approvalComment} onChange={event => setApprovalComment(event.target.value)} /></label>
            <Button type="button" variant="secondary" disabled={!canApprove(role) || runBusy || !runId.trim() || !approvalId.trim()} onClick={submitApproval}>
              <ShieldCheck size={14} /> Quyết định
            </Button>
            <Button type="button" variant="ghost" disabled={!canApprove(role) || runBusy || !runId.trim()} onClick={resumeSelectedRun}>
              <Play size={14} /> Resume
            </Button>
          </div>
          <ul className={styles.eventList}>
            {runEvents.map(event => (
              <li key={event.eventId}>
                <span><strong>{event.actionType}</strong><small>{new Date(event.timestamp).toLocaleString("vi-VN")} · {event.actor}</small></span>
                <Badge tone={event.status === "blocked" ? "danger" : "success"}>{event.status}</Badge>
                <p>{event.details}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Workflow registry" action={<Workflow size={16} />}>
          <div className={styles.inlineForm}>
            <label>Workflow ID<input value={workflowId} onChange={event => setWorkflowId(event.target.value)} /></label>
            <label>Version<input value={workflowVersion} onChange={event => setWorkflowVersion(event.target.value)} /></label>
            <Button type="button" variant="secondary" isLoading={workflowBusy} onClick={loadWorkflowVersions}><GitBranch size={14} /> Versions</Button>
          </div>
          <textarea className={styles.jsonEditor} value={workflowJson} onChange={event => setWorkflowJson(event.target.value)} rows={13} />
          {workflowMessage ? <p className={styles.message}>{workflowMessage}</p> : null}
          {workflowIssues.length > 0 ? <ul className={styles.issueList}>{workflowIssues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.nodeId ? `${issue.nodeId}: ` : ""}{issue.message}</li>)}</ul> : null}
          <div className={styles.actionRow}>
            <Button type="button" variant="secondary" isLoading={workflowBusy} onClick={validateWorkflowDraft}><ShieldCheck size={14} /> Validate</Button>
            <Button type="button" variant="secondary" isLoading={workflowBusy} onClick={saveWorkflowDraft}><Save size={14} /> Tạo draft</Button>
            <Button type="button" variant="ghost" disabled={!canApprove(role) || workflowBusy} onClick={publishWorkflow}><Play size={14} /> Publish</Button>
          </div>
          <div className={styles.versionList}>{workflowVersions.map(item => <Badge key={`${item.workflowId}-${item.version}`} tone={item.status === "published" ? "success" : "neutral"}>{item.version} · {item.status}</Badge>)}</div>
        </Card>

        <Card title="Document checklist versions" action={<Save size={16} />}>
          <div className={styles.inlineForm}>
            <label>Loại vay
              <select value={loanType} onChange={event => setLoanType(event.target.value as LoanType)}>
                <option value="mortgage">mortgage</option>
                <option value="unsecured">unsecured</option>
              </select>
            </label>
            <label>Version<input value={checklistVersion} onChange={event => setChecklistVersion(event.target.value)} /></label>
            <Button type="button" variant="secondary" isLoading={checklistBusy} onClick={loadChecklist}><RotateCcw size={14} /> Tải checklist</Button>
          </div>
          <textarea className={styles.jsonEditor} value={checklistItemsJson} onChange={event => setChecklistItemsJson(event.target.value)} rows={12} />
          {checklistMessage ? <p className={styles.message}>{checklistMessage}</p> : null}
          <div className={styles.actionRow}>
            <Button type="button" variant="secondary" disabled={!canManageChecklist(role) || checklistBusy} onClick={saveChecklist}><Save size={14} /> Tạo draft</Button>
            <Button type="button" variant="ghost" disabled={!canManageChecklist(role) || checklistBusy} onClick={publishChecklist}><Play size={14} /> Publish</Button>
          </div>
          <div className={styles.versionList}>{checklistVersions.map(item => <Badge key={`${item.loanType}-${item.version}`} tone={item.status === "published" ? "success" : "neutral"}>{item.version} · {item.status}</Badge>)}</div>
        </Card>

        <Card title="User role admin" action={<UserCog size={16} />}>
          <form className={styles.inlineForm} onSubmit={submitRoleChange}>
            <label>User ID<input required value={targetUserId} onChange={event => setTargetUserId(event.target.value)} placeholder="admin.demo / officer.tam" /></label>
            <label>Role
              <select value={targetRole} onChange={event => setTargetRole(event.target.value as UserRole)}>
                {ROLE_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <Button type="submit" variant="secondary" isLoading={roleBusy} disabled={!canManageUsers(role) || roleBusy || !targetUserId.trim()}>
              <UserCog size={14} /> Đổi role
            </Button>
          </form>
          {roleMessage ? <p className={styles.message}>{roleMessage}</p> : null}
          {!canManageUsers(role) ? <p className={styles.locked}>Chỉ ADMIN được gọi API đổi role; backend sẽ trả 403 nếu role hiện tại không đủ quyền.</p> : null}
        </Card>
      </div>
    </>
  );
};
