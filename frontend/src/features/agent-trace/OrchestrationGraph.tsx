import { useMemo } from "react";
import { ReactFlow, Background, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Card } from "../../components/Card";
import { AgentNode, type AgentFlowNode, type GraphNodeStatus } from "./AgentNode";
import { useOrchestrationStore, type PipelineStep, type StepStatus } from "../../store/orchestrationStore";
import type { StepKey } from "../../utils/parseAgentState";
import styles from "./OrchestrationGraph.module.css";

const NODE_LAYOUT: { id: string; stepKey?: StepKey; label: string; x: number; y: number }[] = [
  { id: "classify", stepKey: "planner", label: "Planner classify", x: 300, y: 0 },
  { id: "planning", stepKey: "planning", label: "MCP planning", x: 300, y: 78 },
  { id: "profile", stepKey: "profile", label: "Customer Profile", x: 300, y: 156 },
  { id: "product", stepKey: "product", label: "Product & Policy", x: 300, y: 234 },
  { id: "credit", stepKey: "credit", label: "Credit Risk", x: 300, y: 312 },
  { id: "fraud", stepKey: "fraud", label: "Fraud Investigation", x: 300, y: 390 },
  { id: "autoPolicy", stepKey: "auto_policy", label: "Auto-Policy Gate", x: 90, y: 480 },
  { id: "legal", stepKey: "legal", label: "Legal & Compliance", x: 510, y: 480 },
  { id: "selfCorrection", stepKey: "self-correction", label: "Self-Correction Loop", x: 720, y: 558 },
  { id: "legalAudit", stepKey: "legal_audit", label: "Legal Audit", x: 510, y: 558 },
  { id: "risk", stepKey: "risk", label: "Risk Consolidation", x: 510, y: 636 },
  { id: "humanApproval", stepKey: "human_approval", label: "Human Approval", x: 300, y: 714 },
  { id: "operations", stepKey: "operations", label: "Operations", x: 300, y: 792 },
];

const findStep = (steps: PipelineStep[], key?: StepKey) => (key ? steps.find(s => s.key === key) : undefined);

const toGraphStatus = (status: StepStatus): GraphNodeStatus =>
  status === "in_progress" ? "in_progress" :
    status === "done" || status === "skipped" ? "done" :
      status;

export const OrchestrationGraph = () => {
  const steps = useOrchestrationStore(s => s.steps);
  const riskTier = useOrchestrationStore(s => s.riskTier);
  const phase = useOrchestrationStore(s => s.phase);

  const hasSelfCorrection = steps.some(s => s.key === "self-correction");

  const nodes: AgentFlowNode[] = useMemo(() => {
    return NODE_LAYOUT.filter(n => n.id !== "selfCorrection" || hasSelfCorrection).map(n => {
      const step = findStep(steps, n.stepKey);
      const isComplexOnly = ["legal", "legalAudit", "risk", "selfCorrection"].includes(n.id);
      const isFastOnly = n.id === "autoPolicy";
      let status: GraphNodeStatus;

      if (!step && phase === "idle") status = "inactive";
      else if (!step && isComplexOnly && riskTier === "FAST") status = "inactive";
      else if (!step && isFastOnly && riskTier === "COMPLEX") status = "inactive";
      else if (!step) status = "pending";
      else if (step.status === "skipped") status = "inactive";
      else status = toGraphStatus(step.status);

      return {
        id: n.id,
        type: "agentNode",
        position: { x: n.x, y: n.y },
        data: { label: n.label, status },
        draggable: false,
        selectable: false,
      };
    });
  }, [steps, riskTier, phase, hasSelfCorrection]);

  const edges: Edge[] = useMemo(() => {
    const base: Edge[] = [
      { id: "e-classify-planning", source: "classify", target: "planning" },
      { id: "e-planning-profile", source: "planning", target: "profile" },
      { id: "e-profile-product", source: "profile", target: "product" },
      { id: "e-product-credit", source: "product", target: "credit" },
      { id: "e-credit-fraud", source: "credit", target: "fraud" },
      { id: "e-fraud-auto", source: "fraud", target: "autoPolicy" },
      { id: "e-fraud-legal", source: "fraud", target: "legal" },
      { id: "e-auto-human", source: "autoPolicy", target: "humanApproval" },
      { id: "e-auto-legal", source: "autoPolicy", target: "legal" },
      { id: "e-legalaudit-risk", source: "legalAudit", target: "risk" },
      { id: "e-risk-human", source: "risk", target: "humanApproval" },
      { id: "e-human-ops", source: "humanApproval", target: "operations" },
    ];

    if (hasSelfCorrection) {
      base.push(
        { id: "e-legal-selfcorrection", source: "legal", target: "selfCorrection" },
        { id: "e-selfcorrection-legalaudit", source: "selfCorrection", target: "legalAudit" }
      );
    } else {
      base.push({ id: "e-legal-legalaudit", source: "legal", target: "legalAudit" });
    }

    return base.map(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);
      const isTargetActive = targetNode?.data.status === "done" || targetNode?.data.status === "in_progress";
      
      let strokeColor = "#769082"; // high contrast default edge
      let strokeWidth = 1.5;
      
      if (sourceNode?.data.status === "inactive" || targetNode?.data.status === "inactive") {
        strokeColor = "#d2dad5"; // muted for inactive paths
      } else if (sourceNode?.data.status === "in_progress") {
        strokeColor = "#2563eb"; // blue animation for running stage
        strokeWidth = 2;
      } else if (sourceNode?.data.status === "done" && isTargetActive) {
        strokeColor = "#059669"; // green for completed paths
        strokeWidth = 2;
      }

      return {
        ...edge,
        animated: sourceNode?.data.status === "in_progress",
        style: { stroke: strokeColor, strokeWidth },
      };
    });
  }, [hasSelfCorrection, nodes]);

  return (
    <Card title="So do dieu phoi (LangGraph StateGraph)">
      <div className={styles.canvas}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={{ agentNode: AgentNode }}
          fitView
          fitViewOptions={{ padding: 0.22 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={true}
          zoomOnScroll={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} />
        </ReactFlow>
      </div>
    </Card>
  );
};
