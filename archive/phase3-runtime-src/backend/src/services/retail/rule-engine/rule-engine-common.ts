import { JsonRecord, KhcnCaseFixture } from "../case-fixture.service";

export const asRecord = (value: unknown): JsonRecord => (value && typeof value === "object" ? (value as JsonRecord) : {});

export const asRecordArray = (value: unknown): JsonRecord[] =>
  Array.isArray(value) ? value.filter((item): item is JsonRecord => Boolean(item && typeof item === "object")) : [];

export const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export const asString = (value: unknown, fallback: string) => (typeof value === "string" ? value : fallback);

export const asNumber = (value: unknown, fallback: number) => (typeof value === "number" ? value : fallback);

export const asBoolean = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);

export const getDoc = (fixture: KhcnCaseFixture, fileName: string): JsonRecord => asRecord(fixture.parsedDocs[fileName]);

export const getFields = (fixture: KhcnCaseFixture, fileName: string): JsonRecord => asRecord(getDoc(fixture, fileName).fields);

export const getRequestedLoan = (fixture: KhcnCaseFixture): JsonRecord => {
  const homeLoan = asRecord(fixture.caseInput.requested_home_loan);
  return Object.keys(homeLoan).length > 0 ? homeLoan : asRecord(fixture.caseInput.requested_loan);
};

export const getCustomerId = (fixture: KhcnCaseFixture) => {
  const loanAppBorrower = asRecord(getFields(fixture, "loan_application_parsed.json").borrower);
  return asString(fixture.caseInput.customer_id, asString(loanAppBorrower.customer_id, ""));
};

export const hasConsentScope = (fixture: KhcnCaseFixture, scope: string) => {
  const customerId = getCustomerId(fixture);
  const records = asRecordArray(fixture.core.consentRegistry.records);
  const record = records.find((item) => asString(item.customer_id, "") === customerId) ?? records[0];
  return asStringArray(asRecord(record).granted_scopes).includes(scope);
};

export const collectStrings = (value: unknown, path: string, output: Array<{ path: string; text: string }>) => {
  if (typeof value === "string") {
    output.push({ path, text: value });
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${path}/${index}`, output));
    return;
  }

  if (value && typeof value === "object") {
    Object.entries(value as JsonRecord).forEach(([key, nested]) => collectStrings(nested, `${path}/${key}`, output));
  }
};
