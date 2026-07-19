import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, LogIn } from "lucide-react";
import { Button } from "../components/Button";
import { login } from "../services/authService";
import { ApiError } from "../services/httpClient";
import { useSessionStore } from "../store/sessionStore";
import styles from "./LoginPage.module.css";

// Demo identities (see backend demo-user.store.ts) — one-click fill for the hackathon demo.
const DEMO_ACCOUNTS: Array<{ label: string; username: string; password: string }> = [
  { label: "Khách hàng", username: "customer.demo", password: "change_me_customer_password" },
  { label: "Chuyên viên", username: "officer.tam", password: "change_me_officer_password" },
  { label: "Phê duyệt", username: "approver.lan", password: "change_me_approver_password" },
  { label: "Admin", username: "admin.demo", password: "change_me_admin_password" },
  { label: "Kiểm toán", username: "auditor.demo", password: "change_me_auditor_password" },
];

export const LoginPage = () => {
  const navigate = useNavigate();
  const { setSession } = useSessionStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const session = await login(username.trim(), password);
      setSession(session);
      // Staff land on the multi-agent workspace (the core demo); customers on their own dossiers.
      const destination = session.role === "CUSTOMER" ? "/dossiers" : session.role === "ADMIN" ? "/admin" : "/";
      navigate(destination, { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Không thể đăng nhập.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.mark}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M12 2L2 12L12 22L22 12L12 2Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>
              <path d="M12 6L6 12L12 18L18 12L12 6Z" fill="currentColor" opacity="0.35"/>
              <circle cx="12" cy="12" r="2.5" fill="currentColor"/>
            </svg>
          </span>
          <span className={styles.brandName}>
            <strong>VAIC 2026</strong>
            <small>Nat Figure</small>
          </span>
        </div>

        <span className={styles.eyebrow}>VAIC Credit Intelligence</span>
        <h1 className={styles.title}>Đăng nhập</h1>
        <p className={styles.subtitle}>Quyền truy cập hồ sơ được xác định theo role và phạm vi được phân công.</p>

        <form onSubmit={submit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="login-username">Tên đăng nhập</label>
            <input
              id="login-username"
              className={styles.input}
              required
              autoComplete="username"
              placeholder="vd: customer.demo"
              value={username}
              onChange={event => setUsername(event.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="login-password">Mật khẩu</label>
            <input
              id="login-password"
              className={styles.input}
              required
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={event => setPassword(event.target.value)}
            />
          </div>

          {error ? (
            <p role="alert" className={styles.error}><AlertCircle size={15} /> {error}</p>
          ) : null}

          <Button type="submit" variant="primary" className={styles.submit} isLoading={loading} disabled={loading}>
            <LogIn size={16} /> Đăng nhập
          </Button>
        </form>

        <div className={styles.demoHint}>
          <p className={styles.demoLabel}>Tài khoản demo</p>
          <div className={styles.chips}>
            {DEMO_ACCOUNTS.map(account => (
              <button
                key={account.username}
                type="button"
                className={styles.chip}
                onClick={() => { setUsername(account.username); setPassword(account.password); setError(null); }}
              >
                {account.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
};
