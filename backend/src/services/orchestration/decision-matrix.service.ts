import { DecisionEnvelope, ConditionPrecedent, BlocksAt } from "../../types/agent.types";

export interface DecisionMatrixOutput {
  finalDecision: "FAST_PASS" | "PASS" | "CONDITIONAL_PASS" | "REJECTED" | "HUMAN_ESCALATION";
  vetoedBy?: string;
  reasonCodes: string[];
  conditions: ConditionPrecedent[];
  requiredFixes: string[];
}

export const decideNextAction = (
  creditFindings: DecisionEnvelope[],
  productFindings: DecisionEnvelope[],
  legalFindings: DecisionEnvelope[]
): DecisionMatrixOutput => {
  const allFindings = [...creditFindings, ...productFindings, ...legalFindings];
  
  const conditions: ConditionPrecedent[] = [];
  const requiredFixes: string[] = [];
  const reasonCodes: string[] = [];
  let vetoedBy: string | undefined = undefined;

  // 1. Extract conditions and fixes
  for (const finding of allFindings) {
    if (finding.status === "FAIL" || finding.status === "VIOLATION" || finding.status === "BLOCKED") {
      reasonCodes.push(...finding.ruleIds);
      if (finding.requiredFix) {
        requiredFixes.push(finding.requiredFix);
      }
    }
    
    // Convert CONDITION severity to ConditionPrecedent
    if (finding.severity === "CONDITION") {
      conditions.push({
        id: `cond-${Math.floor(1000 + Math.random() * 9000)}`,
        description: finding.finding,
        blocksAt: finding.blocksAt,
        status: "pending"
      });
    }
  }

  // 2. Apply Veto Hierarchy
  
  // A. Check for Consent Blocker (Blocks external data check)
  const consentBlocker = legalFindings.find(f => f.ruleIds.includes("LEGAL_CONSENT_MISSING"));
  if (consentBlocker) {
    vetoedBy = "legal";
    return {
      finalDecision: "HUMAN_ESCALATION",
      vetoedBy,
      reasonCodes,
      conditions,
      requiredFixes: ["Yêu cầu khách hàng bổ sung ký tên vào bản thỏa thuận đồng thuận (Consent Registry)."]
    };
  }

  // B. Check for Insurance Tying (Violation blocking approval)
  const tyingViolation = legalFindings.find(f => f.ruleIds.includes("LEGAL_INSURANCE_TYING_DETECTED"));
  if (tyingViolation) {
    vetoedBy = "legal";
    return {
      finalDecision: "HUMAN_ESCALATION",
      vetoedBy,
      reasonCodes: ["LEGAL_INSURANCE_TYING_DETECTED"],
      conditions: [],
      requiredFixes
    };
  }

  // C. Check for unregistered project (Blocks disbursement)
  const projectDirty = legalFindings.find(f => f.ruleIds.includes("LEGAL_PROJECT_NOT_REGISTERED"));
  if (projectDirty) {
    vetoedBy = "legal";
    return {
      finalDecision: "REJECTED",
      vetoedBy,
      reasonCodes,
      conditions: [],
      requiredFixes: ["Dự án không đủ điều kiện liên kết. Yêu cầu đổi sang tài sản thế chấp khác."]
    };
  }

  // D. Check for credit failure
  const creditFail = creditFindings.find(f => f.ruleIds.includes("CREDIT_RESTRUCTURE_FAILED"));
  if (creditFail) {
    vetoedBy = "credit";
    return {
      finalDecision: "REJECTED",
      vetoedBy,
      reasonCodes,
      conditions: [],
      requiredFixes: ["Hồ sơ không đủ khả năng tài chính trả nợ. Vượt ngưỡng DTI stress tối đa sau tái cấu trúc."]
    };
  }

  // E. Catch-all safety net: any BLOCKER-severity finding not already matched by a
  // specific rule above (A-D enumerate known cases; new agents/checks will keep adding
  // rule IDs this list doesn't know about yet) must never silently fall through to an
  // automatic PASS or CONDITIONAL_PASS below — escalate to a human reviewer instead.
  //
  // Exception: the credit agent deliberately keeps the *original* LTV/DTI breach findings
  // in its output as an audit trail even after finding a passing restructure — those are
  // superseded, not unresolved, once CREDIT_RESTRUCTURE_PASS is present.
  const creditRestructured = creditFindings.find(f => f.ruleIds.includes("CREDIT_RESTRUCTURE_PASS"));
  const SUPERSEDED_BY_RESTRUCTURE = new Set(["CREDIT_LTV_EXCEEDS_LIMIT", "CREDIT_DTI_EXCEEDS_LIMIT"]);

  const unhandledBlocker = allFindings.find(f => {
    if (f.severity !== "BLOCKER") return false;
    if (!(f.status === "FAIL" || f.status === "VIOLATION" || f.status === "BLOCKED")) return false;
    if (creditRestructured && f.agent === "credit" && f.ruleIds.some(id => SUPERSEDED_BY_RESTRUCTURE.has(id))) {
      return false;
    }
    return true;
  });
  if (unhandledBlocker) {
    vetoedBy = unhandledBlocker.agent;
    return {
      finalDecision: "HUMAN_ESCALATION",
      vetoedBy,
      reasonCodes,
      conditions: [],
      requiredFixes: unhandledBlocker.requiredFix ? [unhandledBlocker.requiredFix] : requiredFixes
    };
  }

  // F. Check if original failed but restructure passed (Conditional Pass)
  const hasLegalConditions = allFindings.some(f => f.severity === "CONDITION");

  if (creditRestructured || hasLegalConditions) {
    return {
      finalDecision: "CONDITIONAL_PASS",
      reasonCodes: creditRestructured ? ["CREDIT_RESTRUCTURED"] : ["LEGAL_CONDITIONS_REQUIRED"],
      conditions,
      requiredFixes
    };
  }

  // G. Fast pass or standard pass
  return {
    finalDecision: "PASS",
    reasonCodes: ["STANDARD_CHECK_PASS"],
    conditions: [],
    requiredFixes: []
  };
};
