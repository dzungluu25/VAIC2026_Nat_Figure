import { routingCatalog } from "../../config/policy";
import { SecurityScreeningResult } from "../../types/platform.types";
import { maskPiiText } from "./pii-masking.service";

const normalizeSecurityText = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Detects actionable instruction-override phrases, not discussion of the security topic.
 * Generic words such as "prompt injection", "hacker" or "tấn công" are deliberately
 * excluded: documentation and architecture questions commonly contain those words.
 */
export const detectPromptInjection = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const normalized = normalizeSecurityText(value);
  return routingCatalog.injectionSignals.find(signal => normalized.includes(normalizeSecurityText(signal)));
};

const PII_PATTERNS = [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, /\b0[35789]\d{8}\b/, /\b\d{12}\b/];

/** Fail-closed screening contract used before intent classification, retrieval or model calls. */
export const screenSecurityInput = (
  input: string,
  accessScopeValid = true
): SecurityScreeningResult => {
  const injection = detectPromptInjection(input);
  const containsPii = PII_PATTERNS.some(pattern => pattern.test(input));
  const sanitizedInput = maskPiiText(input);
  if (injection) return { status: "rejected", sanitizedInput, signals: [`PROMPT_INJECTION:${injection}`], containsPii };
  if (!accessScopeValid) return { status: "requires_manual_review", sanitizedInput, signals: ["ACCESS_SCOPE_UNVERIFIED"], containsPii };
  if (containsPii) return { status: "sanitized", sanitizedInput, signals: ["PII_MASKED"], containsPii };
  return { status: "accepted", sanitizedInput: input, signals: [], containsPii: false };
};
