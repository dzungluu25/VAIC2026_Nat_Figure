import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Loader2 } from "lucide-react";
import styles from "./AgentNode.module.css";

export type GraphNodeStatus = "inactive" | "pending" | "in_progress" | "done" | "degraded" | "failed" | "blocked";

export interface AgentNodeData extends Record<string, unknown> {
  label: string;
  status: GraphNodeStatus;
}

export type AgentFlowNode = Node<AgentNodeData, "agentNode">;

export const AgentNode = ({ data }: NodeProps<AgentFlowNode>) => {
  const { label, status } = data;

  return (
    <div className={[styles.node, styles[status]].join(" ")}>
      <Handle type="target" position={Position.Top} className={styles.handle} />
      {status === "in_progress" && <Loader2 size={12} className={styles.spinner} />}
      <span className={styles.label}>{label}</span>
      <Handle type="source" position={Position.Bottom} className={styles.handle} />
    </div>
  );
};
