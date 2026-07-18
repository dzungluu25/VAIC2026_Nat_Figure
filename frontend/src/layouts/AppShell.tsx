import { Outlet } from "react-router-dom";
import { TopNav } from "./TopNav";
import styles from "./AppShell.module.css";

export const AppShell = () => (
  <div className={styles.shell}>
    <TopNav />
    <main className={styles.main}>
      <div className={styles.content}>
        <Outlet />
      </div>
    </main>
  </div>
);
