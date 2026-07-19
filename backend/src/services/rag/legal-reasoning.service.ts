import { createAiCompletion } from "../../config/ai-model-router";
import { config } from "../../config/env";
import legalLlmContractJson from "../../policy/legal-llm-contract.json";
import type { RetailCase, ConsentRegistry } from "../../types/case.types";
import type { DecisionEnvelope } from "../../types/agent.types";
import type { ProjectPolicyDetails, RegulationClauseDetails } from "./policy-rag.service";
import { queryProjectGuarantee, queryRegulationClause } from "./policy-rag.service";
import type { ToolCallTrace } from "../../types/trace.types";
import { ChatCompletionTool, ChatCompletionMessageParam, ChatCompletionToolMessageParam } from "openai/resources/chat/completions";
import {
  isToolCallRejectedByProvider,
  normalizeLlmProviderError,
  type NormalizedLlmProviderError,
} from "../llm/provider-error.service";

const MAX_TOOL_ITERATIONS = 6;

interface LegalLlmContract {
  contractId: string;
  version: string;
  allowedClauseIds: string[];
  allowedRuleIds: string[];
  systemPrompt: string;
}

const LEGAL_LLM_CONTRACT = legalLlmContractJson as LegalLlmContract;
const ALLOWED_LEGAL_RULE_IDS = new Set(LEGAL_LLM_CONTRACT.allowedRuleIds);

const DECISION_ENVELOPE_ITEM_SCHEMA = {
  type: "object",
  properties: {
    decisionId: { type: "string" },
    status: { type: "string", enum: ["PASS", "CONDITIONAL_PASS", "VIOLATION", "BLOCKED", "FAIL"] },
    severity: { type: "string", enum: ["INFO", "CONDITION", "WARNING", "BLOCKER"] },
    blocksAt: {
      type: "string",
      enum: ["APPROVAL", "CONTRACT_SIGNING", "DISBURSEMENT", "EXTERNAL_DATA_CALL", "NONE"],
    },
    finding: {
      type: "string",
      description: "Diễn giải bằng tiếng Việt, phải dựa trên kết quả tool call thực tế — không tự bịa nội dung.",
    },
    evidence: {
      type: "object",
      properties: { summary: { type: "string" } },
      required: ["summary"],
      additionalProperties: false,
    },
    ruleIds: { type: "array", items: { type: "string", enum: LEGAL_LLM_CONTRACT.allowedRuleIds } },
    citations: { type: "array", items: { type: "string" }, maxItems: 0 },
    requiredFix: { type: ["string", "null"] },
  },
  required: [
    "decisionId",
    "status",
    "severity",
    "blocksAt",
    "finding",
    "evidence",
    "ruleIds",
    "citations",
    "requiredFix",
  ],
  additionalProperties: false,
};

const TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_regulation_clause",
      description: "Tra cứu nội dung một điều khoản quy định trong đồ thị tri thức pháp lý (Neo4j) của SHB. Chỉ dùng các clauseId đã được liệt kê trong system prompt — không tự đặt clauseId mới không có trong danh sách.",
      parameters: {
        type: "object",
        properties: {
          clauseId: {
            type: "string",
            enum: LEGAL_LLM_CONTRACT.allowedClauseIds,
            description: "ID điều khoản trong catalog đã được kiểm soát, gồm nguồn luật chính thức và policy nội bộ được gắn trạng thái xác minh.",
          },
        },
        required: ["clauseId"],
      },
    }
  },
  {
    type: "function",
    function: {
      name: "get_project_guarantee_status",
      description: "Tra cứu trạng thái bảo lãnh của một dự án bất động sản hình thành trong tương lai trong đồ thị tri thức (Neo4j), theo projectCode lấy từ hồ sơ khách hàng.",
      parameters: {
        type: "object",
        properties: {
          projectCode: { type: "string", description: "Mã dự án bất động sản, lấy đúng từ dữ liệu hồ sơ được cung cấp." },
        },
        required: ["projectCode"],
      },
    }
  },
  {
    type: "function",
    function: {
      name: "submit_findings",
      description: "Sử dụng tool này để gửi kết quả kiểm tra pháp lý cuối cùng (findings) sau khi đã tra cứu xong thông tin. BẮT BUỘC PHẢI GỌI tool này để trả về kết quả cuối cùng.",
      parameters: {
        type: "object",
        properties: {
          findings: { type: "array", items: DECISION_ENVELOPE_ITEM_SCHEMA },
        },
        required: ["findings"],
        additionalProperties: false,
      },
    }
  }
];

