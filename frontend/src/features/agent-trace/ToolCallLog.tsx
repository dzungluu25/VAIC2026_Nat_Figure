import { Wrench } from "lucide-react";
import { Badge } from "../../components/Badge";
import type { ToolCallTrace } from "../../types/api";
import styles from "./ToolCallLog.module.css";

interface ToolCallLogProps {
  toolCalls: ToolCallTrace[];
}

/** Tool-use transparency: every backend tool call (Neo4j lookup, calculator, mock API) shown with its real input/output. */
export const ToolCallLog = ({ toolCalls }: ToolCallLogProps) => {
  if (toolCalls.length === 0) return null;

  return (
    <div className={styles.wrapper}>
      {toolCalls.map((call, index) => (
        <details key={`${call.toolName}-${index}`} className={styles.call}>
          <summary className={styles.summary}>
            <Wrench size={12} />
            <code className={styles.toolName}>{call.toolName}</code>
            <Badge tone={call.status === "success" ? "success" : "danger"}>{call.status}</Badge>
          </summary>
          <div className={styles.io}>
            <div>
              <span className={styles.ioLabel}>Input</span>
              <pre className={styles.pre}>{JSON.stringify(call.input, null, 2)}</pre>
            </div>
            <div>
              <span className={styles.ioLabel}>Output</span>
              <pre className={styles.pre}>{JSON.stringify(call.output, null, 2)}</pre>
            </div>
          </div>
        </details>
      ))}
    </div>
  );
};
