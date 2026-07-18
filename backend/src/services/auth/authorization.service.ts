import { AuthTokenPayload } from "../../config/auth";
import {
  AuthorizationContext,
  AuthorizationScope,
  ScopeType,
  UserRole,
  isUserRole,
} from "../../config/authorization";
import { pgQuery } from "../../config/pg";

interface AuthorizationUserRow {
  user_id: string;
  username: string;
  tenant_id: string;
  role: string;
  customer_id: string | null;
  branch_id: string | null;
  team_id: string | null;
}

const loadScopes = async (tenantId: string, userId: string): Promise<AuthorizationScope[]> => {
  const result = await pgQuery(
    `SELECT scope_type,scope_ref FROM user_scope_assignments WHERE tenant_id=$1 AND user_id=$2 ORDER BY scope_type,scope_ref`,
    [tenantId, userId]
  );
  return result.rows.map((row: { scope_type: ScopeType; scope_ref: string }) => ({ type: row.scope_type, ref: row.scope_ref }));
};

/** Resolves every JWT identity against current DB authorization state, invalidating stale role tokens after a role change. */
export const loadAuthorizationContext = async (payload: AuthTokenPayload): Promise<AuthorizationContext | null> => {
  const result = await pgQuery(
    `SELECT u.user_id,u.username,u.tenant_id,u.customer_id,u.branch_id,u.team_id,ur.role
     FROM app_users u
     JOIN user_roles ur ON ur.tenant_id=u.tenant_id AND ur.user_id=u.user_id
     WHERE u.tenant_id=$1 AND u.username=$2 AND ur.role=$3 AND u.status='ACTIVE'
     LIMIT 1`,
    [payload.tenantId, payload.sub, payload.role]
  );
  const row = result.rows[0] as AuthorizationUserRow | undefined;
  if (!row || !isUserRole(row.role)) return null;

  return {
    sub: payload.sub,
    userId: row.user_id,
    role: row.role,
    tenantId: row.tenant_id,
    customerId: row.customer_id,
    branchId: row.branch_id,
    teamId: row.team_id,
    scopes: await loadScopes(row.tenant_id, row.user_id),
  };
};

/** Keeps credential verification in the existing demo store while sourcing the issued role from current DB authorization state. */
export const resolveLoginRole = async (tenantId: string, username: string, preferredRole: UserRole): Promise<UserRole | null> => {
  const result = await pgQuery(
    `SELECT ur.role
     FROM app_users u JOIN user_roles ur ON ur.tenant_id=u.tenant_id AND ur.user_id=u.user_id
     WHERE u.tenant_id=$1 AND u.username=$2 AND u.status='ACTIVE'
     ORDER BY CASE WHEN ur.role=$3 THEN 0 ELSE 1 END,ur.assigned_at DESC
     LIMIT 1`,
    [tenantId, username, preferredRole]
  );
  const role = result.rows[0]?.role;
  return isUserRole(role) ? role : null;
};

export const listActiveUserIdsByRole = async (tenantId: string, role: UserRole): Promise<string[]> => {
  const result = await pgQuery(
    `SELECT u.user_id FROM app_users u
     JOIN user_roles ur ON ur.tenant_id=u.tenant_id AND ur.user_id=u.user_id
     WHERE u.tenant_id=$1 AND ur.role=$2 AND u.status='ACTIVE'
     ORDER BY u.user_id`,
    [tenantId, role]
  );
  return result.rows.map((row: { user_id: string }) => row.user_id);
};

export const scopeRefs = (context: AuthorizationContext, type: ScopeType): string[] => {
  const refs = context.scopes.filter(scope => scope.type === type).map(scope => scope.ref);
  const profileRef = type === "BRANCH" ? context.branchId : type === "TEAM" ? context.teamId : type === "CUSTOMER" ? context.customerId : null;
  if (profileRef && !refs.includes(profileRef)) refs.push(profileRef);
  return refs;
};

export interface SqlScopePredicate {
  sql: string;
  params: unknown[];
}

/** Builds the mandatory SQL predicate used by both list and single-dossier queries. */
export const buildDossierScopePredicate = (
  context: AuthorizationContext,
  dossierAlias: string,
  firstParameterIndex: number
): SqlScopePredicate => {
  const params: unknown[] = [];
  const add = (value: unknown): string => {
    params.push(value);
    return `$${firstParameterIndex + params.length - 1}`;
  };

  if (context.role === "CUSTOMER") {
    if (!context.customerId) return { sql: "FALSE", params };
    return { sql: `${dossierAlias}.customer_id=${add(context.customerId)}`, params };
  }

  if (context.role === "CREDIT_OFFICER") {
    const userIdParam = add(context.userId);
    const queueClauses: string[] = [];
    const teams = scopeRefs(context, "TEAM");
    const branches = scopeRefs(context, "BRANCH");
    if (teams.length) queueClauses.push(`${dossierAlias}.team_id=ANY(${add(teams)}::text[])`);
    else if (branches.length) queueClauses.push(`${dossierAlias}.branch_id=ANY(${add(branches)}::text[])`);
    const queueSql = queueClauses.length ? queueClauses.join(" OR ") : "FALSE";
    return {
      sql: `(
        EXISTS (SELECT 1 FROM dossier_review_assignments scope_a WHERE scope_a.tenant_id=${dossierAlias}.tenant_id AND scope_a.dossier_id=${dossierAlias}.dossier_id AND scope_a.assigned_officer=${userIdParam})
        OR (NOT EXISTS (SELECT 1 FROM dossier_review_assignments scope_a WHERE scope_a.tenant_id=${dossierAlias}.tenant_id AND scope_a.dossier_id=${dossierAlias}.dossier_id) AND (${queueSql}))
      )`,
      params,
    };
  }

  const tenantScope = scopeRefs(context, "TENANT").includes(context.tenantId);
  if ((context.role === "ADMIN" || context.role === "AUDITOR") && tenantScope) return { sql: "TRUE", params };

  if (context.role === "CREDIT_APPROVER") {
    if (tenantScope) return { sql: "TRUE", params };
    const clauses: string[] = [];
    const branches = scopeRefs(context, "BRANCH");
    const teams = scopeRefs(context, "TEAM");
    if (branches.length) clauses.push(`${dossierAlias}.branch_id=ANY(${add(branches)}::text[])`);
    if (teams.length) clauses.push(`${dossierAlias}.team_id=ANY(${add(teams)}::text[])`);
    return { sql: clauses.length ? `(${clauses.join(" OR ")})` : "FALSE", params };
  }

  return { sql: "FALSE", params };
};
