import { createAiCompletion } from "../../config/ai-model-router";
import { RetailCase } from "../../types/case.types";
import { ChatCompletionTool, ChatCompletionMessageParam } from "openai/resources/chat/completions";

const INCOME_TYPES = new Set(["salary", "freelance", "rental"]);
const DEBT_TYPES = new Set(["auto", "credit_card", "other"]);
const LOAN_TYPES = new Set(["mortgage", "refinance"]);
const PROPERTY_TYPES = new Set(["apartment", "land", "house"]);
const PROPERTY_STATUSES = new Set(["completed", "future_project"]);
const MARITAL_STATUSES = new Set(["single", "married"]);
const INSURANCE_PREFERENCES = new Set(["accepted", "declined"]);

const RETAIL_CASE_SCHEMA = {
  type: "object",
  properties: {
    demographic: {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number" },
        maritalStatus: { type: "string", enum: ["single", "married"] },
        cccd: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
      },
      required: ["name", "age", "maritalStatus", "cccd", "phone", "email"],
      additionalProperties: false,
    },
    incomeSources: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["salary", "freelance", "rental"] },
          amount: { type: "number", description: "VND/tháng" },
          evidence: { type: "string" },
        },
        required: ["type", "amount", "evidence"],
        additionalProperties: false,
      },
    },
    currentDebts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["auto", "credit_card", "other"] },
          monthlyOwed: { type: "number" },
          outstandingAmount: { type: "number" },
          limit: { type: ["number", "null"] },
          evidence: { type: "string" },
        },
        required: ["type", "monthlyOwed", "outstandingAmount", "limit", "evidence"],
        additionalProperties: false,
      },
    },
    requestedLoan: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["mortgage", "refinance"] },
        amount: { type: "number" },
        tenureYears: { type: "number" },
      },
      required: ["type", "amount", "tenureYears"],
      additionalProperties: false,
    },
    property: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["apartment", "land", "house"] },
        value: { type: "number" },
        status: { type: "string", enum: ["completed", "future_project"] },
        projectCode: { type: ["string", "null"] },
        evidence: { type: "string" },
      },
      required: ["type", "value", "status", "projectCode", "evidence"],
      additionalProperties: false,
    },
    consent: {
      type: "object",
      properties: {
        credit_check: { type: "boolean" },
        tax_income_check: { type: "boolean" },
        social_insurance_check: { type: "boolean" },
        marketing: { type: "boolean" },
      },
      required: ["credit_check", "tax_income_check", "social_insurance_check", "marketing"],
      additionalProperties: false,
    },
    insurancePreference: { type: "string", enum: ["accepted", "declined"] },
  },
  required: [
    "demographic",
    "incomeSources",
    "currentDebts",
    "requestedLoan",
    "property",
    "consent",
    "insurancePreference",
  ],
  additionalProperties: false,
};

const TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "submit_case",
      description:
        "Gửi hồ sơ khách hàng đã được trích xuất đầy đủ theo đúng schema RetailCase. CHỈ gọi tool này khi mọi trường bắt buộc đều có giá trị thực sự lấy được từ nội dung người dùng cung cấp — KHÔNG được tự bịa, đoán hoặc điền giá trị mặc định cho bất kỳ trường nào.",
      parameters: { type: "object", properties: { case: RETAIL_CASE_SCHEMA }, required: ["case"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "request_more_info",
      description:
        "Gọi tool này khi nội dung người dùng cung cấp KHÔNG đủ để điền hết các trường bắt buộc của hồ sơ tín dụng. Liệt kê rõ ràng, bằng tiếng Việt, những thông tin còn thiếu cần hỏi lại chuyên viên/khách hàng.",
      parameters: {
        type: "object",
        properties: {
          missingFields: { type: "array", items: { type: "string" }, description: "Tên các trường dữ liệu còn thiếu, vd. 'thu nhập hàng tháng', 'giá trị tài sản thế chấp'." },
          questions: { type: "array", items: { type: "string" }, description: "Câu hỏi cụ thể, bằng tiếng Việt, để hỏi bổ sung thông tin." },
        },
        required: ["missingFields", "questions"],
        additionalProperties: false,
      },
    },
  },
];