// Canonical, versioned contract shared with the fine-tuning dataset builder.
const SYSTEM_PROMPT = LEGAL_LLM_CONTRACT.systemPrompt;

export interface LegalReasoningInput {
  maritalStatus: RetailCase["demographic"]["maritalStatus"];
  hasInsuranceTyingSignal: boolean;
  propertyStatus: RetailCase["property"]["status"];
  projectCode: string | null;
  consent: ConsentRegistry;
  maritalSignatureWarning: boolean;
  loanPurpose: RetailCase["requestedLoan"]["type"];
}

export interface LegalReasoningResult {
  findings: DecisionEnvelope[];
  toolCalls: ToolCallTrace[];
  mode?: "llm_tool_calling" | "deterministic_fallback";
  providerError?: NormalizedLlmProviderError;
}

const FINDING_STATUSES = new Set(["PASS", "CONDITIONAL_PASS", "VIOLATION", "BLOCKED", "FAIL"]);
const FINDING_SEVERITIES = new Set(["INFO", "CONDITION", "WARNING", "BLOCKER"]);
const FINDING_GATES = new Set(["APPROVAL", "CONTRACT_SIGNING", "DISBURSEMENT", "EXTERNAL_DATA_CALL", "NONE"]);

const validateSubmittedFindings = (value: unknown): DecisionEnvelope[] => {
  if (!Array.isArray(value)) throw new Error("Legal reasoning returned findings in an invalid format.");

  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object") throw new Error(`Legal finding ${index} is not an object.`);
    const finding = raw as Record<string, unknown>;
    const evidence = finding.evidence;
    if (typeof finding.decisionId !== "string" || !finding.decisionId.trim()) throw new Error(`Legal finding ${index} has no decisionId.`);
    if (!FINDING_STATUSES.has(String(finding.status))) throw new Error(`Legal finding ${index} has an invalid status.`);
    if (!FINDING_SEVERITIES.has(String(finding.severity))) throw new Error(`Legal finding ${index} has an invalid severity.`);
    if (!FINDING_GATES.has(String(finding.blocksAt))) throw new Error(`Legal finding ${index} has an invalid gate.`);
    if (typeof finding.finding !== "string" || !finding.finding.trim()) throw new Error(`Legal finding ${index} has no explanation.`);
    if (!evidence || typeof evidence !== "object" || typeof (evidence as Record<string, unknown>).summary !== "string") {
      throw new Error(`Legal finding ${index} has no structured evidence.`);
    }
    let ruleIds: string[] = [];
    if (Array.isArray(finding.ruleIds)) {
      ruleIds = finding.ruleIds.map(r => String(r));
    } else if (typeof finding.ruleIds === "string") {
      ruleIds = [finding.ruleIds];
    } else if (typeof finding.ruleId === "string") {
      ruleIds = [finding.ruleId];
    } else if (typeof finding.rule === "string") {
      ruleIds = [finding.rule];
    }

    if (!ruleIds.length || ruleIds.some(rule => typeof rule !== "string" || !rule.trim())) {
      throw new Error(`Legal finding ${index} has no valid rule ID.`);
    }
    if (ruleIds.some(rule => !ALLOWED_LEGAL_RULE_IDS.has(rule))) {
      throw new Error(`Legal finding ${index} contains a rule outside the approved contract.`);
    }
    if (!Array.isArray(finding.citations) || finding.citations.some(citation => typeof citation !== "string")) {
      throw new Error(`Legal finding ${index} has an invalid citations field.`);
    }
    // Model-provided citations are untrusted. The governance layer deterministically
    // rebuilds them from citation-catalog.json after this function returns.
    return {
      decisionId: finding.decisionId as string,
      agent: "legal",
      status: finding.status as DecisionEnvelope["status"],
      severity: finding.severity as DecisionEnvelope["severity"],
      blocksAt: finding.blocksAt as DecisionEnvelope["blocksAt"],
      finding: finding.finding as string,
      evidence: evidence as Record<string, unknown>,
      ruleIds: ruleIds,
      citations: [],
      requiredFix: typeof finding.requiredFix === "string" ? finding.requiredFix : undefined,
    };
  });
};

