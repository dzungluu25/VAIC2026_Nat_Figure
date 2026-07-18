export const USER_ROLES = [
  "CUSTOMER",
  "CREDIT_OFFICER",
  "CREDIT_APPROVER",
  "ADMIN",
  "AUDITOR",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const SCOPE_TYPES = ["TENANT", "BRANCH", "TEAM", "CUSTOMER"] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];

export const AUTHORIZATION_ACTIONS = [
  "CHECKLIST_READ",
  "CHECKLIST_MANAGE",
  "DOSSIER_CREATE",
  "DOSSIER_LIST",
  "DOSSIER_VIEW",
  "DOCUMENT_UPLOAD",
  "CIC_UPLOAD",
  "REVIEW_DECIDE",
  "DOSSIER_REASSIGN",
  "USER_ROLE_CHANGE",
  "AUDIT_READ",
] as const;

export type AuthorizationAction = (typeof AUTHORIZATION_ACTIONS)[number];

/** CREDIT_APPROVER is the supervisor/maker-checker role; ADMIN never receives business-decision permissions. */
export const ACTION_ROLES: Record<AuthorizationAction, readonly UserRole[]> = {
  CHECKLIST_READ: USER_ROLES,
  CHECKLIST_MANAGE: ["ADMIN"],
  DOSSIER_CREATE: ["CUSTOMER", "CREDIT_OFFICER"],
  DOSSIER_LIST: USER_ROLES,
  DOSSIER_VIEW: USER_ROLES,
  DOCUMENT_UPLOAD: ["CUSTOMER", "CREDIT_OFFICER"],
  CIC_UPLOAD: ["CREDIT_OFFICER"],
  REVIEW_DECIDE: ["CREDIT_OFFICER", "CREDIT_APPROVER"],
  DOSSIER_REASSIGN: ["CREDIT_APPROVER"],
  USER_ROLE_CHANGE: ["ADMIN"],
  AUDIT_READ: ["CREDIT_APPROVER", "ADMIN", "AUDITOR"],
};

export interface AuthorizationScope {
  type: ScopeType;
  ref: string;
}

export interface AuthorizationContext {
  sub: string;
  userId: string;
  role: UserRole;
  tenantId: string;
  customerId: string | null;
  branchId: string | null;
  teamId: string | null;
  scopes: AuthorizationScope[];
}

export const isUserRole = (value: unknown): value is UserRole =>
  typeof value === "string" && USER_ROLES.includes(value as UserRole);

export const roleCan = (role: UserRole, action: AuthorizationAction): boolean =>
  ACTION_ROLES[action].includes(role);