const SYSTEM_PROMPT = `Bạn là trợ lý trích xuất dữ liệu cho hệ thống thẩm định tín dụng bán lẻ.
Nhiệm vụ: đọc yêu cầu thẩm định bằng ngôn ngữ tự nhiên do chuyên viên tín dụng nhập vào, và trích xuất đúng các trường dữ liệu có trong văn bản để điền vào hồ sơ khách hàng (RetailCase).

QUY TẮC BẮT BUỘC:
- Chỉ trích xuất thông tin THỰC SỰ CÓ trong văn bản. Không suy diễn, không ước tính, không dùng giá trị "hợp lý" thay cho dữ liệu thật.
- Nếu thiếu bất kỳ trường bắt buộc nào (thông tin cá nhân, nguồn thu nhập, khoản nợ hiện tại, khoản vay đề xuất, tài sản thế chấp, đồng thuận tra cứu dữ liệu), PHẢI gọi request_more_info thay vì đoán.
- Chỉ gọi submit_case khi đã có đủ toàn bộ trường bắt buộc từ chính văn bản người dùng cung cấp.
- Luôn gọi đúng một trong hai tool: submit_case hoặc request_more_info. Không trả lời bằng văn bản thuần.`;

export interface CaseExtractionSuccess {
  ok: true;
  retailCase: Omit<RetailCase, "caseId" | "customerId">;
}

export interface CaseExtractionNeedsInfo {
  ok: false;
  missingFields: string[];
  questions: string[];
}

export type CaseExtractionResult = CaseExtractionSuccess | CaseExtractionNeedsInfo;

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

/** Map common LLM output variants (including Vietnamese) to canonical enum values. */
const normalizeMaritalStatus = (raw: unknown): "single" | "married" | null => {
  const s = String(raw ?? "").toLowerCase().trim();
  if (["single", "độc thân", "cũ", "chưa kết hôn", "unmarried"].includes(s)) return "single";
  if (["married", "đã kết hôn", "kết hôn", "vợ/chồng", "có gia đình"].includes(s)) return "married";
  return null;
};

