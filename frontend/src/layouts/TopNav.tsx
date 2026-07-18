import { BrainCircuit, ChartNoAxesCombined, ClipboardList, Settings2, SlidersHorizontal, Sparkles, UserRound } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { useSessionStore } from "../store/sessionStore";
import type { UserRole } from "../types/api";
import styles from "./TopNav.module.css";

const NAV_ITEMS: Array<{ to: string; label: string; icon: typeof Sparkles; roles: UserRole[] }> = [
  { to: "/", label: "Thẩm định", icon: Sparkles, roles: ["CREDIT_OFFICER", "CREDIT_APPROVER"] },
  { to: "/dossiers", label: "Hồ sơ chờ duyệt", icon: ClipboardList, roles: ["CUSTOMER", "CREDIT_OFFICER", "CREDIT_APPROVER", "ADMIN", "AUDITOR"] },
  { to: "/agents", label: "Agent flow", icon: BrainCircuit, roles: ["CREDIT_OFFICER", "CREDIT_APPROVER"] },
  { to: "/policy", label: "Chính sách", icon: SlidersHorizontal, roles: ["CREDIT_APPROVER"] },
  { to: "/operations", label: "Vận hành", icon: Settings2, roles: ["CREDIT_OFFICER", "CREDIT_APPROVER", "ADMIN", "AUDITOR"] },
  { to: "/metrics", label: "Hiệu năng", icon: ChartNoAxesCombined, roles: ["CREDIT_OFFICER", "CREDIT_APPROVER", "ADMIN", "AUDITOR"] },
];

export const TopNav = () => {
  const { role } = useSessionStore();
  const visibleItems = role ? NAV_ITEMS.filter(item => item.roles.includes(role)) : NAV_ITEMS;
  return (
  <header className={styles.header}>
    <div className={styles.inner}>
      <Link to="/" className={styles.brand} aria-label="Về trang chủ">
        <span className={styles.mark}>
          {/* NAT FIGURE geometric logo mark */}
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect x="2" y="2" width="7" height="7" rx="1.5" fill="currentColor" opacity="1"/>
            <rect x="11" y="2" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.55"/>
            <rect x="2" y="11" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.55"/>
            <rect x="11" y="11" width="7" height="7" rx="1.5" fill="currentColor" opacity="0.25"/>
          </svg>
        </span>
        <span>
          <strong>NAT FIGURE</strong>
          <small>VAIC 2026</small>
        </span>
      </Link>

      <nav className={styles.nav} aria-label="Điều hướng chính">
        {visibleItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => [styles.navItem, isActive ? styles.active : ""].filter(Boolean).join(" ")}
          >
            <item.icon size={16} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <Link to="/login" className={styles.homeLink}>
        <UserRound size={15} />
        <span>Đổi phiên</span>
      </Link>
    </div>
  </header>
  );
};
