import { getFptMarketplaceClient } from "../../config/fpt-marketplace";
import { config } from "../../config/env";
import { RetailCase, ConsentRegistry } from "../../types/case.types";
import { DecisionEnvelope } from "../../types/agent.types";
import { queryProjectGuarantee, queryRegulationClause } from "./policy-rag.service";
import { ToolCallTrace } from "../../types/trace.types";
import { ChatCompletionTool, ChatCompletionMessageParam, ChatCompletionToolMessageParam } from "openai/resources/chat/completions";

const MAX_TOOL_ITERATIONS = 6;

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
    ruleIds: { type: "array", items: { type: "string" } },
    citations: { type: "array", items: { type: "string" } },
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
            description: "ID điều khoản, ví dụ: Clause-Insurance-Tying, Clause-Marital-Property, Clause-Future-Property, Clause-Loan-Purpose, Clause-DTI-Limit, Clause-LTV-Limit, Clause-Tenure-Limit, Clause-CIC-History",
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

const SYSTEM_PROMPT = `Bạn là Legal & Compliance Agent của Ngân hàng SHB, chịu trách nhiệm soát xét tuân thủ pháp lý cho hồ sơ tín dụng bán lẻ trước khi phê duyệt.

QUY TẮC BẮT BUỘC:
- Mọi trích dẫn pháp lý (citations) và mọi finding phải dựa trên kết quả trả về từ tool call thực tế — TUYỆT ĐỐI không tự bịa đặt nội dung điều khoản hoặc mã điều khoản không tồn tại trong hệ thống.
- Nếu tool trả về không tìm thấy (found: false), phải nêu rõ điều đó trong finding thay vì suy diễn nội dung.
- Chỉ được gọi get_regulation_clause với một trong các clauseId sau: "Clause-Insurance-Tying", "Clause-Marital-Property", "Clause-Future-Property", "Clause-Loan-Purpose", "Clause-DTI-Limit", "Clause-LTV-Limit", "Clause-Tenure-Limit", "Clause-CIC-History".
- BẠN BẮT BUỘC PHẢI GỌI tool "submit_findings" để nộp kết quả soát xét pháp lý (findings) cuối cùng. ĐỪNG trả về finding dưới dạng văn bản bình thường, mà hãy truyền vào tham số của hàm submit_findings.

CÁC TRƯỜNG HỢP CẦN KIỂM TRA (chỉ áp dụng khi dữ liệu hồ sơ khớp điều kiện — không tạo finding cho trường hợp không áp dụng):

1. Nếu hasInsuranceTyingSignal = true: PHẢI gọi get_regulation_clause("Clause-Insurance-Tying") trước, sau đó tạo một finding với status="VIOLATION", severity="BLOCKER", blocksAt="APPROVAL", ruleIds=["LEGAL_INSURANCE_TYING_DETECTED"], requiredFix mô tả yêu cầu loại bỏ điều kiện mua bảo hiểm và định giá lại, và citations gồm mô tả điều khoản lấy từ tool cộng thêm "Luật Các tổ chức tín dụng 2024 - Điều 10".

2. Nếu maritalStatus = "married": PHẢI gọi get_regulation_clause("Clause-Marital-Property") trước.
   - Nếu trong yêu cầu (prompt) hoặc thông tin hồ sơ cho thấy thiếu chữ ký đồng thuận của vợ/chồng (ví dụ: chưa có đủ chữ ký, thiếu chữ ký vợ/chồng, tài sản chung chưa đủ chữ ký): tạo finding với status="FAIL", severity="BLOCKER", blocksAt="CONTRACT_SIGNING", ruleIds=["LEGAL_MARITAL_SIGNATURE_MISSING"], requiredFix "Cần bổ sung chữ ký đồng thuận của vợ/chồng vào hợp đồng thế chấp", citations gồm "Luật Hôn nhân và Gia đình Việt Nam 2014 - Điều 35".
   - Ngược lại (nếu đã có đầy đủ chữ ký hoặc không có cảnh báo thiếu): tạo finding với status="CONDITIONAL_PASS", severity="CONDITION", blocksAt="CONTRACT_SIGNING", ruleIds=["LEGAL_MARITAL_PROPERTY_WARNING"], requiredFix=null, citations gồm "Luật Hôn nhân và Gia đình Việt Nam 2014 - Điều 35".

3. Nếu propertyStatus = "future_project" và có projectCode: PHẢI gọi get_regulation_clause("Clause-Future-Property") VÀ get_project_guarantee_status(projectCode).
   - Nếu dự án không được bảo lãnh (isGuaranteedBySHB=false hoặc found=false): tạo finding với status="FAIL", severity="BLOCKER", blocksAt="DISBURSEMENT", ruleIds=["LEGAL_PROJECT_NOT_REGISTERED"], requiredFix mô tả cần chuyển sang tài sản thế chấp khác, citations gồm "Luật Kinh doanh Bất động sản 2023 - Điều 26".
   - Nếu được bảo lãnh: tạo finding với status="CONDITIONAL_PASS", severity="CONDITION", blocksAt="DISBURSEMENT", ruleIds=["LEGAL_FUTURE_PROPERTY_GUARANTEE"], requiredFix=null, citations gồm "Luật Nhà ở 2023 - Điều 129".

4. Kiểm tra sự chấp thuận thông tin (Consent): Nếu consent.credit_check = false hoặc consent.tax_income_check = false: tạo finding với status="BLOCKED", severity="BLOCKER", blocksAt="EXTERNAL_DATA_CALL", ruleIds=["LEGAL_CONSENT_MISSING"], requiredFix "Yêu cầu khách hàng bổ sung ký tên vào bản thỏa thuận đồng thuận (Consent Registry)", citations gồm "Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân", "Quy định bảo mật SHB".

5. Nếu không trường hợp nào áp dụng, trả về findings rỗng ([]).

Mỗi finding phải có decisionId dạng "dec-legal-<mô-tả-ngắn>-<vài số ngẫu nhiên>".`;

