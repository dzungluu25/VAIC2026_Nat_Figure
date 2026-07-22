import { describe, expect, it } from "vitest";
import { roleCan } from "@/config/authorization";

describe("role/action authorization matrix", () => {
  it.each([
    ["CUSTOMER", "DOSSIER_VIEW", true],
    ["CUSTOMER", "CIC_UPLOAD", false],
    ["CREDIT_OFFICER", "CIC_UPLOAD", true],
    ["CREDIT_OFFICER", "DOSSIER_REASSIGN", false],
    ["CREDIT_APPROVER", "DOSSIER_REASSIGN", true],
    ["ADMIN", "CHECKLIST_MANAGE", true],
    ["ADMIN", "REVIEW_DECIDE", false],
    ["AUDITOR", "DOSSIER_VIEW", true],
    ["AUDITOR", "DOCUMENT_UPLOAD", false],
  ] as const)("%s may %s → %s", (role, action, allowed) => {
    expect(roleCan(role, action)).toBe(allowed);
  });
});
