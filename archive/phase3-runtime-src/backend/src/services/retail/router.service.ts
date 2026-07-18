import { ApprovalRoute, RiskTier } from "../../types/orchestration.types";

export interface RetailRouterInput {
  loanAmount: number;
  collateralType: "NONE_OR_DEPOSIT_BACKED" | "FUTURE_APARTMENT";
  incomeSourcesCount: number;
  hasUnverifiedIncome: boolean;
  hasExternalDebt: boolean;
  isFutureProperty: boolean;
}

export interface RouterDecision {
  tier: RiskTier;
  approvalRoute: ApprovalRoute;
  agentsRequired: string[];
  ruleId: "SHB-RISK-ROUTER-001";
  derivation: string;
}

export const routeRetailRequest = (input: RetailRouterInput): RouterDecision => {
  const fast =
    input.loanAmount <= 500000000 &&
    input.collateralType === "NONE_OR_DEPOSIT_BACKED" &&
    !input.hasUnverifiedIncome &&
    !input.hasExternalDebt &&
    !input.isFutureProperty;

  return fast
    ? {
        tier: "FAST",
        approvalRoute: "AUTO_APPROVAL",
        agentsRequired: [],
        ruleId: "SHB-RISK-ROUTER-001",
        derivation: "loan <= 500M, clean income, no external debt, no future property -> FAST/AUTO_APPROVAL",
      }
    : {
        tier: "COMPLEX",
        approvalRoute: "HYBRID_APPROVAL",
        agentsRequired: ["CREDIT", "LEGAL", "OPERATIONS"],
        ruleId: "SHB-RISK-ROUTER-001",
        derivation: "future property, refinance, unverified income, or external debt -> COMPLEX/HYBRID_APPROVAL",
      };
};
