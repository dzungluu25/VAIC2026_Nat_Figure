import styles from "./ComparisonBar.module.css";

interface ComparisonBarProps {
  label: string;
  multiAgentValue: number;
  baselineValue: number;
  formatValue: (value: number) => string;
  /** Lower is not necessarily "better" here — multi-agent trades speed for grounding/auditability. */
  higherIsMore?: boolean;
}

export const ComparisonBar = ({ label, multiAgentValue, baselineValue, formatValue, higherIsMore = true }: ComparisonBarProps) => {
  const max = Math.max(multiAgentValue, baselineValue, 1);
  const multiPct = (multiAgentValue / max) * 100;
  const basePct = (baselineValue / max) * 100;

  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <div className={styles.bars}>
        <div className={styles.barTrack}>
          <div className={[styles.bar, styles.multi].join(" ")} style={{ width: `${multiPct}%` }} />
          <span className={styles.value}>{formatValue(multiAgentValue)}</span>
        </div>
        <div className={styles.barTrack}>
          <div className={[styles.bar, styles.baseline].join(" ")} style={{ width: `${basePct}%` }} />
          <span className={styles.value}>{formatValue(baselineValue)}</span>
        </div>
      </div>
      {!higherIsMore && <span className={styles.hint}>thấp hơn = nhanh hơn</span>}
    </div>
  );
};
