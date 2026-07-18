import {
  AuditEvent,
  DecisionCondition,
  ExecutionAction,
  GateStatus,
  RetailCaseRun,
} from "../../types/orchestration.types";
import { AgentTrace, ToolCallTrace } from "../../types/trace.types";
import { evaluateAutoPolicy, issueAutoApprovalToken } from "./approval.service";
import { KhcnCaseFixture, routerInputFromCaseInput } from "./case-fixture.service";
import {
  buildBlockedHybridActions,
  buildBlockedHybridToolCalls,
  buildFastExecution,
} from "./execution.service";
import { DTI_CAP, LTV_CAP, STRESS_RATE, runCreditRuleEngine } from "./rule-engine/credit-rule-engine.service";
import { runGateRuleEngine } from "./rule-engine/gate-rule-engine.service";
import { runLegalRuleEngine } from "./rule-engine/legal-rule-engine.service";
import { asNumber, collectStrings, getRequestedLoan, hasConsentScope } from "./rule-engine/rule-engine-common";
import { CreditAnalysis, LegalFinding, PromptInjectionScan } from "./rule-engine/rule-engine.types";
import { runPromptInjectionGuard } from "./rule-engine/security-rule-engine.service";
import { agentTrace, auditEvent, formatPercent, newId, nowIso } from "./retail-common";
import { routeRetailRequest } from "./router.service";

const conditionsFromFindings = (findings: LegalFinding[], gateStatus: GateStatus): DecisionCondition[] =>
  findings
    .filter((finding) => finding.blocksAt !== "APPROVAL" || gateStatus === "REPLAN_REQUIRED")
    .map((finding, index) => ({
      conditionId: `${finding.ruleId}-${index + 1}`,
      blocksAt: finding.blocksAt,
      text: finding.text,
      basisRuleId: finding.ruleId,
    }));

