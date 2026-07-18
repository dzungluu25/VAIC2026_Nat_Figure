import type { ReactNode } from "react";
import styles from "./Header.module.css";

interface HeaderProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  action?: ReactNode;
}

export const Header = ({ title, subtitle, eyebrow, action }: HeaderProps) => (
  <header className={styles.header}>
    <div>
      {eyebrow ? <span className={styles.eyebrow}>{eyebrow}</span> : null}
      <h1 className={styles.title}>{title}</h1>
      {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
    </div>
    {action ? <div className={styles.action}>{action}</div> : null}
  </header>
);
