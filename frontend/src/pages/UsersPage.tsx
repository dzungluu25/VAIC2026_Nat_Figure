import { useState, type FormEvent } from "react";
import { ShieldCheck, UserCog } from "lucide-react";
import { Header } from "../layouts/Header";
import { Card } from "../components/Card";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { changeUserRole } from "../services/authorizationService";
import { ApiError } from "../services/httpClient";
import { useSessionStore } from "../store/sessionStore";
import type { UserRole } from "../types/api";
import styles from "./adminConsole.module.css";

const ROLE_OPTIONS: UserRole[] = ["CUSTOMER", "CREDIT_OFFICER", "CREDIT_APPROVER", "ADMIN", "AUDITOR"];
const messageFrom = (error: unknown, fallback: string): string => error instanceof ApiError || error instanceof Error ? error.message : fallback;
const canManageUsers = (role?: UserRole) => role === "ADMIN";

export const UsersPage = () => {
  const { accessToken, tenantId = "bank-default", role } = useSessionStore();
  const token = accessToken ?? "";

  const [targetUserId, setTargetUserId] = useState("");
  const [targetRole, setTargetRole] = useState<UserRole>("CREDIT_OFFICER");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const requireToken = () => {
    if (!token) throw new ApiError("AUTHENTICATION_REQUIRED", 401);
    return token;
  };

  const submitRoleChange = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setMessage(null);
    try {
      const changed = await changeUserRole(requireToken(), targetUserId.trim(), targetRole);
      setMessage(`Đã đổi ${changed.userId} thành ${changed.role}.`);
    } catch (error) {
      setMessage(messageFrom(error, "Không đổi được role."));
    } finally { setBusy(false); }
  };

  return (
    <>
      <Header
        eyebrow="Quản trị vận hành"
        title="Người dùng & phân quyền"
        subtitle={`Gán vai trò cho tài khoản trong đơn vị. Phiên: ${role ?? "?"} · đơn vị ${tenantId}`}
        action={<Badge tone="brand"><ShieldCheck size={13} /> RBAC enforced</Badge>}
      />
      <Card title="Đổi role người dùng" action={<UserCog size={16} />}>
        <form className={styles.inlineForm} onSubmit={submitRoleChange}>
          <label>User ID<input required value={targetUserId} onChange={e => setTargetUserId(e.target.value)} placeholder="admin.demo / officer.tam" /></label>
          <label>Role
            <select value={targetRole} onChange={e => setTargetRole(e.target.value as UserRole)}>
              {ROLE_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <Button type="submit" variant="secondary" isLoading={busy} disabled={!canManageUsers(role) || busy || !targetUserId.trim()}>
            <UserCog size={14} /> Đổi role
          </Button>
        </form>
        {message ? <p className={styles.message}>{message}</p> : null}
        {!canManageUsers(role) ? <p className={styles.locked}>Chỉ ADMIN được gọi API đổi role; backend sẽ trả 403 nếu role hiện tại không đủ quyền.</p> : null}
      </Card>
    </>
  );
};