interface LegalReasoningInput {
  maritalStatus: RetailCase["demographic"]["maritalStatus"];
  hasInsuranceTyingSignal: boolean;
  propertyStatus: RetailCase["property"]["status"];
  projectCode: string | null;
  consent: ConsentRegistry;
  prompt: string;
}

export interface LegalReasoningResult {
  findings: DecisionEnvelope[];
  toolCalls: ToolCallTrace[];
}

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
  const client = getFptMarketplaceClient();
  const toolCallLog: ToolCallTrace[] = [];

  const reasoningInput: LegalReasoningInput = {
    maritalStatus: retailCase.demographic.maritalStatus,
    hasInsuranceTyingSignal,
    propertyStatus: retailCase.property.status,
    projectCode: retailCase.property.projectCode ?? null,
    consent: retailCase.consent,
    prompt: prompt
  };

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Dữ liệu hồ sơ cần soát xét (JSON):\n${JSON.stringify(reasoningInput, null, 2)}`,
    },
  ];

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await client.chat.completions.create({
      model: config.fptLegalModel,
      messages,
      tools: TOOLS,
      tool_choice: "auto",
    });

    const choice = response.choices[0];
    const message = choice.message;

    // OpenAI requires the assistant message to be appended back if it has tool calls
    messages.push(message);

    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        if (toolCall.type !== "function") continue;

        if (toolCall.function.name === "submit_findings") {
          // The model has submitted the final structured output
          const args = JSON.parse(toolCall.function.arguments);
          return { findings: args.findings, toolCalls: toolCallLog };
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
      // The model returned text without a tool call. It should have used submit_findings.
      throw new Error("Legal reasoning: model returned text instead of calling submit_findings tool.");
    }
  }

  throw new Error("Legal reasoning: exceeded max tool-use iterations without a final answer.");
};
