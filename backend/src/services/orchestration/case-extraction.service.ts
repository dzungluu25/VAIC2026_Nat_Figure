import { createAiCompletion } from "../../config/ai-model-router";
import { RetailCase } from "../../types/case.types";
import { ChatCompletionTool, ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { createLogger } from "../observability/logger";

const logger = createLogger("orchestration.case-extraction");

const INCOME_TYPES = new Set(["salary", "freelance", "rental"]);
const DEBT_TYPES = new Set(["auto", "credit_card", "other"]);
const LOAN_TYPES = new Set(["mortgage", "refinance"]);
const PROPERTY_TYPES = new Set(["apartment", "land", "house"]);
const PROPERTY_STATUSES = new Set(["completed", "future_project"]);
const MARITAL_STATUSES = new Set(["single", "married"]);
const INSURANCE_PREFERENCES = new Set(["accepted", "declined"]);

const DEMOGRAPHIC_CONSENT_SCHEMA = {
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
  required: ["demographic", "consent", "insurancePreference"],
  additionalProperties: false,
};

const FINANCIALS_SCHEMA = {
  type: "object",
  properties: {
    incomeSources: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["salary", "freelance", "rental"] },
          amount: { type: "number" },
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
  },
  required: ["incomeSources", "currentDebts"],
  additionalProperties: false,
};

const LOAN_PROPERTY_SCHEMA = {
  type: "object",
  properties: {
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
    refinanceAutoLoan: {
      type: "object",
      properties: {
        remainingPrincipal: { type: "number" },
        monthlyPayment: { type: "number" },
      },
      required: ["remainingPrincipal", "monthlyPayment"],
      additionalProperties: false,
    },
  },
  required: ["requestedLoan", "property"],
  additionalProperties: false,
};

const FULL_CASE_SCHEMA = {
  type: "object",
  properties: {
    demographic: DEMOGRAPHIC_CONSENT_SCHEMA.properties.demographic,
    consent: DEMOGRAPHIC_CONSENT_SCHEMA.properties.consent,
    insurancePreference: DEMOGRAPHIC_CONSENT_SCHEMA.properties.insurancePreference,
    incomeSources: FINANCIALS_SCHEMA.properties.incomeSources,
    currentDebts: FINANCIALS_SCHEMA.properties.currentDebts,
    requestedLoan: LOAN_PROPERTY_SCHEMA.properties.requestedLoan,
    property: LOAN_PROPERTY_SCHEMA.properties.property,
    refinanceAutoLoan: LOAN_PROPERTY_SCHEMA.properties.refinanceAutoLoan,
  },
  required: [
    "demographic",
    "consent",
    "insurancePreference",
    "incomeSources",
    "currentDebts",
    "requestedLoan",
    "property"
  ],
  additionalProperties: false,
};

const FULL_CASE_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "submit_full_case",
      description: "Gửi hồ sơ đầy đủ bao gồm thông tin cá nhân, đồng thuận, thu nhập, dư nợ hiện tại, khoản vay đề xuất và tài sản bảo đảm.",
      parameters: { type: "object", properties: { data: FULL_CASE_SCHEMA }, required: ["data"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "request_more_info",
      description: "Yêu cầu cung cấp thêm thông tin nếu thiếu bất kỳ thông tin bắt buộc nào (như thông tin cá nhân, đồng thuận, thu nhập, khoản vay đề xuất, tài sản bảo đảm).",
      parameters: {
        type: "object",
        properties: {
          missingFields: { type: "array", items: { type: "string" } },
          questions: { type: "array", items: { type: "string" } },
        },
        required: ["missingFields", "questions"],
        additionalProperties: false,
      },
    },
  },
];

const SYSTEM_PROMPT_FULL_CASE = `Bạn là trợ lý trích xuất hồ sơ tín dụng bán lẻ của SHB.
Nhiệm vụ của bạn: Đọc yêu cầu thẩm định tín dụng và trích xuất đầy đủ các thông tin:
1. Demographic (name, age, maritalStatus, cccd, phone, email) và Consent (credit_check, tax_income_check, social_insurance_check, marketing) và insurancePreference.
2. Financials (incomeSources và currentDebts). Nếu khách hàng khai báo không có nợ thì currentDebts là danh sách rỗng [].
3. Loan & Property (requestedLoan, property và refinanceAutoLoan nếu có).

QUY TẮC BẮT BUỘC:
- Chỉ trích xuất thông tin thực sự có trong văn bản. Không tự đoán, không tự điền.
- Nếu thiếu bất kỳ thông tin bắt buộc nào (như thông tin cá nhân, đồng thuận, thu nhập, hoặc khoản vay/tài sản), phải gọi tool request_more_info để hỏi lại.
- Nếu đủ thông tin, gọi submit_full_case. Luôn gọi một trong hai tool.`;

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
  const primaryProperty = {
    type: p.type as "apartment" | "land" | "house",
    value: p.value as number,
    status: p.status as "completed" | "future_project",
    projectCode: typeof p.projectCode === "string" ? p.projectCode : undefined,
    evidence: p.evidence as string
  };

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
    properties: [primaryProperty],
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

