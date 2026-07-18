import { AuthorizationContext } from "../../config/authorization";
import { pgQuery } from "../../config/pg";
import { recordAuditEvent } from "../governance/audit-log.service";
import { getScopedDossier } from "./dossier.service";

export const reassignDossier = async (
  context: AuthorizationContext,
  dossierId: string,
  targetOfficerId: string
): Promise<{ dossierId: string; assignedOfficer: string; assignedAt: string }> => {
  const dossier = await getScopedDossier(context, dossierId);
  if (!dossier) throw new Error("DOSSIER_NOT_FOUND");

  const targetResult = await pgQuery(
    `SELECT u.user_id,u.branch_id,u.team_id
     FROM app_users u JOIN user_roles ur ON ur.tenant_id=u.tenant_id AND ur.user_id=u.user_id
     WHERE u.tenant_id=$1 AND u.user_id=$2 AND ur.role='CREDIT_OFFICER' AND u.status='ACTIVE'`,
    [context.tenantId, targetOfficerId]
  );
  const target = targetResult.rows[0] as { user_id: string; branch_id: string | null; team_id: string | null } | undefined;
  if (!target) throw new Error("TARGET_CREDIT_OFFICER_NOT_FOUND");
  if (dossier.teamId && target.team_id !== dossier.teamId) throw new Error("TARGET_OFFICER_OUTSIDE_DOSSIER_TEAM");
  if (!dossier.teamId && dossier.branchId && target.branch_id !== dossier.branchId) throw new Error("TARGET_OFFICER_OUTSIDE_DOSSIER_BRANCH");

  const assignedAt = new Date().toISOString();
  await pgQuery(
    `INSERT INTO dossier_review_assignments (dossier_id,tenant_id,assigned_officer,assigned_at)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (dossier_id) DO UPDATE SET assigned_officer=EXCLUDED.assigned_officer,assigned_at=EXCLUDED.assigned_at`,
    [dossierId, context.tenantId, targetOfficerId, assignedAt]
  );

  await recordAuditEvent(
    dossierId,
    context.userId,
    "human_approval",
    { targetOfficerId },
    "allowed",
    `user_id=${context.userId}; role=${context.role}; action=DOSSIER_REASSIGN; dossier_id=${dossierId}; assigned_officer=${targetOfficerId}.`
  );

  return { dossierId, assignedOfficer: targetOfficerId, assignedAt };
};