const validateExtractedCase = (value: unknown): Omit<RetailCase, "caseId" | "customerId"> => {
  if (!value || typeof value !== "object") throw new Error("Extracted case is not an object.");
  const raw = value as Record<string, unknown>;

  const demographic = raw.demographic as Record<string, unknown> | undefined;
  if (!demographic) throw new Error("Demographic object is missing.");
  if (!isNonEmptyString(demographic.name)) throw new Error(`Name is invalid: ${JSON.stringify(demographic.name)}`);
  if (typeof demographic.age !== "number") throw new Error(`Age is invalid (not a number): ${JSON.stringify(demographic.age)} (${typeof demographic.age})`);
  const maritalStatus = normalizeMaritalStatus(demographic.maritalStatus);
  if (!maritalStatus) throw new Error(`Marital status is invalid: received ${JSON.stringify(demographic.maritalStatus)} — expected one of: single, married, độc thân, đã kết hôn`);
  if (!isNonEmptyString(demographic.cccd)) throw new Error(`CCCD is invalid: ${JSON.stringify(demographic.cccd)}`);
  if (!isNonEmptyString(demographic.phone)) throw new Error(`Phone is invalid: ${JSON.stringify(demographic.phone)}`);
  if (!isNonEmptyString(demographic.email)) throw new Error(`Email is invalid: ${JSON.stringify(demographic.email)}`);

  if (!Array.isArray(raw.incomeSources) || raw.incomeSources.length === 0) {
    throw new Error("Extracted case has no income sources.");
  }
  const incomeSources = raw.incomeSources.map((entry, index) => {
    const income = entry as Record<string, unknown>;
    if (!INCOME_TYPES.has(String(income.type)) || typeof income.amount !== "number" || !isNonEmptyString(income.evidence)) {
      throw new Error(`Income source ${index} is invalid.`);
    }
    return { type: income.type as "salary" | "freelance" | "rental", amount: income.amount, evidence: income.evidence as string };
  });

  if (!Array.isArray(raw.currentDebts)) throw new Error("Extracted case is missing currentDebts array.");
  const currentDebts = raw.currentDebts.map((entry, index) => {
    const debt = entry as Record<string, unknown>;
    if (
      !DEBT_TYPES.has(String(debt.type)) ||
      typeof debt.monthlyOwed !== "number" ||
      typeof debt.outstandingAmount !== "number" ||
      !isNonEmptyString(debt.evidence)
    ) {
      throw new Error(`Debt entry ${index} is invalid.`);
    }
    return {
      type: debt.type as "auto" | "credit_card" | "other",
      monthlyOwed: debt.monthlyOwed,
      outstandingAmount: debt.outstandingAmount,
      limit: typeof debt.limit === "number" ? debt.limit : undefined,
      evidence: debt.evidence as string,
    };
  });

  const requestedLoan = raw.requestedLoan as Record<string, unknown> | undefined;
  if (
    !requestedLoan ||
    !LOAN_TYPES.has(String(requestedLoan.type)) ||
    typeof requestedLoan.amount !== "number" ||
    typeof requestedLoan.tenureYears !== "number"
  ) {
    throw new Error("Extracted case has invalid requestedLoan.");
  }

  let properties: Omit<RetailCase, "caseId" | "customerId">["properties"] = undefined;
  let primaryProperty: Omit<RetailCase, "caseId" | "customerId">["property"] | undefined = undefined;

  if (Array.isArray(raw.properties) && raw.properties.length > 0) {
    properties = raw.properties.map((entry, index) => {
      const p = entry as Record<string, unknown>;
      if (
        !p ||
        !PROPERTY_TYPES.has(String(p.type)) ||
        typeof p.value !== "number" ||
        !PROPERTY_STATUSES.has(String(p.status)) ||
        !isNonEmptyString(p.evidence)
      ) {
        throw new Error(`Property entry ${index} is invalid.`);
      }
      return {
        type: p.type as "apartment" | "land" | "house",
        value: p.value as number,
        status: p.status as "completed" | "future_project",
        projectCode: typeof p.projectCode === "string" ? p.projectCode : undefined,
        evidence: p.evidence as string
      };
    });
    primaryProperty = properties[0];
  } else {
    const p = raw.property as Record<string, unknown> | undefined;
    if (
      !p ||
      !PROPERTY_TYPES.has(String(p.type)) ||
      typeof p.value !== "number" ||
      !PROPERTY_STATUSES.has(String(p.status)) ||
      !isNonEmptyString(p.evidence)
    ) {
      throw new Error("Extracted case has invalid property data.");
    }
    primaryProperty = {
      type: p.type as "apartment" | "land" | "house",
      value: p.value as number,
      status: p.status as "completed" | "future_project",
      projectCode: typeof p.projectCode === "string" ? p.projectCode : undefined,
      evidence: p.evidence as string
    };
    properties = [primaryProperty];
  }

  const additionalContext = typeof raw.additionalContext === "string" ? raw.additionalContext.trim() : undefined;

  const consent = raw.consent as Record<string, unknown> | undefined;
  if (
    !consent ||
    typeof consent.credit_check !== "boolean" ||
    typeof consent.tax_income_check !== "boolean" ||
    typeof consent.social_insurance_check !== "boolean" ||
    typeof consent.marketing !== "boolean"
  ) {
    throw new Error("Extracted case has invalid consent data.");
  }

  if (!INSURANCE_PREFERENCES.has(String(raw.insurancePreference))) {
    throw new Error("Extracted case has invalid insurancePreference.");
  }

  const refinanceAutoLoan = raw.refinanceAutoLoan as Record<string, unknown> | undefined;
  if (requestedLoan.type === "refinance" && (
    !refinanceAutoLoan ||
    typeof refinanceAutoLoan.remainingPrincipal !== "number" ||
    typeof refinanceAutoLoan.monthlyPayment !== "number" ||
    refinanceAutoLoan.remainingPrincipal <= 0 ||
    refinanceAutoLoan.monthlyPayment <= 0
  )) {
    throw new Error("Extracted refinance case has invalid existing loan data.");
  }

  return {
    demographic: {
      name: demographic.name as string,
      age: demographic.age as number,
      maritalStatus: maritalStatus,
      cccd: demographic.cccd as string,
      phone: demographic.phone as string,
      email: demographic.email as string,
    },
    incomeSources,
    currentDebts,
    requestedLoan: {
      type: requestedLoan.type as "mortgage" | "refinance",
      amount: requestedLoan.amount as number,
      tenureYears: requestedLoan.tenureYears as number,
    },
    property: primaryProperty,
    properties,
    additionalContext,
    ...(refinanceAutoLoan ? { refinanceAutoLoan: {
      remainingPrincipal: refinanceAutoLoan.remainingPrincipal as number,
      monthlyPayment: refinanceAutoLoan.monthlyPayment as number,
    } } : {}),
    consent: {
      credit_check: consent.credit_check as boolean,
      tax_income_check: consent.tax_income_check as boolean,
      social_insurance_check: consent.social_insurance_check as boolean,
      marketing: consent.marketing as boolean,
    },
    insurancePreference: raw.insurancePreference as "accepted" | "declined",
  };
};

