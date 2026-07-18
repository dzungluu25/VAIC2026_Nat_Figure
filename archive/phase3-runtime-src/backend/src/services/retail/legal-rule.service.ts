import { DecisionCondition } from "../../types/orchestration.types";
import { ToolCallTrace } from "../../types/trace.types";

export const buildComplexConditions = (): DecisionCondition[] => [
  {
    conditionId: "CP-SPOUSE-SIGNATURE-001",
    blocksAt: "CONTRACT_SIGNING",
    text: "Spouse must co-sign mortgage contract or borrower must provide separate-property evidence.",
    basisRuleId: "MARITAL-COMMON-PROPERTY-001",
  },
  {
    conditionId: "CP-PROJECT-GUARANTEE-001",
    blocksAt: "DISBURSEMENT",
    text: "Developer bank guarantee certificate must be provided before disbursement.",
    basisRuleId: "FUTURE-HOUSING-GUARANTEE-001",
  },
  {
    conditionId: "CP-UNIT-LIEN-RELEASE-001",
    blocksAt: "DISBURSEMENT",
    text: "Lien release confirmation for the apartment unit must be provided before disbursement.",
    basisRuleId: "FUTURE-HOUSING-GUARANTEE-001",
  },
  {
    conditionId: "CP-CONSENT-BHXH-001",
    blocksAt: "EXTERNAL_DATA_CALL",
    text: "Ask customer for explicit consent before any BHXH/tax income verification call.",
    basisRuleId: "PDPD-CONSENT-001",
  },
];

export const buildLegalToolCalls = (): ToolCallTrace[] => [
  {
    toolName: "legal.insurance_tying_check",
    input: { rate_if_insurance: 0.075, rate_if_declined: 0.083, insurance_in_pricing_inputs: true },
    output: {
      status: "VIOLATION",
      severity: "BLOCKER",
      blocks_at: "APPROVAL",
      rule_ids: ["TCTD-INSURANCE-TYING-001"],
      required_fix: "Remove insurance_purchase from pricing function and re-price.",
    },
    status: "success",
  },
  {
    toolName: "legal.marital_property_check",
    input: { married: true, acquired_during_marriage: true, spouse_signature_present: false },
    output: {
      status: "PASS_WITH_CONDITION",
      blocks_at: "CONTRACT_SIGNING",
      rule_ids: ["MARITAL-COMMON-PROPERTY-001"],
    },
    status: "success",
  },
  {
    toolName: "legal.project_eligibility_check",
    input: { bank_guarantee_certificate_present: false, lien_release_for_unit_present: false },
    output: {
      status: "PASS_WITH_CONDITION",
      blocks_at: "DISBURSEMENT",
      rule_ids: ["FUTURE-HOUSING-GUARANTEE-001"],
    },
    status: "success",
  },
  {
    toolName: "consent.check_scope",
    input: { scope: "INCOME_VERIFICATION_BHXH", customer_id: "CUSTOMER_001" },
    output: { status: "CONSENT_REQUIRED", outbound_calls_made: 0, rule_ids: ["PDPD-CONSENT-001"] },
    status: "success",
  },
];
