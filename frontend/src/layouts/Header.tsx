import type { ReactNode } from "react";
import styles from "./Header.module.css";

interface HeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export const Header = ({ title, subtitle, action }: HeaderProps) => (
  <header className={styles.header}>
    <div>
      <h1 className={styles.title}>{title}</h1>
      {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
    </div>
    {action ? <div className={styles.action}>{action}</div> : null}
  </header>
);