/**
 * Extracts a structured RetailCase from a free-text credit request. The model must ground every field in the user's own
 * text (system prompt forbids guessing) and validateExtractedCase re-checks the shape
 * server-side — the model's output is never trusted directly, same as legal-reasoning.
 */
const EXTRACTION_UNAVAILABLE_RESULT: CaseExtractionResult = {
  ok: false,
  missingFields: ["toàn bộ hồ sơ"],
  questions: [
    "Hệ thống trích xuất hồ sơ tạm thời không xử lý được yêu cầu này. Vui lòng cung cấp đầy đủ thông tin khách hàng, thu nhập, khoản vay đề xuất và tài sản thế chấp.",
  ],
};

/**
 * Every failure mode here (missing API key, network error, malformed tool-call JSON, a
 * shape the model produced that fails validateExtractedCase) must degrade to
 * NEEDS_MORE_INFO instead of an uncaught exception — an uncaught throw here surfaces as a
 * generic 500 to the credit officer, which is strictly worse than asking for more detail.
 */
export const extractCaseFromPrompt = async (prompt: string): Promise<CaseExtractionResult> => {
  try {
    // Structured requests from the production appraisal form are deterministic: validate
    // them directly instead of asking an LLM to re-extract amounts and enum values.
    if (prompt.trim().startsWith("{")) {
      try {
        const structured = JSON.parse(prompt) as Record<string, unknown>;
        if (structured.demographic && structured.requestedLoan) {
          return { ok: true, retailCase: validateExtractedCase(structured) };
        }
      } catch (err: any) {
        console.error("Structured case parsing/validation failed:", err);
        return {
          ok: false,
          missingFields: ["dữ liệu JSON hợp lệ"],
          questions: ["Dữ liệu hồ sơ dạng JSON không hợp lệ. Vui lòng kiểm tra dấu phẩy, dấu ngoặc và chuỗi giá trị trước khi gửi lại."],
        };
      }
    }

    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ];

    const response = await createAiCompletion("extraction", {
      messages,
      tools: TOOLS,
      tool_choice: "required",
    });

    const toolCall = response.choices[0].message.tool_calls?.[0];
    if (!toolCall || toolCall.type !== "function") {
      return {
        ok: false,
        missingFields: ["toàn bộ hồ sơ"],
        questions: ["Vui lòng cung cấp đầy đủ thông tin khách hàng, thu nhập, khoản vay đề xuất và tài sản thế chấp."],
      };
    }

    const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;

    if (toolCall.function.name === "request_more_info") {
      const missingFields = Array.isArray(args.missingFields) ? args.missingFields.filter(isNonEmptyString) : [];
      const questions = Array.isArray(args.questions) ? args.questions.filter(isNonEmptyString) : [];
      return {
        ok: false,
        missingFields: missingFields.length ? missingFields : ["thông tin còn thiếu"],
        questions: questions.length ? questions : ["Vui lòng bổ sung đầy đủ thông tin hồ sơ tín dụng."],
      };
    }

    if (toolCall.function.name === "submit_case") {
      return { ok: true, retailCase: validateExtractedCase(args.case) };
    }

    return EXTRACTION_UNAVAILABLE_RESULT;
  } catch (error) {
    console.error("Case extraction failed on fallback model as well, falling back to NEEDS_MORE_INFO:", error);
    return EXTRACTION_UNAVAILABLE_RESULT;
  }
};