const EXTRACTION_UNAVAILABLE_RESULT: CaseExtractionResult = {
  ok: false,
  missingFields: ["toàn bộ hồ sơ"],
  questions: [
    "Hệ thống trích xuất hồ sơ tạm thời không xử lý được yêu cầu này. Vui lòng cung cấp đầy đủ thông tin khách hàng, thu nhập, khoản vay đề xuất và tài sản thế chấp.",
  ],
};

export const extractCaseFromPrompt = async (prompt: string): Promise<CaseExtractionResult> => {
  try {
    if (prompt.trim().startsWith("{")) {
      try {
        const structured = JSON.parse(prompt) as Record<string, unknown>;
        if (structured.demographic && structured.requestedLoan) {
          return { ok: true, retailCase: validateExtractedCase(structured) };
        }
      } catch (err: any) {
        logger.error("Structured case parsing/validation failed", { error: err });
        return {
          ok: false,
          missingFields: ["dữ liệu JSON hợp lệ"],
          questions: ["Dữ liệu hồ sơ dạng JSON không hợp lệ. Vui lòng kiểm tra dấu phẩy, dấu ngoặc và chuỗi giá trị trước khi gửi lại."],
        };
      }
    }

    const response = await createAiCompletion("extraction", {
      messages: [
        { role: "system", content: SYSTEM_PROMPT_FULL_CASE },
        { role: "user", content: prompt },
      ],
      tools: FULL_CASE_TOOLS,
      tool_choice: "auto",
    });

    const toolCall = response.choices[0].message.tool_calls?.[0];
    if (!toolCall || toolCall.type !== "function") {
      return EXTRACTION_UNAVAILABLE_RESULT;
    }

    const args = JSON.parse(toolCall.function.arguments);
    if (toolCall.function.name === "request_more_info") {
      return {
        ok: false,
        missingFields: args.missingFields || ["thông tin còn thiếu"],
        questions: args.questions || ["Vui lòng cung cấp đầy đủ hồ sơ tín dụng."],
      };
    }

    if (toolCall.function.name === "submit_full_case") {
      return { ok: true, retailCase: validateExtractedCase(args.data) };
    }

    return EXTRACTION_UNAVAILABLE_RESULT;
  } catch (error) {
    logger.error("Case extraction failed, falling back to NEEDS_MORE_INFO", { error });
    return EXTRACTION_UNAVAILABLE_RESULT;
  }
};

const DRAFT_DEMOGRAPHIC_SCHEMA = {
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
    insurancePreference: { type: "string", enum: ["accepted", "declined"] },
  },
  additionalProperties: false,
};

const DRAFT_FINANCIALS_SCHEMA = {
  type: "object",
  properties: {
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
  },
  additionalProperties: false,
};

const DRAFT_LOAN_PROPERTY_SCHEMA = {
  type: "object",
  properties: {
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
  },
  additionalProperties: false,
};

const DRAFT_CASE_SCHEMA = {
  type: "object",
  properties: {
    demographic: DRAFT_DEMOGRAPHIC_SCHEMA.properties.demographic,
    consent: DEMOGRAPHIC_CONSENT_SCHEMA.properties.consent,
    insurancePreference: DRAFT_DEMOGRAPHIC_SCHEMA.properties.insurancePreference,
    incomeSources: DRAFT_FINANCIALS_SCHEMA.properties.incomeSources,
    currentDebts: DRAFT_FINANCIALS_SCHEMA.properties.currentDebts,
    requestedLoan: DRAFT_LOAN_PROPERTY_SCHEMA.properties.requestedLoan,
    property: DRAFT_LOAN_PROPERTY_SCHEMA.properties.property,
  },
  additionalProperties: false,
};

const DRAFT_CASE_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "extract_draft_case",
      description: "Trích xuất các thông tin nháp có sẵn trong văn bản. Không tự bịa.",
      parameters: { type: "object", properties: { draft: DRAFT_CASE_SCHEMA }, required: ["draft"], additionalProperties: false },
    },
  },
];

const SYSTEM_PROMPT_DRAFT_CASE = "Bạn là trợ lý trích xuất nháp thông tin hồ sơ tín dụng. Hãy trích xuất các trường thông tin có sẵn trong văn bản bằng cách gọi tool extract_draft_case. Không được tự bịa.";

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
    const res = await createAiCompletion("draft-extraction", {
      messages: [
        { role: "system", content: SYSTEM_PROMPT_DRAFT_CASE },
        { role: "user", content: prompt },
      ],
      tools: DRAFT_CASE_TOOLS,
      tool_choice: { type: "function", function: { name: "extract_draft_case" } },
    });

    const toolCall = res.choices[0].message.tool_calls?.[0];
    if (toolCall && toolCall.type === "function" && toolCall.function.name === "extract_draft_case") {
      const args = JSON.parse(toolCall.function.arguments);
      const draftCase = args.draft || {};

      if (hasDraftData(draftCase)) {
        if (draftCase.property && (!draftCase.properties || draftCase.properties.length === 0)) {
          draftCase.properties = [draftCase.property];
        }
        return draftCase;
      }
    }
    return extractLocalDraftCaseFromPrompt(prompt);
  } catch (error) {
    logger.error("Draft extraction failed, falling back to local extractor", { error });
    return extractLocalDraftCaseFromPrompt(prompt);
  }
};
