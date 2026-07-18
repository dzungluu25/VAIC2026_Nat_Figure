import { KhcnCaseFixture } from "../case-fixture.service";
import { calculateEmi, roundToNearest100k } from "../credit-calculator.service";
import { formatPercent } from "../retail-common";
import { CreditAnalysis } from "./rule-engine.types";
import {
  asNumber,
  asRecord,
  asRecordArray,
  asString,
  getCustomerId,
  getDoc,
  getFields,
  getRequestedLoan,
} from "./rule-engine-common";

export const DTI_CAP = 0.6;
export const LTV_CAP = 0.7;
export const STRESS_RATE = 0.135;

const STANDARD_MAX_HOME_LOAN_TERM_MONTHS = 360;
const MINIMUM_VIABLE_PROPOSAL_RATIO = 0.5;

const HAIRCUT_RATES: Record<string, number> = {
  SALARY_VIA_SHB: 0,
  SALARY_VIA_OTHER_BANK: 0.1,
  FREELANCE_UNVERIFIED: 0.5,
  FREELANCE_VERIFIED_BHXH: 0.2,
  RENTAL_WITH_CONTRACT: 0.3,
  RENTAL_NO_CONTRACT: 1,
};

const roundDownToNearest50m = (value: number) => Math.floor(value / 50000000) * 50000000;

const principalForEmi = (emi: number, annualRate: number, termMonths: number) => {
  const monthlyRate = annualRate / 12;
  const factor = Math.pow(1 + monthlyRate, termMonths);
  return (emi * (factor - 1)) / (monthlyRate * factor);
};

const getBorrowerAge = (fixture: KhcnCaseFixture) => {
  const borrower = asRecord(getFields(fixture, "loan_application_parsed.json").borrower);
  const directAge = asNumber(borrower.age, 0);
  if (directAge > 0) {
    return directAge;
  }

  const customerId = getCustomerId(fixture);
  const customers = asRecordArray(fixture.core.customer360.customers);
  const customer = customers.find((item) => asString(item.customer_id, "") === customerId);
  return asNumber(asRecord(customer).age, 34);
};

const calculateIncome = (fixture: KhcnCaseFixture) => {
  const incomeFields = getFields(fixture, "income_documents_parsed.json");
  const sources = asRecordArray(incomeFields.income_sources);
  const breakdown = sources.map((source) => {
    const sourceType = asString(source.source_type, "UNKNOWN");
    const declared = asNumber(source.declared_monthly, 0);
    const haircutRate = HAIRCUT_RATES[sourceType] ?? 1;
    return {
      source: sourceType,
      declared,
      haircutRate,
      qualified: Math.round(declared * (1 - haircutRate)),
    };
  });

  const qualifiedIncome = breakdown.reduce((sum, item) => sum + asNumber(item.qualified, 0), 0);
  const derivedIncome = asNumber(
    asRecord(asRecord(getDoc(fixture, "income_documents_parsed.json").derived_inputs_for_tools).qualified_income_monthly).value,
    0
  );

  return {
    qualifiedIncome: qualifiedIncome || derivedIncome,
    breakdown,
  };
};