const buildLegalToolCalls = (findings: LegalFinding[]): ToolCallTrace[] =>
  findings.map((finding) => ({
    toolName: `legal.${finding.ruleId.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    input: { rule_id: finding.ruleId },
    output: {
      status: finding.status,
      severity: finding.severity,
      blocks_at: finding.blocksAt,
      calculation: finding.calculation,
    },
    status: "success",
  }));

const countMaskedTokens = (fixture: KhcnCaseFixture) => {
  const strings: Array<{ path: string; text: string }> = [];
  collectStrings(fixture.caseInput, "/case_input", strings);
  collectStrings(fixture.parsedDocs, "/parsed_docs", strings);
  collectStrings(fixture.core.customer360, "/core/customer_360", strings);
  return strings.filter((item) => /_TOKEN_\d+/i.test(item.text)).length;
};

const buildFastRun = (fixture: KhcnCaseFixture): RetailCaseRun => {
  const requestId = newId("REQ-FAST");
  const timestamp = nowIso();
  const requestedLoan = getRequestedLoan(fixture);
  const routerInput = routerInputFromCaseInput(fixture.caseInput);
  const routerDecision = routeRetailRequest(routerInput);
  const amount = asNumber(requestedLoan.amount, routerInput.loanAmount);
  const consentComplete = hasConsentScope(fixture, "CREDIT_ASSESSMENT");
  const autoPolicy = evaluateAutoPolicy({
    amount,
    dtiBufferSafe: true,
    consentComplete,
    legalBlockers: 0,
    policyExceptions: 0,
  });
  const autoApprovalToken = autoPolicy.autoPolicyPassed ? issueAutoApprovalToken() : undefined;
  const fastExecution = autoApprovalToken ? buildFastExecution(autoApprovalToken) : { actions: [], toolCalls: [] };

  const traces: AgentTrace[] = [
    agentTrace(requestId, "router", "Route request and choose approval lane", "FAST tier selected from risk_router_inputs.", [
      {
        toolName: "risk_router.route",
        input: {
          loan_amount: routerInput.loanAmount,
          collateral_type: routerInput.collateralType,
          income_sources_count: routerInput.incomeSourcesCount,
          has_unverified_income: routerInput.hasUnverifiedIncome,
          has_external_debt: routerInput.hasExternalDebt,
          is_future_property: routerInput.isFutureProperty,
        },
        output: {
          tier: routerDecision.tier,
          approval_route: routerDecision.approvalRoute,
          agents_required: routerDecision.agentsRequired,
          rule_id: routerDecision.ruleId,
        },
        status: "success",
      },
    ]),
    agentTrace(requestId, "gate", "Evaluate auto approval policy", "All deterministic auto-policy checks passed.", [
      {
        toolName: "approval.evaluate_auto_policy",
        input: {
          amount,
          dti_buffer_safe: true,
          consent_complete: consentComplete,
          legal_blockers: 0,
          policy_exceptions: 0,
        },
        output: {
          auto_policy_passed: autoPolicy.autoPolicyPassed,
          gate_status: autoPolicy.gateStatus,
          issued_token: autoApprovalToken,
        },
        status: "success",
      },
    ]),
    agentTrace(
      requestId,
      "operations",
      "Execute allowed auto-approval actions",
      "Mock LOS approval and customer notification created with auto approval token.",
      fastExecution.toolCalls
    ),
  ];

  const audit: AuditEvent[] = [
    auditEvent(requestId, "router", "ROUTED", "FAST tier selected.", { approvalRoute: routerDecision.approvalRoute }),
    auditEvent(requestId, "approval_policy", "AUTO_APPROVED", "Auto policy passed and token issued.", {
      autoApprovalToken,
    }),
    auditEvent(requestId, "operations", "EXECUTED", "Allowed auto approval actions completed."),
  ];

  return {
    requestId,
    caseId: fixture.caseId,
    title: fixture.title,
    product: fixture.product,
    riskTier: routerDecision.tier,
    approvalRoute: routerDecision.approvalRoute,
    status: autoPolicy.autoPolicyPassed ? "COMPLETED" : "FAILED",
    gateStatus: autoPolicy.gateStatus,
    finalAnswer: "AUTO_APPROVED. Fast retail case passed deterministic policy and executed with auto_approval_token.",
    autoApprovalToken,
    requiresHumanApproval: false,
    customerRequest: {
      loanAmount: amount,
      termMonths: asNumber(requestedLoan.term_months, 0),
      purpose: requestedLoan.purpose,
    },
    systemProposal: {
      loanAmount: amount,
      gateStatus: autoPolicy.gateStatus,
      approvalRoute: routerDecision.approvalRoute,
      fullMultiAgentRun: false,
    },
    conditions: [],
    executionActions: fastExecution.actions,
    governance: {
      tier: routerDecision.tier,
      approvalRoute: routerDecision.approvalRoute,
      modelCallsUsed: 1,
      modelCallsBudget: 1,
      estimatedCostUsd: 0.01,
      maxCostUsd: 0.02,
      rawPiiToLlm: false,
      maskedFieldCount: countMaskedTokens(fixture),
      replayMode: true,
      cacheHitCount: 1,
    },
    traces,
    audit,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

const buildExecutionForGate = (gateStatus: GateStatus): ExecutionAction[] => {
  if (gateStatus === "CONDITIONAL_PASS") {
    return buildBlockedHybridActions();
  }

  if (gateStatus === "CONSENT_REQUIRED") {
    return [
      {
        tool: "external.verify_income_bhxh",
        sideEffect: "NONE",
        status: "BLOCKED",
        requiresApprovalToken: false,
        message: "ConsentRequired. Outbound calls made: 0.",
      },
      {
        tool: "audit.append_event",
        sideEffect: "LOW",
        status: "APPENDED",
        requiresApprovalToken: false,
        message: "Missing consent audit event appended.",
      },
    ];
  }

  return [
    {
      tool: "audit.append_event",
      sideEffect: "LOW",
      status: "APPENDED",
      requiresApprovalToken: false,
      message: `${gateStatus} audit event appended.`,
    },
  ];
};

const buildComplexTraces = (
  fixture: KhcnCaseFixture,
  requestId: string,
  credit: CreditAnalysis,
  findings: LegalFinding[],
  injection: PromptInjectionScan,
  gateStatus: GateStatus
): AgentTrace[] => {
  const routerInput = routerInputFromCaseInput(fixture.caseInput);
  const routerDecision = routeRetailRequest(routerInput);
  const traces: AgentTrace[] = [
    agentTrace(requestId, "router", "Route request and choose approval lane", "COMPLEX tier selected from risk_router_inputs.", [
      {
        toolName: "risk_router.route",
        input: {
          loan_amount: routerInput.loanAmount,
          collateral_type: routerInput.collateralType,
          income_sources_count: routerInput.incomeSourcesCount,
          has_unverified_income: routerInput.hasUnverifiedIncome,
          has_external_debt: routerInput.hasExternalDebt,
          is_future_property: routerInput.isFutureProperty,
        },
        output: {
          tier: routerDecision.tier,
          approval_route: routerDecision.approvalRoute,
          agents_required: routerDecision.agentsRequired,
          rule_id: routerDecision.ruleId,
        },
        status: "success",
      },
    ]),
    agentTrace(requestId, "planner", "Build dependency graph", "Planner launched Credit, Legal, Operations, and Compliance Gate paths.", [
      {
        toolName: "planner.build_dependency_graph",
        input: { case_id: fixture.caseId },
        output: { graph: ["router", "planner", "credit", "legal", "compliance_gate", "operations"] },
        status: "success",
      },
    ]),
    agentTrace(
      requestId,
      "credit",
      "Compute affordability and restructure proposal",
      credit.proposalPasses
        ? `Restructured proposal passes at ${credit.proposedAmount} VND over ${credit.proposedTermMonths} months.`
        : "Restructured proposal cannot stay above the minimum viable amount while passing DTI/LTV.",
      [
        {
          toolName: "credit.apply_income_haircut",
          input: { income_sources: credit.breakdown.map((item) => item.source) },
          output: {
            qualified_income_monthly: credit.qualifiedIncome,
            breakdown: credit.breakdown,
          },
          status: "success",
        },
        {
          toolName: "credit.dti_stress_test",
          input: {
            home_loan_amount: credit.requestedAmount,
            term_months: credit.requestedTermMonths,
            stress_rate: STRESS_RATE,
          },
          output: {
            home_emi_stress: credit.requestedHomeEmiStress,
            total_monthly_obligations: credit.requestedHomeEmiStress + credit.currentAutoEmi + credit.currentCardObligation,
            dti: Number(credit.requestedDti.toFixed(4)),
            dti_display: credit.requestedDtiDisplay,
            dti_pass: credit.requestedDti <= DTI_CAP,
            ltv: Number(credit.requestedLtv.toFixed(4)),
            ltv_display: credit.requestedLtvDisplay,
            ltv_pass: credit.requestedLtv <= LTV_CAP,
          },
          status: "success",
        },
        {
          toolName: "credit.restructure_optimizer",
          input: {
            requested_amount: credit.requestedAmount,
            requested_term_months: credit.requestedTermMonths,
            dti_cap: DTI_CAP,
            ltv_cap: LTV_CAP,
          },
          output: {
            proposed_amount: credit.proposedAmount,
            affordable_home_loan_amount_30y_stress: credit.affordableHomeLoanAmount,
            proposed_term_months: credit.proposedTermMonths,
            dti_stress: Number(credit.stressDti.toFixed(4)),
            dti_display: credit.stressDtiDisplay,
            ltv: Number(credit.ltv.toFixed(4)),
            ltv_display: credit.ltvDisplay,
            proposal_passes: credit.proposalPasses,
            levers: credit.leversApplied,
          },
          status: "success",
        },
      ]
    ),
  ];

  if (findings.length > 0) {
    traces.push(
      agentTrace(
        requestId,
        "legal",
        "Apply retail legal and compliance rule pack",
        `${findings.length} legal/compliance finding(s) produced from parsed documents and consent registry.`,
        buildLegalToolCalls(findings)
      )
    );
  }

  if (injection.detected) {
    traces.push(
      agentTrace(requestId, "system", "Scan prompt injection and PII leakage", "Prompt injection detected, stripped, and audited before model use.", [
        {
          toolName: "prompt_injection_guard.scan",
          input: { scanned_sources: injection.locations },
          output: {
            rule_id: "SHB-INJECTION-GUARD-RETAIL-001",
            injection_detected: true,
            matched_patterns: injection.matchedPatterns,
            instruction_followed: false,
            span_stripped_before_model: true,
          },
          status: "success",
        },
      ])
    );
  }

  traces.push(
    agentTrace(requestId, "gate", "Run Compliance Gate", `Gate returned ${gateStatus}.`, [
      {
        toolName: "compliance_gate.evaluate",
        input: {
          credit_pass: credit.proposalPasses,
          legal_findings: findings.map((finding) => finding.ruleId),
          prompt_injection_detected: injection.detected,
        },
        output: {
          gate_status: gateStatus,
          final_home_loan_amount: gateStatus === "REJECT_OR_REQUEST_LOWER_AMOUNT" ? null : credit.proposedAmount,
          binding_dti_display: credit.stressDtiDisplay,
          ltv_display: credit.ltvDisplay,
        },
        status: "success",
      },
    ])
  );

  if (gateStatus === "CONDITIONAL_PASS") {
    traces.push(
      agentTrace(
        requestId,
        "operations",
        "Prepare execution and enforce approval guard",
        "HIGH write tools are blocked until human_approval_token exists.",
        buildBlockedHybridToolCalls(),
        "blocked"
      )
    );
  }

  if (gateStatus === "CONSENT_REQUIRED") {
    traces.push(
      agentTrace(
        requestId,
        "operations",
        "Enforce consent guard",
        "External income API was not called because consent is missing.",
        [
          {
            toolName: "external.verify_income_bhxh",
            input: { consent_scope: "INCOME_VERIFICATION_BHXH" },
            output: { status: "BLOCKED", error: "ConsentRequired", outbound_calls_made: 0 },
            status: "failed",
          },
        ],
        "blocked"
      )
    );
  }

  return traces;
};

const finalAnswerForGate = (gateStatus: GateStatus, credit: CreditAnalysis) => {
  if (gateStatus === "CONDITIONAL_PASS") {
    return `HYBRID_APPROVAL. AI agents recommend CONDITIONAL_PASS at ${credit.proposedAmount} VND/${credit.proposedTermMonths}m, but HIGH actions wait for human_approval_token.`;
  }

  if (gateStatus === "CONSENT_REQUIRED") {
    return "CONSENT_REQUIRED. External income verification is blocked and zero outbound calls are made until consent is granted.";
  }

  if (gateStatus === "REPLAN_REQUIRED") {
    return "REPLAN_REQUIRED. Optional insurance was detected as a pricing input and must be removed before approval.";
  }

  if (gateStatus === "REJECT_OR_REQUEST_LOWER_AMOUNT") {
    return "REJECT_OR_REQUEST_LOWER_AMOUNT. Current income cannot support a viable restructured amount under the stress DTI cap.";
  }

  return `${gateStatus}.`;
};

const buildComplexRun = (fixture: KhcnCaseFixture): RetailCaseRun => {
  const requestId = newId("REQ-KHCN");
  const timestamp = nowIso();
  const routerDecision = routeRetailRequest(routerInputFromCaseInput(fixture.caseInput));
  const requestedLoan = getRequestedLoan(fixture);
  const credit = runCreditRuleEngine(fixture);
  const findings = runLegalRuleEngine(fixture);
  const injection = runPromptInjectionGuard(fixture);
  const gateStatus = runGateRuleEngine(credit, findings);
  const conditions = conditionsFromFindings(findings, gateStatus);
  const traces = buildComplexTraces(fixture, requestId, credit, findings, injection, gateStatus);
  const executionActions = buildExecutionForGate(gateStatus);
  const audit: AuditEvent[] = [
    auditEvent(requestId, "router", "ROUTED", "COMPLEX tier selected.", { approvalRoute: routerDecision.approvalRoute }),
    auditEvent(requestId, "credit", "CREDIT_CALCULATED", "Credit calculations completed deterministically.", {
      qualifiedIncome: credit.qualifiedIncome,
      proposedAmount: credit.proposedAmount,
      stressDti: credit.stressDtiDisplay,
      ltv: credit.ltvDisplay,
    }),
    ...findings.map((finding) =>
      auditEvent(requestId, "legal", finding.status, `${finding.ruleId} fired.`, {
        blocksAt: finding.blocksAt,
      })
    ),
    auditEvent(requestId, "gate", gateStatus, `Compliance gate returned ${gateStatus}.`),
  ];

  if (injection.detected) {
    audit.push(
      auditEvent(requestId, "model_gateway", "PROMPT_INJECTION_DETECTED", "Injection span stripped before model use.", {
        matchedPatterns: injection.matchedPatterns,
      })
    );
  }

  return {
    requestId,
    caseId: fixture.caseId,
    title: fixture.title,
    product: fixture.product,
    riskTier: routerDecision.tier,
    approvalRoute: routerDecision.approvalRoute,
    status: gateStatus === "CONDITIONAL_PASS" ? "WAITING_HUMAN_APPROVAL" : "COMPLETED",
    gateStatus,
    finalAnswer: finalAnswerForGate(gateStatus, credit),
    requiresHumanApproval: gateStatus === "CONDITIONAL_PASS",
    customerRequest: {
      requestedHomeLoanAmount: credit.requestedAmount,
      requestedTermMonths: credit.requestedTermMonths,
      requestedPromotionalRate: formatPercent(asNumber(requestedLoan.requested_promotional_rate, 0.075)),
      requestedDtiStress: credit.requestedDtiDisplay,
      requestedLtv: credit.requestedLtvDisplay,
    },
    systemProposal: {
      homeLoanAmount: gateStatus === "REJECT_OR_REQUEST_LOWER_AMOUNT" ? null : credit.proposedAmount,
      maxAffordableHomeLoanAmount: credit.affordableHomeLoanAmount,
      termMonths: credit.proposedTermMonths,
      promotionalRate: formatPercent(asNumber(requestedLoan.requested_promotional_rate, 0.075)),
      floatingRate: formatPercent(asNumber(requestedLoan.floating_rate_after_promo_customer_expected, 0.115)),
      stressDti: credit.stressDtiDisplay,
      ltv: credit.ltvDisplay,
      pricing: "Insurance is optional and is not an input to pricing.",
      monthlyObligations: [
        {
          scenario: "PROMOTIONAL_12M",
          homeEmi: credit.restructuredHomeEmiPromo,
          autoLoanEmi: credit.refinancedAutoEmi,
          cardObligation: credit.restructuredCardObligation,
          dti: formatPercent(
            (credit.restructuredHomeEmiPromo + credit.refinancedAutoEmi + credit.restructuredCardObligation) /
              credit.qualifiedIncome
          ),
        },
        {
          scenario: "FLOATING",
          homeEmi: credit.restructuredHomeEmiFloating,
          autoLoanEmi: credit.refinancedAutoEmi,
          cardObligation: credit.restructuredCardObligation,
          dti: formatPercent(
            (credit.restructuredHomeEmiFloating + credit.refinancedAutoEmi + credit.restructuredCardObligation) /
              credit.qualifiedIncome
          ),
        },
        {
          scenario: "STRESS",
          homeEmi: credit.restructuredHomeEmiStress,
          autoLoanEmi: credit.refinancedAutoEmi,
          cardObligation: credit.restructuredCardObligation,
          dti: credit.stressDtiDisplay,
        },
      ],
    },
    conditions,
    executionActions,
    governance: {
      tier: routerDecision.tier,
      approvalRoute: routerDecision.approvalRoute,
      modelCallsUsed: injection.detected ? 5 : 4,
      modelCallsBudget: 8,
      estimatedCostUsd: injection.detected ? 0.14 : 0.12,
      maxCostUsd: 0.25,
      rawPiiToLlm: false,
      maskedFieldCount: countMaskedTokens(fixture),
      replayMode: true,
      cacheHitCount: 2,
    },
    traces,
    audit,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

export const buildRetailCaseRunFromFixture = (fixture: KhcnCaseFixture): RetailCaseRun =>
  fixture.riskTier === "FAST" ? buildFastRun(fixture) : buildComplexRun(fixture);
