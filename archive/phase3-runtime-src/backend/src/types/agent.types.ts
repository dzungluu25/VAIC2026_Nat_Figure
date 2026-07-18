export type AgentRole = "router" | "planner" | "credit" | "legal" | "operations" | "gate" | "system";

export interface AgentTask {
  id: string;
  role: AgentRole;
  description: string;
  status: "pending" | "running" | "completed" | "blocked" | "failed";
}
