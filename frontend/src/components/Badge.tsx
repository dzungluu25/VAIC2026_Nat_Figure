import type { ReactNode } from "react";
import styles from "./Badge.module.css";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger" | "brand";

interface BadgeProps {
  tone?: BadgeTone;
  pulse?: boolean;
  children: ReactNode;
}

export const Badge = ({ tone = "neutral", pulse, children }: BadgeProps) => (
  <span className={[styles.badge, styles[tone]].join(" ")}>
    {pulse ? <span className={styles.dot} aria-hidden /> : null}
    {children}
  </span>
);
