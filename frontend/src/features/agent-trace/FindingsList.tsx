import { BookText } from "lucide-react";
import { Badge } from "../../components/Badge";
import type { DecisionEnvelope } from "../../types/api";
import { severityTone } from "../../utils/statusTone";
import styles from "./FindingsList.module.css";

interface FindingsListProps {
  findings: DecisionEnvelope[];
}

/** Surfaces each agent's structured decision findings — severity, rule ID, and the real regulation citations behind it. */
export const FindingsList = ({ findings }: FindingsListProps) => {
  if (findings.length === 0) return null;

  return (
    <div className={styles.wrapper}>
      {findings.map(finding => (
        <div key={finding.decisionId} className={styles.finding}>
          <div className={styles.header}>
            <Badge tone={severityTone[finding.severity]}>{finding.severity}</Badge>
            {finding.blocksAt !== "NONE" && <Badge tone="neutral">Chặn tại: {finding.blocksAt}</Badge>}
          </div>
          <p className={styles.text}>{finding.finding}</p>
          {finding.citations.length > 0 && (
            <ul className={styles.citations}>
              {finding.citations.map(citation => (
                <li key={citation}>
                  <BookText size={11} />
                  {citation}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
};
