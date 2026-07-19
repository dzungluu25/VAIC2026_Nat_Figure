import { useEffect, useRef, useState } from "react";
import { BrainCircuit, ChartNoAxesCombined, ChevronDown, ClipboardList, GitBranch, LayoutDashboard, ListChecks, LogOut, SlidersHorizontal, Sparkles, UserCog, UserRound, Workflow } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { useSessionStore } from "../store/sessionStore";
import { NotificationBell } from "./NotificationBell";
import type { UserRole } from "../types/api";
import styles from "./TopNav.module.css";

const NAV_ITEMS: Array<{ to: string; label: string; icon: typeof Sparkles; roles: UserRole[] }> = [
  { to: "/", label: "Thẩm định", icon: Sparkles, roles: ["CREDIT_OFFICER", "CREDIT_APPROVER"] },
  { to: "/dossiers", label: "Hồ sơ chờ duyệt", icon: ClipboardList, roles: ["CUSTOMER", "CREDIT_OFFICER", "CREDIT_APPROVER", "ADMIN", "AUDITOR"] },
  { to: "/agents", label: "Agent flow", icon: BrainCircuit, roles: ["CREDIT_APPROVER"] },
  { to: "/policy", label: "Chính sách", icon: SlidersHorizontal, roles: ["CREDIT_APPROVER"] },
  { to: "/runs", label: "Runs & Duyệt", icon: GitBranch, roles: ["CREDIT_APPROVER", "ADMIN", "AUDITOR"] },
  { to: "/workflows", label: "Workflows", icon: Workflow, roles: ["CREDIT_APPROVER", "ADMIN"] },
  { to: "/checklists", label: "Checklist", icon: ListChecks, roles: ["ADMIN"] },
  { to: "/users", label: "Người dùng", icon: UserCog, roles: ["ADMIN"] },
  { to: "/admin", label: "Hệ thống", icon: LayoutDashboard, roles: ["ADMIN"] },
  { to: "/metrics", label: "Hiệu năng", icon: ChartNoAxesCombined, roles: ["CREDIT_APPROVER", "ADMIN", "AUDITOR"] },
];

export const TopNav = () => {
  const { role, clearSession } = useSessionStore();
  const visibleItems = role ? NAV_ITEMS.filter(item => item.roles.includes(role)) : NAV_ITEMS;
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const logout = () => {
    clearSession();
    // Hard navigation so the app remounts on a public route and the demo auto-login stays off.
    window.location.assign("/landing");
  };

  useEffect(() => {
    if (!accountMenuOpen) return;
    const onClickOutside = (event: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) setAccountMenuOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [accountMenuOpen]);

  return (
  <header className={styles.header}>
    <div className={styles.inner}>
      <Link to="/landing" className={styles.brand} aria-label="Về trang giới thiệu">
        <span className={styles.mark}>
          {/* NAT FIGURE premium geometric logo mark */}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M12 2L2 12L12 22L22 12L12 2Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>
            <path d="M12 6L6 12L12 18L18 12L12 6Z" fill="currentColor" opacity="0.35"/>
            <circle cx="12" cy="12" r="2.5" fill="currentColor"/>
          </svg>
        </span>
        <span>
          <strong>VAIC 2026</strong>
          <small>Nat Figure</small>
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

      <div className={styles.actions}>
        <NotificationBell />
        <div className={styles.accountMenu} ref={accountMenuRef}>
          <button
            type="button"
            className={styles.accountTrigger}
            aria-haspopup="menu"
            aria-expanded={accountMenuOpen}
            onClick={() => setAccountMenuOpen(prev => !prev)}
          >
            <UserRound size={15} />
            <span>Tài khoản</span>
            <ChevronDown size={13} className={accountMenuOpen ? styles.chevronOpen : ""} />
          </button>

          {accountMenuOpen ? (
            <div className={styles.accountPanel} role="menu">
              <Link to="/login" role="menuitem" className={styles.accountItem} onClick={() => setAccountMenuOpen(false)}>
                <UserRound size={15} />
                <span>Đổi phiên</span>
              </Link>
              <button type="button" role="menuitem" onClick={logout} className={styles.accountItemDanger}>
                <LogOut size={15} />
                <span>Đăng xuất</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  </header>
  );
};