export const runCreditRuleEngine = (fixture: KhcnCaseFixture): CreditAnalysis => {
  const { qualifiedIncome, breakdown } = calculateIncome(fixture);
  const requestedLoan = getRequestedLoan(fixture);
  const refinance = asRecord(fixture.caseInput.refinance_request);
  const property = asRecord(getFields(fixture, "property_documents_parsed.json").property);
  const debtFields = getFields(fixture, "debt_documents_parsed.json");
  const autoLoan = asRecord(debtFields.auto_loan_other_bank);
  const creditCard = asRecord(debtFields.credit_card_other_bank);
  const borrowerAge = getBorrowerAge(fixture);

  const requestedAmount = asNumber(requestedLoan.amount, 0);
  const requestedTermMonths = asNumber(requestedLoan.term_months, 0);
  const propertyValue = asNumber(
    property.value_used_for_ltv,
    Math.min(asNumber(property.contract_price, requestedAmount), asNumber(property.appraised_value, requestedAmount))
  );
  const currentAutoOutstanding = asNumber(refinance.external_auto_loan_outstanding, asNumber(autoLoan.outstanding, 0));
  const currentAutoRate = asNumber(refinance.current_rate, asNumber(autoLoan.annual_rate, 0.115));
  const autoTermMonths = asNumber(refinance.remaining_term_months, asNumber(autoLoan.remaining_term_months, 36));
  const refinancedAutoRate = asNumber(refinance.target_shb_rate, 0.095);
  const cardLimit = asNumber(creditCard.limit, 0);

  const currentAutoEmi = currentAutoOutstanding > 0 ? calculateEmi(currentAutoOutstanding, currentAutoRate, autoTermMonths) : 0;
  const refinancedAutoEmi =
    currentAutoOutstanding > 0 ? calculateEmi(currentAutoOutstanding, refinancedAutoRate, autoTermMonths) : 0;
  const currentCardObligation = roundToNearest100k(cardLimit * 0.05);
  const restructuredCardObligation = roundToNearest100k(currentCardObligation * 0.5);
  const requestedHomeEmiStress = calculateEmi(requestedAmount, STRESS_RATE, requestedTermMonths);
  const requestedDti = qualifiedIncome > 0 ? (requestedHomeEmiStress + currentAutoEmi + currentCardObligation) / qualifiedIncome : 1;
  const requestedLtv = propertyValue > 0 ? requestedAmount / propertyValue : 1;
  const maxTermAllowedByAge = Math.max(12, Math.floor((65 - borrowerAge) * 12));
  const proposedTermMonths = Math.min(STANDARD_MAX_HOME_LOAN_TERM_MONTHS, maxTermAllowedByAge);
  const ltvCapAmount = roundDownToNearest50m(propertyValue * LTV_CAP);
  const maxHomeEmiAtCap = Math.max(0, DTI_CAP * qualifiedIncome - refinancedAutoEmi - restructuredCardObligation);
  const affordableHomeLoanAmount = roundDownToNearest50m(principalForEmi(maxHomeEmiAtCap, STRESS_RATE, proposedTermMonths));
  const proposedAmount = Math.max(0, Math.min(requestedAmount, ltvCapAmount, affordableHomeLoanAmount));
  const restructuredHomeEmiPromo = calculateEmi(proposedAmount, asNumber(requestedLoan.requested_promotional_rate, 0.075), proposedTermMonths);
  const restructuredHomeEmiFloating = calculateEmi(
    proposedAmount,
    asNumber(requestedLoan.floating_rate_after_promo_customer_expected, 0.115),
    proposedTermMonths
  );
  const restructuredHomeEmiStress = calculateEmi(proposedAmount, STRESS_RATE, proposedTermMonths);
  const stressTotal = restructuredHomeEmiStress + refinancedAutoEmi + restructuredCardObligation;
  const stressDti = qualifiedIncome > 0 ? stressTotal / qualifiedIncome : 1;
  const ltv = propertyValue > 0 ? proposedAmount / propertyValue : 1;
  const ageAtMaturity = borrowerAge + proposedTermMonths / 12;
  const minimumViableProposal = roundDownToNearest50m(requestedAmount * MINIMUM_VIABLE_PROPOSAL_RATIO);

  return {
    qualifiedIncome,
    breakdown,
    currentAutoEmi,
    refinancedAutoEmi,
    currentCardObligation,
    restructuredCardObligation,
    requestedAmount,
    requestedTermMonths,
    proposedAmount,
    proposedTermMonths,
    affordableHomeLoanAmount,
    propertyValue,
    requestedHomeEmiStress,
    requestedDti,
    requestedDtiDisplay: formatPercent(requestedDti),
    requestedLtv,
    requestedLtvDisplay: formatPercent(requestedLtv),
    restructuredHomeEmiPromo,
    restructuredHomeEmiFloating,
    restructuredHomeEmiStress,
    stressDti,
    stressDtiDisplay: formatPercent(stressDti),
    ltv,
    ltvDisplay: formatPercent(ltv),
    proposalPasses:
      proposedAmount >= minimumViableProposal &&
      stressDti <= DTI_CAP &&
      ltv <= LTV_CAP &&
      ageAtMaturity <= 65 &&
      proposedAmount > 0,
    ageAtMaturity,
    leversApplied: ["REFINANCE_EXTERNAL_DEBT", "REDUCE_CARD_LIMIT", "EXTEND_TERM", "REDUCE_LOAN_AMOUNT"],
  };
};