const DRAFT_RETAIL_CASE_SCHEMA = {
  type: "object",
  properties: {
    demographic: {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number" },
        maritalStatus: { type: "string", enum: ["single", "married"] },
        cccd: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
      },
      additionalProperties: false,
    },
    incomeSources: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["salary", "freelance", "rental"] },
          amount: { type: "number" },
          evidence: { type: "string" },
        },
        additionalProperties: false,
      },
    },
    currentDebts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["auto", "credit_card", "other"] },
          monthlyOwed: { type: "number" },
          outstandingAmount: { type: "number" },
          limit: { type: ["number", "null"] },
          evidence: { type: "string" },
        },
        additionalProperties: false,
      },
    },
    requestedLoan: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["mortgage", "refinance"] },
        amount: { type: "number" },
        tenureYears: { type: "number" },
      },
      additionalProperties: false,
    },
    property: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["apartment", "land", "house"] },
        value: { type: "number" },
        status: { type: "string", enum: ["completed", "future_project"] },
        projectCode: { type: ["string", "null"] },
        evidence: { type: "string" },
      },
      additionalProperties: false,
    },
    consent: {
      type: "object",
      properties: {
        credit_check: { type: "boolean" },
        tax_income_check: { type: "boolean" },
        social_insurance_check: { type: "boolean" },
        marketing: { type: "boolean" },
      },
      additionalProperties: false,
    },
    insurancePreference: { type: "string", enum: ["accepted", "declined"] },
  },
  additionalProperties: false,
};

const DRAFT_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "extract_draft_case",
      description: "Trích xuất tối đa các thông tin khách hàng có sẵn trong văn bản để điền nháp vào form. Không tự bịa thông tin.",
      parameters: { type: "object", properties: { draftCase: DRAFT_RETAIL_CASE_SCHEMA }, required: ["draftCase"], additionalProperties: false },
    },
  },
];

const normalizeVietnameseText = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();

const parseVietnameseAmountVnd = (amount: string, unit: string | undefined): number | undefined => {
  const numeric = Number(amount.replace(",", "."));
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  const normalizedUnit = normalizeVietnameseText(unit ?? "vnd");
  if (["ty", "ti", "b"].includes(normalizedUnit)) return Math.round(numeric * 1_000_000_000);
  if (["trieu", "m"].includes(normalizedUnit)) return Math.round(numeric * 1_000_000);
  if (["nghin", "k"].includes(normalizedUnit)) return Math.round(numeric * 1_000);
  return Math.round(numeric);
};

const hasDraftData = (draft: Record<string, unknown>): boolean =>
  Object.values(draft).some(value => {
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === "object") {
      return Object.values(value as Record<string, unknown>).some(
        nested => nested !== undefined && nested !== null && nested !== ""
      );
    }
    return value !== undefined && value !== null && value !== "";
  });