const executeTool = async (
  name: string,
  input: Record<string, unknown>
): Promise<{ output: Record<string, unknown>; status: "success" | "failed" }> => {
  try {
    if (name === "get_regulation_clause") {
      const clause = await queryRegulationClause(input.clauseId as string);
      return { output: clause ? { ...clause, found: true } : { found: false }, status: "success" };
    }
    if (name === "get_project_guarantee_status") {
      const project = await queryProjectGuarantee(input.projectCode as string);
      return { output: project ? { ...project, found: true } : { found: false }, status: "success" };
    }
    return { output: { error: `Unknown tool: ${name}` }, status: "failed" };
  } catch (err) {
    return {
      output: { error: err instanceof Error ? err.message : "unknown error" },
      status: "failed",
    };
  }
};

const hasProductionGuarantee = (project: ProjectPolicyDetails | null | undefined): boolean =>
  Boolean(project?.isGuaranteedBySHB && project.verificationStatus !== "DEMO_ONLY");

export const buildDeterministicLegalFindings = (
  input: LegalReasoningInput,
  projectGuarantee: ProjectPolicyDetails | null = null
): DecisionEnvelope[] => {
  const findings: DecisionEnvelope[] = [];
  let sequence = 0;
  const nextId = (ruleId: string): string =>
    `dec-legal-${ruleId.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}-${++sequence}`;
  const addFinding = (
    ruleId: string,
    status: DecisionEnvelope["status"],
    severity: DecisionEnvelope["severity"],
    blocksAt: DecisionEnvelope["blocksAt"],
    finding: string,
    evidence: Record<string, unknown>,
    requiredFix?: string
  ) => {
    findings.push({
      decisionId: nextId(ruleId),
      agent: "legal",
      status,
      severity,
      blocksAt,
      finding,
      evidence,
      ruleIds: [ruleId],
      citations: [],
      requiredFix,
    });
  };

  if (input.hasInsuranceTyingSignal) {
    addFinding(
      "LEGAL_INSURANCE_TYING_DETECTED",
      "VIOLATION",
      "BLOCKER",
      "APPROVAL",
      "Phát hiện dấu hiệu bắt buộc mua bảo hiểm kèm khoản vay trong đề nghị sản phẩm; phải dừng phê duyệt cho đến khi gỡ bỏ điều kiện này.",
      { summary: "Kết quả từ Product Agent cho thấy insuranceTyingApplied=true.", clauseId: "Clause-Insurance-Tying" },
      "Gỡ bỏ điều kiện bắt buộc mua bảo hiểm và định giá lại khoản vay độc lập."
    );
  }

  if (input.maritalStatus === "married") {
    if (input.maritalSignatureWarning) {
      addFinding(
        "LEGAL_MARITAL_SIGNATURE_MISSING",
        "FAIL",
        "BLOCKER",
        "CONTRACT_SIGNING",
        "Khách hàng đã kết hôn nhưng hồ sơ cho thấy thiếu bằng chứng chữ ký của vợ/chồng đồng sở hữu đối với tài sản chung.",
        { summary: "Nội dung yêu cầu cho thấy thiếu bằng chứng chữ ký của vợ/chồng đồng sở hữu.", clauseId: "Clause-Marital-Property" },
        "Thu thập chữ ký hợp lệ của vợ/chồng đồng sở hữu hoặc văn bản ủy quyền định đoạt tài sản trước khi ký hợp đồng."
      );
    } else {
      addFinding(
        "LEGAL_MARITAL_PROPERTY_WARNING",
        "CONDITIONAL_PASS",
        "CONDITION",
        "CONTRACT_SIGNING",
        "Khách hàng đã kết hôn; cần xác nhận về tài sản chung vợ chồng trước khi ký hợp đồng.",
        { summary: "Khách hàng đã kết hôn nên cần điểm kiểm soát về hồ sơ tài sản chung vợ chồng.", clauseId: "Clause-Marital-Property" },
        "Xác nhận phạm vi đồng thuận/chữ ký về tài sản chung vợ chồng trước khi ký hợp đồng."
      );
    }
  }

  if (input.propertyStatus === "future_project") {
    if (input.projectCode && hasProductionGuarantee(projectGuarantee)) {
      addFinding(
        "LEGAL_FUTURE_PROPERTY_GUARANTEE",
        "CONDITIONAL_PASS",
        "CONDITION",
        "DISBURSEMENT",
        "Tài sản thế chấp là dự án hình thành trong tương lai đã có bằng chứng bảo lãnh, nhưng vẫn cần xác minh lại trước khi giải ngân.",
        {
          summary: `Dự án ${input.projectCode} có bằng chứng bảo lãnh ${projectGuarantee?.guaranteeContractNo ?? "CHƯA XÁC ĐỊNH"}.`,
          clauseId: "Clause-Future-Property",
          projectCode: input.projectCode,
          verificationStatus: projectGuarantee?.verificationStatus,
        },
        "Xác nhận lại bằng chứng bảo lãnh dự án trước khi giải ngân."
      );
    } else {
      addFinding(
        "LEGAL_PROJECT_NOT_REGISTERED",
        "BLOCKED",
        "BLOCKER",
        "DISBURSEMENT",
        "Tài sản thế chấp là dự án hình thành trong tương lai nhưng chưa có bằng chứng bảo lãnh đã được xác minh ở mức production.",
        {
          summary: input.projectCode
            ? `Không tìm thấy bằng chứng bảo lãnh đã xác minh ở mức production cho dự án ${input.projectCode}.`
            : "Tài sản thế chấp là dự án hình thành trong tương lai nhưng thiếu mã dự án nên không thể xác minh bằng chứng bảo lãnh.",
          clauseId: "Clause-Future-Property",
          projectCode: input.projectCode,
          verificationStatus: projectGuarantee?.verificationStatus ?? "NOT_FOUND",
        },
        "Cung cấp bằng chứng bảo lãnh dự án đã được xác minh trước khi giải ngân."
      );
    }
  }

  if (!input.consent.credit_check || !input.consent.tax_income_check) {
    addFinding(
      "LEGAL_CONSENT_MISSING",
      "BLOCKED",
      "BLOCKER",
      "EXTERNAL_DATA_CALL",
      "Thiếu sự đồng thuận của khách hàng cho việc tra cứu tín dụng hoặc xác minh thu nhập.",
      {
        summary: "Việc tra cứu tín dụng/thu nhập từ bên ngoài yêu cầu khách hàng đồng thuận rõ ràng.",
        clauseId: "Clause-Personal-Data-Consent",
        credit_check: input.consent.credit_check,
        tax_income_check: input.consent.tax_income_check,
      },
      "Thu thập đồng thuận hợp lệ cho việc tra cứu tín dụng và xác minh thu nhập trước khi gọi bất kỳ dữ liệu bên ngoài nào."
    );
  }

  if (input.loanPurpose === "refinance") {
    addFinding(
      "LEGAL_REFINANCE_PURPOSE_UNVERIFIED",
      "BLOCKED",
      "BLOCKER",
      "APPROVAL",
      "Theo Thông tư 06/2023/TT-NHNN, đảo nợ chỉ được phép khi khoản vay gốc phục vụ đời sống/mua nhà và có tài sản bảo đảm; hệ thống không thể tự động xác minh điều kiện ngoại lệ này.",
      {
        summary: "requestedLoan.type=refinance nhưng hệ thống không có cách tự động xác nhận khoản vay gốc đủ điều kiện ngoại lệ đảo nợ.",
        clauseId: "Clause-Loan-Purpose",
      },
      "Chuyên viên tín dụng xác minh thủ công khoản vay gốc (mục đích, có tài sản bảo đảm) trước khi phê duyệt đảo nợ."
    );
  }

  if (input.propertyStatus === "completed") {
    addFinding(
      "LEGAL_COLLATERAL_REGISTRATION_UNVERIFIED",
      "CONDITIONAL_PASS",
      "CONDITION",
      "DISBURSEMENT",
      "Việc công chứng hợp đồng thế chấp và đăng ký biện pháp bảo đảm (Nghị định 99/2022/NĐ-CP) chưa được hệ thống xác minh và cần được xác nhận trước khi giải ngân.",
      {
        summary: "property.status=completed nhưng hệ thống chưa kết nối với Văn phòng Đăng ký đất đai để xác nhận việc đăng ký thế chấp đã công chứng.",
        clauseId: "Clause-Loan-Purpose",
      },
      "Xác nhận hợp đồng thế chấp đã công chứng và đăng ký biện pháp bảo đảm tại Văn phòng Đăng ký đất đai trước khi giải ngân."
    );
  }

  return findings;
};

