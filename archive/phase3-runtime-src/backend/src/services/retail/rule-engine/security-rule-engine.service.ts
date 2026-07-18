import { KhcnCaseFixture } from "../case-fixture.service";
import { PromptInjectionScan } from "./rule-engine.types";
import { collectStrings } from "./rule-engine-common";

const PROMPT_INJECTION_PATTERNS = [
  {
    label: "ignore (all )?(previous |prior )?(legal |compliance )?(check|instruction|rule)",
    regex: /ignore\s+(all\s+)?(previous\s+|prior\s+)?(legal\s+|compliance\s+)?(check|instruction|rule)/i,
  },
  {
    label: "approve (this )?(loan|facility) (immediately|without)",
    regex: /approve\s+(this\s+)?(loan|facility)\s+(immediately|without)/i,
  },
  {
    label: "in ra (so )?(CCCD|can cuoc|tai khoan)",
    regex: /in ra\s+.*(CCCD|can cuoc|tai khoan|t[aà]i kho[aả]n)/i,
  },
  { label: "system prompt", regex: /system prompt/i },
  { label: "you are now", regex: /you are now/i },
];

export const runPromptInjectionGuard = (fixture: KhcnCaseFixture): PromptInjectionScan => {
  const strings: Array<{ path: string; text: string }> = [];
  Object.entries(fixture.parsedDocs).forEach(([fileName, doc]) => collectStrings(doc, `/parsed_docs/${fileName}`, strings));

  const matchedPatterns = new Set<string>();
  const locations = new Set<string>();

  for (const item of strings) {
    for (const pattern of PROMPT_INJECTION_PATTERNS) {
      if (pattern.regex.test(item.text)) {
        matchedPatterns.add(pattern.label);
        locations.add(item.path);
      }
    }
  }

  return {
    detected: matchedPatterns.size > 0,
    matchedPatterns: [...matchedPatterns],
    locations: [...locations],
  };
};
