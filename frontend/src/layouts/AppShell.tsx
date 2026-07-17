import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import styles from "./AppShell.module.css";

export const AppShell = () => (
  <div className={styles.shell}>
    <Sidebar />
    <main className={styles.main}>
      <div className={styles.content}>
        <Outlet />
      </div>
    </main>
  </div>
);