interface LegalFallbackDependencies {
  queryRegulationClause?: (clauseId: string) => Promise<RegulationClauseDetails | null>;
  queryProjectGuarantee?: (projectCode: string) => Promise<ProjectPolicyDetails | null>;
}

export const runDeterministicLegalFallback = async (
  input: LegalReasoningInput,
  providerError: NormalizedLlmProviderError,
  dependencies: LegalFallbackDependencies = {}
): Promise<LegalReasoningResult> => {
  const toolCalls: ToolCallTrace[] = [];
  const clauseIds = new Set<string>();
  if (input.hasInsuranceTyingSignal) clauseIds.add("Clause-Insurance-Tying");
  if (input.maritalStatus === "married") clauseIds.add("Clause-Marital-Property");
  if (input.propertyStatus === "future_project") clauseIds.add("Clause-Future-Property");
  if (!input.consent.credit_check || !input.consent.tax_income_check) clauseIds.add("Clause-Personal-Data-Consent");
  if (input.loanPurpose === "refinance" || input.propertyStatus === "completed") clauseIds.add("Clause-Loan-Purpose");

  const clauseQuery = dependencies.queryRegulationClause ?? queryRegulationClause;
  for (const clauseId of clauseIds) {
    try {
      const clause = await clauseQuery(clauseId);
      toolCalls.push({
        toolName: "get_regulation_clause",
        input: { clauseId },
        output: clause ? { clauseId, found: true, sourceVerificationStatus: clause.sourceVerificationStatus } : { clauseId, found: false },
        status: "success",
      });
    } catch (error) {
      toolCalls.push({
        toolName: "get_regulation_clause",
        input: { clauseId },
        output: { clauseId, error: error instanceof Error ? error.message : "unknown clause lookup error" },
        status: "failed",
      });
    }
  }

  let projectGuarantee: ProjectPolicyDetails | null = null;
  if (input.propertyStatus === "future_project" && input.projectCode) {
    const projectQuery = dependencies.queryProjectGuarantee ?? queryProjectGuarantee;
    try {
      projectGuarantee = await projectQuery(input.projectCode);
      toolCalls.push({
        toolName: "get_project_guarantee_status",
        input: { projectCode: input.projectCode },
        output: projectGuarantee
          ? {
            projectCode: input.projectCode,
            found: true,
            isGuaranteedBySHB: projectGuarantee.isGuaranteedBySHB,
            verificationStatus: projectGuarantee.verificationStatus,
          }
          : { projectCode: input.projectCode, found: false },
        status: "success",
      });
    } catch (error) {
      toolCalls.push({
        toolName: "get_project_guarantee_status",
        input: { projectCode: input.projectCode },
        output: { projectCode: input.projectCode, error: error instanceof Error ? error.message : "unknown project lookup error" },
        status: "failed",
      });
    }
  }

  const findings = buildDeterministicLegalFindings(input, projectGuarantee);
  toolCalls.unshift({
    toolName: "legalDeterministicFallback",
    input: {
      reason: providerError.code,
      providerModel: providerError.model ?? config.fptLegalModel,
      requestId: providerError.requestId,
    },
    output: {
      reason: providerError.message,
      providerModel: providerError.model ?? config.fptLegalModel,
      findingsCount: findings.length,
    },
    status: "success",
  });

  return {
    findings,
    toolCalls,
    mode: "deterministic_fallback",
    providerError,
  };
};

