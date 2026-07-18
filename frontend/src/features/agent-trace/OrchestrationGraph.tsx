import { useMemo } from "react";
import { Background, ReactFlow, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Card } from "../../components/Card";
import { AgentNode, type AgentFlowNode, type GraphNodeStatus } from "./AgentNode";
import { useOrchestrationStore, type PipelineStep } from "../../store/orchestrationStore";
import type { StepKey } from "../../utils/parseAgentState";
import styles from "./OrchestrationGraph.module.css";

// Mirrors backend/src/services/orchestration/orchestration-graph.ts:
// classify -> profile -> parallel specialist stage -> legal gate -> risk -> operations.
const NODE_LAYOUT: { id: string; stepKey?: StepKey; label: string; x: number; y: number }[] = [
  { id: "classify", stepKey: "planner", label: "Planner", x: 360, y: 0 },
  { id: "profile", stepKey: "profile", label: "Customer Profile", x: 360, y: 90 },
  { id: "product", stepKey: "product", label: "Product Policy", x: 90, y: 220 },
  { id: "credit", stepKey: "credit", label: "Credit Assessment", x: 360, y: 220 },
  { id: "legalPrecheck", stepKey: "legal-precheck", label: "Legal Precheck", x: 630, y: 220 },
  { id: "markFastPass", label: "Fast Pass", x: 90, y: 360 },
  { id: "legal", stepKey: "legal", label: "Legal Gate", x: 500, y: 360 },
  { id: "selfCorrection", stepKey: "self-correction", label: "Self-Correction", x: 730, y: 460 },
  { id: "risk", stepKey: "risk", label: "Risk Matrix", x: 500, y: 460 },
  { id: "operations", stepKey: "operations", label: "Operations", x: 360, y: 580 },
];

const findStep = (steps: PipelineStep[], key?: StepKey) => (key ? steps.find(step => step.key === key) : undefined);

export const OrchestrationGraph = () => {
  const steps = useOrchestrationStore(state => state.steps);
  const riskTier = useOrchestrationStore(state => state.riskTier);
  const phase = useOrchestrationStore(state => state.phase);

  const hasSelfCorrection = steps.some(step => step.key === "self-correction");
  const opsStep = findStep(steps, "operations");
  const productStep = findStep(steps, "product");
  const creditStep = findStep(steps, "credit");

  const nodes: AgentFlowNode[] = useMemo(() => {
    return NODE_LAYOUT
      .filter(node => node.id !== "selfCorrection" || hasSelfCorrection)
      .map(node => {
        let status: GraphNodeStatus;

        if (node.id === "markFastPass") {
          if (riskTier === "COMPLEX") status = "inactive";
          else if (riskTier === undefined) status = phase === "idle" ? "inactive" : "pending";
          else if (opsStep && opsStep.status !== "pending") status = "done";
          else if (productStep?.status === "done" && creditStep?.status === "done") status = "in_progress";
          else status = "pending";
        } else if (["legalPrecheck", "legal", "risk", "selfCorrection"].includes(node.id) && riskTier === "FAST") {
          status = "inactive";
        } else {
          const step = findStep(steps, node.stepKey);
          if (!step) status = phase === "idle" ? "inactive" : "pending";
          else if (step.status === "skipped") status = "inactive";
          else status = step.status === "pending" ? "pending" : step.status === "in_progress" ? "in_progress" : "done";
        }

        return {
          id: node.id,
          type: "agentNode",
          position: { x: node.x, y: node.y },
          data: { label: node.label, status },
          draggable: false,
          selectable: false,
        };
      });
  }, [steps, riskTier, phase, opsStep, productStep, creditStep, hasSelfCorrection]);

  const edges: Edge[] = useMemo(() => {
    const base: Edge[] = [
      { id: "e-classify-profile", source: "classify", target: "profile" },
      { id: "e-profile-product", source: "profile", target: "product" },
      { id: "e-profile-credit", source: "profile", target: "credit" },
      { id: "e-profile-legalprecheck", source: "profile", target: "legalPrecheck" },
      { id: "e-product-fast", source: "product", target: "markFastPass" },
      { id: "e-credit-fast", source: "credit", target: "markFastPass" },
      { id: "e-fast-ops", source: "markFastPass", target: "operations" },
      { id: "e-product-legal", source: "product", target: "legal" },
      { id: "e-credit-legal", source: "credit", target: "legal" },
      { id: "e-legalprecheck-legal", source: "legalPrecheck", target: "legal" },
      { id: "e-risk-ops", source: "risk", target: "operations" },
    ];

    if (hasSelfCorrection) {
      base.push(
        { id: "e-legal-selfcorrection", source: "legal", target: "selfCorrection" },
        { id: "e-selfcorrection-risk", source: "selfCorrection", target: "risk" }
      );
    } else {
      base.push({ id: "e-legal-risk", source: "legal", target: "risk" });
    }

    return base.map(edge => ({
      ...edge,
      animated: nodes.find(node => node.id === edge.source)?.data.status === "in_progress",
      style: { stroke: "var(--color-border)", strokeWidth: 1.5 },
    }));
  }, [hasSelfCorrection, nodes]);

  return (
    <Card title="Agent Dependency Graph">
      <div className={styles.canvas}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={{ agentNode: AgentNode }}
          fitView
          fitViewOptions={{ padding: 0.25 }}
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
