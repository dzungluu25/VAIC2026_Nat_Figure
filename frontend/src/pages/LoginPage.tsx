import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Header } from "../layouts/Header";
import { login } from "../services/authService";
import { ApiError } from "../services/httpClient";
import { useSessionStore } from "../store/sessionStore";

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
      navigate("/dossiers", { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Không thể đăng nhập.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ maxWidth: 520, margin: "64px auto", padding: "0 20px" }}>
      <Header eyebrow="VAIC Credit Intelligence" title="Đăng nhập" subtitle="Quyền truy cập hồ sơ được xác định theo role và phạm vi được phân công." />
      <Card title="Tài khoản">
        <form onSubmit={submit} style={{ display: "grid", gap: 16 }}>
          <label>Tên đăng nhập<input required autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} /></label>
          <label>Mật khẩu<input required type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></label>
          {error ? <p role="alert">{error}</p> : null}
          <Button type="submit" variant="primary" isLoading={loading} disabled={loading}>Đăng nhập</Button>
        </form>
      </Card>
    </main>
  );
};