/**
 * Runs the Legal & Compliance Agent's RAG-backed reasoning through the OpenAI API:
 * the model decides which regulation/project lookups apply to this case (grounded via
 * tool calls against the Neo4j policy graph) and returns findings constrained to the
 * DecisionEnvelope schema via the submit_findings tool call.
 */
export const runLegalComplianceReasoning = async (
  retailCase: RetailCase,
  prompt: string,
  hasInsuranceTyingSignal: boolean
): Promise<LegalReasoningResult> => {
  const toolCallLog: ToolCallTrace[] = [];

  // Data minimisation: the model never receives the raw user prompt. Only the narrow,
  // deterministic legal signal needed for this review crosses the model boundary.
  const maritalSignatureWarning = /(thiếu|chưa\s*(có|đủ|có\s+đủ)).{0,40}(chữ\s*ký|ký\s*tên).{0,40}(vợ|chồng)|tài\s*sản\s*chung.{0,50}(thiếu|chưa\s*(có|đủ|có\s+đủ)).{0,30}(chữ\s*ký|ký\s*tên)/iu.test(prompt);
  const reasoningInput: LegalReasoningInput = {
    maritalStatus: retailCase.demographic.maritalStatus,
    hasInsuranceTyingSignal,
    propertyStatus: retailCase.property.status,
    projectCode: retailCase.property.projectCode ?? null,
    consent: retailCase.consent,
    maritalSignatureWarning,
    loanPurpose: retailCase.requestedLoan.type,
  };

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Dữ liệu hồ sơ cần soát xét (JSON):\n${JSON.stringify(reasoningInput, null, 2)}`,
    },
  ];

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    let response;
    try {
      response = await createAiCompletion("legal", {
        messages,
        tools: TOOLS,
        tool_choice: "auto",
      });
    } catch (error) {
      const normalized = normalizeLlmProviderError(error, {
        model: config.fptLegalModel,
        operation: "legalComplianceReasoning",
      });
      if (isToolCallRejectedByProvider(normalized)) {
        return runDeterministicLegalFallback(reasoningInput, normalized);
      }
      throw error;
    }

    const choice = response.choices[0];
    const message = choice.message;

    // OpenAI requires the assistant message to be appended back if it has tool calls
    messages.push(message);

    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        if (toolCall.type !== "function") continue;

        if (toolCall.function.name === "submit_findings") {
          const args = JSON.parse(toolCall.function.arguments) as { findings?: unknown };
          return { findings: validateSubmittedFindings(args.findings), toolCalls: toolCallLog };
        }

        const input = JSON.parse(toolCall.function.arguments);
        const { output, status } = await executeTool(toolCall.function.name, input);
        
        toolCallLog.push({ toolName: toolCall.function.name, input, output, status });
        
        const toolResultMessage: ChatCompletionToolMessageParam = {
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(output),
        };
        messages.push(toolResultMessage);
      }
    } else {
      const normalized: NormalizedLlmProviderError = {
        code: "MODEL_TOOL_CALL_UNSUPPORTED_OR_REJECTED",
        model: config.fptLegalModel,
        message: `legalComplianceReasoning: model ${config.fptLegalModel} returned text instead of calling submit_findings.`,
        rawMessage: "Legal reasoning: model returned text instead of calling submit_findings tool.",
      };
      return runDeterministicLegalFallback(reasoningInput, normalized);
    }
  }

  throw new Error("Legal reasoning: exceeded max tool-use iterations without a final answer.");
};
