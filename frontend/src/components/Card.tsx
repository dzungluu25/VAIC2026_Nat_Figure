import type { ReactNode } from "react";
import styles from "./Card.module.css";

interface CardProps {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}

export const Card = ({ title, action, children, className, padded = true }: CardProps) => (
  <section className={[styles.card, className].filter(Boolean).join(" ")}>
    {(title || action) && (
      <header className={styles.header}>
        {title ? <h2 className={styles.title}>{title}</h2> : <span />}
        {action}
      </header>
    )}
    <div className={padded ? styles.body : undefined}>{children}</div>
  </section>
);
