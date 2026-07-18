import { agentContracts } from "../../config/policy";
import { AgentContract } from "../../types/product.types";

export const AGENT_CONTRACTS: readonly AgentContract[] = agentContracts;

export const contractsForUser = (role: AgentContract["primaryUsers"][number]) =>
  AGENT_CONTRACTS.filter(contract => contract.primaryUsers.includes(role));
