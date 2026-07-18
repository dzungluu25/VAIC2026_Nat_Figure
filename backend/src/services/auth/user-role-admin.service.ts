import { AuthorizationContext, UserRole } from "../../config/authorization";
import { pgPool } from "../../config/pg";
import { recordAuditEvent } from "../governance/audit-log.service";

interface TargetUser {
  user_id: string;
  customer_id: string | null;
  branch_id: string | null;
  team_id: string | null;
}

export const changeUserRole = async (
  context: AuthorizationContext,
  targetUserId: string,
  role: UserRole
): Promise<{ userId: string; role: UserRole }> => {
  if (context.userId === targetUserId) throw new Error("SELF_ROLE_CHANGE_FORBIDDEN");

  const client = await pgPool.connect();
  try {
    await client.query("BEGIN");
    const targetResult = await client.query<TargetUser>(
      `SELECT user_id,customer_id,branch_id,team_id FROM app_users
       WHERE tenant_id=$1 AND user_id=$2 AND status='ACTIVE' FOR UPDATE`,
      [context.tenantId, targetUserId]
    );
    const target = targetResult.rows[0];
    if (!target) throw new Error("AUTHORIZATION_USER_NOT_FOUND");
    if (role === "CUSTOMER" && !target.customer_id) throw new Error("CUSTOMER_ROLE_REQUIRES_CUSTOMER_ID");

    await client.query(`DELETE FROM user_roles WHERE tenant_id=$1 AND user_id=$2`, [context.tenantId, targetUserId]);
    await client.query(
      `INSERT INTO user_roles (tenant_id,user_id,role,assigned_by,assigned_at) VALUES ($1,$2,$3,$4,NOW())`,
      [context.tenantId, targetUserId, role, context.userId]
    );

    await client.query(`DELETE FROM user_scope_assignments WHERE tenant_id=$1 AND user_id=$2`, [context.tenantId, targetUserId]);
    const scopes: Array<[string, string]> = [];
    if (role === "ADMIN" || role === "AUDITOR") scopes.push(["TENANT", context.tenantId]);
    if (role === "CUSTOMER" && target.customer_id) scopes.push(["CUSTOMER", target.customer_id]);
    if ((role === "CREDIT_OFFICER" || role === "CREDIT_APPROVER") && target.branch_id) scopes.push(["BRANCH", target.branch_id]);
    if ((role === "CREDIT_OFFICER" || role === "CREDIT_APPROVER") && target.team_id) scopes.push(["TEAM", target.team_id]);
    for (const [scopeType, scopeRef] of scopes) {
      await client.query(
        `INSERT INTO user_scope_assignments (tenant_id,user_id,scope_type,scope_ref,assigned_by,assigned_at)
         VALUES ($1,$2,$3,$4,$5,NOW())`,
        [context.tenantId, targetUserId, scopeType, scopeRef, context.userId]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  await recordAuditEvent(
    "authorization",
    context.userId,
    "human_approval",
    { targetUserId, role },
    "allowed",
    `user_id=${context.userId}; role=${context.role}; action=USER_ROLE_CHANGE; target_user_id=${targetUserId}; new_role=${role}.`
  );
  return { userId: targetUserId, role };
};
