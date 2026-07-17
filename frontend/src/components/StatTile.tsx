import type { ReactNode } from "react";
import styles from "./StatTile.module.css";

interface StatTileProps {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "brand" | "neutral";
}

export const StatTile = ({ label, value, hint, tone = "neutral" }: StatTileProps) => (
  <div className={[styles.tile, tone === "brand" ? styles.brand : ""].filter(Boolean).join(" ")}>
    <span className={styles.label}>{label}</span>
    <span className={styles.value}>{value}</span>
    {hint ? <span className={styles.hint}>{hint}</span> : null}
  </div>
);
