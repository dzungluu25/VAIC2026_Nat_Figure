import { randomUUID } from "crypto";
import { pgQuery } from "../../config/pg";
import { ApprovalDecision, ApprovalRecord } from "../../types/platform.types";

export const createApproval = async (input: Omit<ApprovalRecord, "id" | "status" | "createdAt">): Promise<ApprovalRecord> => {
  const record: ApprovalRecord = { ...input, id: randomUUID(), status: "pending", createdAt: new Date().toISOString() };
  await pgQuery(`INSERT INTO approval_records (id,tenant_id,run_id,checkpoint_id,workflow_id,workflow_version,required_role,status,expires_at,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9)`, [record.id,record.tenantId,record.runId,record.checkpointId,record.workflowId,record.workflowVersion,record.requiredRole,record.expiresAt,record.createdAt]);
  return record;
};

export const getPendingApproval = async (tenantId:string,runId:string):Promise<ApprovalRecord|null>=>{
  const result=await pgQuery(`SELECT * FROM approval_records WHERE tenant_id=$1 AND run_id=$2 AND status='pending' AND expires_at>NOW() ORDER BY created_at DESC LIMIT 1`,[tenantId,runId]);
  const row=result.rows[0]; return row?{id:row.id,tenantId:row.tenant_id,runId:row.run_id,checkpointId:row.checkpoint_id,workflowId:row.workflow_id,workflowVersion:row.workflow_version,requiredRole:row.required_role,status:row.status,expiresAt:row.expires_at,createdAt:row.created_at}:null;
};

export const getLatestApproval = async (tenantId:string,runId:string):Promise<ApprovalRecord|null>=>{
  const result=await pgQuery(`SELECT * FROM approval_records WHERE tenant_id=$1 AND run_id=$2 ORDER BY created_at DESC LIMIT 1`,[tenantId,runId]);
  const row=result.rows[0]; return row?{id:row.id,tenantId:row.tenant_id,runId:row.run_id,checkpointId:row.checkpoint_id,workflowId:row.workflow_id,workflowVersion:row.workflow_version,requiredRole:row.required_role,status:row.status,expiresAt:row.expires_at,createdAt:row.created_at,decidedBy:row.decided_by,decidedAt:row.decided_at,comment:row.comment}:null;
};

export const ensurePendingApproval=async(input:Omit<ApprovalRecord,"id"|"status"|"createdAt">):Promise<ApprovalRecord>=>
  (await getLatestApproval(input.tenantId,input.runId))??createApproval(input);

export const decideApproval = async (tenantId: string, runId: string, id: string, decision: ApprovalDecision, actor: string, actorRole: string, comment?: string): Promise<ApprovalRecord> => {
  const result = await pgQuery(`SELECT * FROM approval_records WHERE id=$1 AND run_id=$2 AND tenant_id=$3 FOR UPDATE`, [id, runId, tenantId]);
  const row = result.rows[0]; if (!row) throw new Error("APPROVAL_NOT_FOUND");
  if (row.status !== "pending") throw new Error("APPROVAL_ALREADY_DECIDED");
  if (new Date(row.expires_at).getTime() <= Date.now()) { await pgQuery(`UPDATE approval_records SET status='expired' WHERE id=$1 AND status='pending'`, [id]); throw new Error("APPROVAL_EXPIRED"); }
  if (row.required_role !== actorRole) throw new Error("APPROVAL_ROLE_FORBIDDEN");
  const decidedAt = new Date().toISOString();
  const updated = await pgQuery(`UPDATE approval_records SET status=$4,decided_by=$5,decided_at=$6,comment=$7 WHERE id=$1 AND run_id=$2 AND tenant_id=$3 AND status='pending' RETURNING *`, [id,runId,tenantId,decision,actor,decidedAt,comment]);
  if (!updated.rows[0]) throw new Error("APPROVAL_REPLAYED");
  return { id,tenantId,runId,checkpointId:row.checkpoint_id,workflowId:row.workflow_id,workflowVersion:row.workflow_version,requiredRole:row.required_role,status:decision,expiresAt:row.expires_at,createdAt:row.created_at,decidedBy:actor,decidedAt,comment };
};

export const getApprovedRecord = async (tenantId: string, runId: string): Promise<ApprovalRecord | null> => {
  const result = await pgQuery(`SELECT * FROM approval_records WHERE tenant_id=$1 AND run_id=$2 AND status='approved' AND expires_at>NOW() ORDER BY decided_at DESC LIMIT 1`, [tenantId,runId]);
  const row=result.rows[0]; return row ? { id:row.id,tenantId:row.tenant_id,runId:row.run_id,checkpointId:row.checkpoint_id,workflowId:row.workflow_id,workflowVersion:row.workflow_version,requiredRole:row.required_role,status:row.status,expiresAt:row.expires_at,createdAt:row.created_at,decidedBy:row.decided_by,decidedAt:row.decided_at,comment:row.comment } : null;
};
