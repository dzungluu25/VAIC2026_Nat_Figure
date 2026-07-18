import { DecisionCondition } from "../../../types/orchestration.types";
import { JsonRecord } from "../case-fixture.service";

export type LegalStatus = "VIOLATION" | "PASS_WITH_CONDITION" | "CONSENT_REQUIRED";

export interface LegalFinding {
  ruleId: string;
  status: LegalStatus;
  severity: "BLOCKER" | "CONDITION";
  blocksAt: DecisionCondition["blocksAt"];
  text: string;
  calculation: JsonRecord;
}

export interface PromptInjectionScan {
  detected: boolean;
  matchedPatterns: string[];
  locations: string[];
}

export interface CreditAnalysis {
  qualifiedIncome: number;
  breakdown: JsonRecord[];
  currentAutoEmi: number;
  refinancedAutoEmi: number;
  currentCardObligation: number;
  restructuredCardObligation: number;
  requestedAmount: number;
  requestedTermMonths: number;
  proposedAmount: number;
  proposedTermMonths: number;
  affordableHomeLoanAmount: number;
  propertyValue: number;
  requestedHomeEmiStress: number;
  requestedDti: number;
  requestedDtiDisplay: string;
  requestedLtv: number;
  requestedLtvDisplay: string;
  restructuredHomeEmiPromo: number;
  restructuredHomeEmiFloating: number;
  restructuredHomeEmiStress: number;
  stressDti: number;
  stressDtiDisplay: string;
  ltv: number;
  ltvDisplay: string;
  proposalPasses: boolean;
  ageAtMaturity: number;
  leversApplied: string[];
}
