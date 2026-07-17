import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { Button } from "../components/Button";
import { useAuth } from "../hooks/useAuth";
import styles from "./LoginPage.module.css";

export const LoginPage = () => {
  const { isAuthenticated, isSubmitting, error, login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void login(username, password);
  };

  return (
    <div className={styles.page}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <div className={styles.brand}>
          <ShieldCheck size={28} strokeWidth={2.2} />
          <div>
            <p className={styles.brandName}>SHB VAIC</p>
            <p className={styles.brandSub}>AI Underwriting Console</p>
          </div>
        </div>

        <label className={styles.field}>
          <span>Tài khoản</span>
          <input value={username} onChange={e => setUsername(e.target.value)} placeholder="officer.tam" autoFocus />
        </label>

        <label className={styles.field}>
          <span>Mật khẩu</span>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
        </label>

        {error && <p className={styles.error}>{error}</p>}

        <Button type="submit" isLoading={isSubmitting} disabled={!username || !password}>
          Đăng nhập
        </Button>
      </form>
    </div>
  );
};