const extractLocalDraftCaseFromPrompt = (prompt: string): Record<string, unknown> => {
  const normalized = normalizeVietnameseText(prompt);
  const draft: Record<string, unknown> = {};
  const demographic: Record<string, unknown> = {};
  const requestedLoan: Record<string, unknown> = {};
  const property: Record<string, unknown> = {};

  const nameMatch = prompt.trim().match(/^(?:chị|chi|anh|ông|ong|bà|ba|cô|co)\s+([\p{L}\s]{2,60}?)(?=\s+\d{2}\s*(?:tuổi|tuoi)|,)/iu);
  if (nameMatch?.[1]) demographic.name = nameMatch[1].trim();

  const ageMatch = normalized.match(/\b(\d{2})\s*tuoi\b/);
  if (ageMatch?.[1]) demographic.age = Number(ageMatch[1]);

  if (/\b(doc than|don than|me don than|bo don than|chua ket hon)\b/.test(normalized)) {
    demographic.maritalStatus = "single";
  } else if (/\b(da ket hon|co vo|co chong|vo chong|ket hon)\b/.test(normalized)) {
    demographic.maritalStatus = "married";
  }

  const phoneMatch = normalized.match(/\b((?:0|\+84)\d{9,10})\b/);
  if (phoneMatch?.[1]) demographic.phone = phoneMatch[1];

  const emailMatch = prompt.match(/[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+/);
  if (emailMatch?.[0]) demographic.email = emailMatch[0];

  const cccdMatch = normalized.match(/\b(?:cccd|cmnd|can cuoc)\D{0,12}(\d{9,12})\b/);
  if (cccdMatch?.[1]) demographic.cccd = cccdMatch[1];

  const loanMatch = normalized.match(/\b(?:vay|khoan vay|de nghi vay)\D{0,40}(\d+(?:[.,]\d+)?)\s*(ty|ti|trieu|nghin|k|vnd|dong)\b/);
  const loanAmount = loanMatch ? parseVietnameseAmountVnd(loanMatch[1], loanMatch[2]) : undefined;
  if (loanAmount) requestedLoan.amount = loanAmount;

  if (/\b(tai cap von|refinance)\b/.test(normalized)) {
    requestedLoan.type = "refinance";
  } else if (/\b(the chap|mua nha|mortgage)\b/.test(normalized)) {
    requestedLoan.type = "mortgage";
  }

  const tenureMatch = normalized.match(/\b(?:trong vong|thoi han|ky han)\D{0,16}(\d{1,2})\s*nam\b/);
  if (tenureMatch?.[1]) requestedLoan.tenureYears = Number(tenureMatch[1]);

  const propertyMatch = normalized.match(/\b(?:tai san|tsbd|the chap)\D{0,40}(\d+(?:[.,]\d+)?)\s*(ty|ti|trieu|nghin|k|vnd|dong)\b/);
  const propertyValue = propertyMatch ? parseVietnameseAmountVnd(propertyMatch[1], propertyMatch[2]) : undefined;
  if (propertyValue) {
    property.value = propertyValue;
    property.status = /\b(du an|hinh thanh trong tuong lai|future project)\b/.test(normalized) ? "future_project" : "completed";
    if (/\b(dat|dat nen)\b/.test(normalized)) property.type = "land";
    else if (/\b(nha|nha pho)\b/.test(normalized)) property.type = "house";
    else property.type = "apartment";
  }

  const projectCodeMatch = prompt.match(/\b(?:projectCode|mã dự án|ma du an)\s*[:#-]?\s*([A-Z0-9_-]{3,})\b/i);
  if (projectCodeMatch?.[1]) property.projectCode = projectCodeMatch[1];

  if (Object.keys(demographic).length > 0) draft.demographic = demographic;
  if (Object.keys(requestedLoan).length > 0) draft.requestedLoan = requestedLoan;
  if (Object.keys(property).length > 0) {
    draft.property = property;
    draft.properties = [property];
  }
  if (/\b(khong co no|khong no|0 khoan no|khong co khoan no)\b/.test(normalized)) draft.currentDebts = [];
  if (/\b(khong mua bao hiem|tu choi bao hiem|khong dang ky bao hiem)\b/.test(normalized)) draft.insurancePreference = "declined";
  if (/\b(tu nguyen bao hiem|co nhu cau bao hiem|dang ky bao hiem)\b/.test(normalized)) draft.insurancePreference = "accepted";

  return draft;
};

export const extractDraftCaseFromPrompt = async (prompt: string): Promise<Record<string, unknown>> => {
  try {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: "Bạn là trợ lý trích xuất thông tin hồ sơ tín dụng. Hãy đọc văn bản tự nhiên của người dùng và gọi tool extract_draft_case để trích xuất các trường thông tin có sẵn. Chỉ điền những trường thực sự xuất hiện trong văn bản, các trường khác để trống."
      },
      { role: "user", content: prompt },
    ];

    const response = await createAiCompletion("extraction", {
      messages,
      tools: DRAFT_TOOLS,
      tool_choice: { type: "function", function: { name: "extract_draft_case" } },
    });

    const toolCall = response.choices[0].message.tool_calls?.[0];
    if (toolCall && toolCall.type === "function" && toolCall.function.name === "extract_draft_case") {
      const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
      const draftCase = (args.draftCase as Record<string, unknown>) || {};
      return hasDraftData(draftCase) ? draftCase : extractLocalDraftCaseFromPrompt(prompt);
    }
    return extractLocalDraftCaseFromPrompt(prompt);
  } catch (error) {
    console.error("Draft extraction failed:", error);
    return extractLocalDraftCaseFromPrompt(prompt);
  }
};
