import styles from "./TypingIndicator.module.css";

interface TypingIndicatorProps {
  label?: string;
}

/** Signals that an agent is actively thinking/executing — used wherever a step is "in_progress" so the UI never sits frozen. */
export const TypingIndicator = ({ label }: TypingIndicatorProps) => (
  <span className={styles.wrapper}>
    <span className={styles.dots}>
      <span />
      <span />
      <span />
    </span>
    {label ? <span className={styles.label}>{label}</span> : null}
  </span>
);
