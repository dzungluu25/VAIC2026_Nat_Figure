import { describe, expect, it } from "vitest";
import type { WorkflowDefinition } from "@/types/platform.types";
import { validateWorkflow } from "@/services/platform/workflow-registry.service";
import { enforcePolicyGate } from "@/services/platform/action-saga.service";

const validWorkflow: WorkflowDefinition = {
  id: "loan-pre-approval",
  tenantId: "bank-default",
  name: "Loan pre-approval",
  nodes: [
    { id: "start", type: "start" },
    { id: "agent", type: "agent", outputSchema: { type: "object" }, citationRequired: true, retryLimit: 2 },
    { id: "gate", type: "human_gate" },
    { id: "action", type: "action", risk: "high", allowedTools: ["createLoanCase"], compensationNodeId: "undo" },
    { id: "undo", type: "compensation" },
    { id: "end", type: "end" },
  ],
  edges: [
    { from: "start", to: "agent" },
    { from: "agent", to: "gate" },
    { from: "gate", to: "action" },
    { from: "action", to: "end" },
  ],
};

describe("workflow validation", () => {
  it("publishes a well-formed workflow", () => {
    expect(validateWorkflow(validWorkflow)).toHaveLength(0);
  });

  it("fails closed on a high-risk action with no compensation", () => {
    const unsafe = {
      ...validWorkflow,
      nodes: validWorkflow.nodes.map(n => (n.id === "action" ? { ...n, compensationNodeId: undefined } : n)),
      edges: validWorkflow.edges.filter(e => e.from !== "gate"),
    };
    expect(validateWorkflow(unsafe).some(issue => issue.message.includes("compensation"))).toBe(true);
  });

  it("rejects duplicate node ids", () => {
    const duplicated = { ...validWorkflow, nodes: [...validWorkflow.nodes, validWorkflow.nodes[0]] };
    expect(validateWorkflow(duplicated).some(issue => issue.message.includes("duplicate"))).toBe(true);
  });

  it("requires a fallback edge alongside a conditional one", () => {
    const conditional = { ...validWorkflow, edges: [...validWorkflow.edges, { from: "agent", to: "end", condition: "pass" }] };
    expect(validateWorkflow(conditional).some(issue => issue.message.includes("fallback"))).toBe(true);
  });

  it("rejects a cycle that would exceed the retry budget", () => {
    const cyclic = { ...validWorkflow, edges: [...validWorkflow.edges, { from: "agent", to: "start" }] };
    expect(validateWorkflow(cyclic).some(issue => issue.code === "RETRY_EXCEEDED")).toBe(true);
  });
});

describe("action policy gate", () => {
  const gate = (overrides: Partial<Parameters<typeof enforcePolicyGate>[0]>) =>
    enforcePolicyGate({
      tenantId: "bank-a",
      runTenantId: "bank-a",
      workflowAllowsAction: true,
      toolAllowed: true,
      approvalRequired: false,
      approvalGranted: false,
      idempotencyKey: "run:step",
      ...overrides,
    });

  it("refuses to execute across a tenant boundary", () => {
    expect(() => gate({ runTenantId: "bank-b" })).toThrow(/TENANT_MISMATCH/);
  });

  it("refuses a HIGH write without a granted approval", () => {
    expect(() => gate({ approvalRequired: true })).toThrow(/APPROVAL_REQUIRED/);
  });

  it("admits an approved write", () => {
    expect(() => gate({ approvalRequired: true, approvalGranted: true })).not.toThrow();
  });
});
