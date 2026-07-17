import { NavLink } from "react-router-dom";
import { LayoutDashboard, LineChart, LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import styles from "./Sidebar.module.css";

const NAV_ITEMS = [
  { to: "/", label: "Điều phối AI", icon: LayoutDashboard, end: true },
  { to: "/metrics", label: "Hiệu năng", icon: LineChart, end: false },
];

export const Sidebar = () => {
  const { username, role, logout } = useAuth();

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <ShieldCheck size={22} strokeWidth={2.2} />
        <div>
          <p className={styles.brandName}>SHB VAIC</p>
          <p className={styles.brandSub}>AI Underwriting Console</p>
        </div>
      </div>

      <nav className={styles.nav}>
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => [styles.navItem, isActive ? styles.navItemActive : ""].filter(Boolean).join(" ")}
          >
            <item.icon size={17} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className={styles.footer}>
        <div className={styles.user}>
          <p className={styles.userName}>{username}</p>
          <p className={styles.userRole}>{role === "CREDIT_APPROVER" ? "Chuyên viên phê duyệt" : "Chuyên viên tín dụng"}</p>
        </div>
        <button className={styles.logout} onClick={logout} title="Đăng xuất">
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
};
