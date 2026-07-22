import type { RetailCase } from "@/types/case.types";

/**
 * Deterministic rule-engine fixtures. These are not the demo case catalog —
 * real cases come from case-extraction.service.ts. Each fixture isolates one
 * branch of the credit decision surface.
 */

/** Clean file: small ticket, completed collateral, no debts, single, salaried. */
export const fastCaseFixture: RetailCase = {
  caseId: "test-fast-clean",
  customerId: "test-cust-1",
  demographic: { name: "Test Fast", age: 30, maritalStatus: "single", cccd: "000000000001", phone: "0900000001", email: "fast@test.local" },
  incomeSources: [{ type: "salary", amount: 40_000_000, evidence: "bank-statement" }],
  currentDebts: [],
  requestedLoan: { type: "mortgage", amount: 500_000_000, tenureYears: 15 },
  property: { type: "apartment", value: 1_000_000_000, status: "completed", evidence: "title-deed" },
  consent: { credit_check: true, tax_income_check: true, social_insurance_check: true, marketing: false },
  insurancePreference: "declined",
};

/** Off-plan collateral, mixed income, existing debts, married — must never auto-approve. */
export const complexCaseFixture: RetailCase = {
  caseId: "test-complex-main",
  customerId: "test-cust-2",
  demographic: { name: "Test Complex", age: 45, maritalStatus: "married", cccd: "000000000002", phone: "0900000002", email: "complex@test.local" },
  incomeSources: [
    { type: "salary", amount: 60_000_000, evidence: "bank-statement" },
    { type: "freelance", amount: 20_000_000, evidence: "service-contract" },
    { type: "rental", amount: 15_000_000, evidence: "lease-agreement" },
  ],
  currentDebts: [
    { type: "auto", monthlyOwed: 8_000_000, outstandingAmount: 300_000_000, evidence: "loan-contract" },
    { type: "credit_card", monthlyOwed: 2_500_000, outstandingAmount: 50_000_000, limit: 100_000_000, evidence: "cc-statement" },
  ],
  requestedLoan: { type: "mortgage", amount: 2_000_000_000, tenureYears: 20 },
  property: { type: "apartment", value: 2_800_000_000, status: "future_project", projectCode: "TEST-PROJECT-1", evidence: "sale-contract" },
  consent: { credit_check: true, tax_income_check: true, social_insurance_check: true, marketing: false },
  insurancePreference: "declined",
};

/** Unaffordable even after the restructure search. */
export const dtiFailCaseFixture: RetailCase = {
  caseId: "test-dti-fail",
  customerId: "test-cust-3",
  demographic: { name: "Test DTI Fail", age: 50, maritalStatus: "single", cccd: "000000000003", phone: "0900000003", email: "dtifail@test.local" },
  incomeSources: [{ type: "salary", amount: 15_000_000, evidence: "bank-statement" }],
  currentDebts: [{ type: "credit_card", monthlyOwed: 8_000_000, outstandingAmount: 150_000_000, limit: 150_000_000, evidence: "cc-statement" }],
  requestedLoan: { type: "mortgage", amount: 1_500_000_000, tenureYears: 20 },
  property: { type: "apartment", value: 1_800_000_000, status: "completed", evidence: "title-deed" },
  consent: { credit_check: true, tax_income_check: true, social_insurance_check: true, marketing: false },
  insurancePreference: "declined",
};

/** Well-formed case used by the persistence/integrity suite. */
export const persistableCaseFixture: RetailCase = {
  caseId: "case-test",
  customerId: "customer-test",
  demographic: { name: "Nguyen Van A", age: 35, maritalStatus: "single", cccd: "012345678901", phone: "0900000000", email: "customer@example.com" },
  incomeSources: [{ type: "salary", amount: 50_000_000, evidence: "payroll" }],
  currentDebts: [],
  requestedLoan: { type: "mortgage", amount: 1_000_000_000, tenureYears: 20 },
  property: { type: "apartment", value: 1_800_000_000, status: "completed", evidence: "valuation" },
  consent: { credit_check: true, tax_income_check: true, social_insurance_check: true, marketing: false },
  insurancePreference: "declined",
};
