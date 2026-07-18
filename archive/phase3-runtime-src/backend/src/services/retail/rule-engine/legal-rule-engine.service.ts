import { KhcnCaseFixture } from "../case-fixture.service";
import { LegalFinding } from "./rule-engine.types";
import { asBoolean, asNumber, asRecord, asStringArray, getFields, hasConsentScope } from "./rule-engine-common";

export const runLegalRuleEngine = (fixture: KhcnCaseFixture): LegalFinding[] => {
  const findings: LegalFinding[] = [];
  const pricingOffer = asRecord(getFields(fixture, "pricing_offer_parsed.json").initial_offer);
  const inputsUsed = asStringArray(pricingOffer.inputs_used);
  const rateWithInsurance = asNumber(pricingOffer.rate_if_insurance_purchased, Number.NaN);
  const rateWithoutInsurance = asNumber(pricingOffer.rate_if_insurance_declined, Number.NaN);
  const insuranceTyingDetected =
    inputsUsed.includes("insurance_purchase") ||
    (Number.isFinite(rateWithInsurance) && Number.isFinite(rateWithoutInsurance) && rateWithInsurance !== rateWithoutInsurance);

  if (insuranceTyingDetected) {
    findings.push({
      ruleId: "TCTD-INSURANCE-TYING-001",
      status: "VIOLATION",
      severity: "BLOCKER",
      blocksAt: "APPROVAL",
      text: "Pricing must be independent from optional insurance purchase.",
      calculation: {
        tyingDetected: true,
        rateIfInsurancePurchased: rateWithInsurance,
        rateIfInsuranceDeclined: rateWithoutInsurance,
        inputsUsed,
      },
    });
  }

  const property = asRecord(getFields(fixture, "property_documents_parsed.json").property);
  if (
    asBoolean(property.acquired_during_marriage, false) &&
    !asBoolean(property.separate_property_evidence, false) &&
    !asBoolean(property.spouse_signature_present, false)
  ) {
    findings.push({
      ruleId: "MARITAL-COMMON-PROPERTY-001",
      status: "PASS_WITH_CONDITION",
      severity: "CONDITION",
      blocksAt: "CONTRACT_SIGNING",
      text: "Collect spouse consent or valid separate-property evidence before contract signing.",
      calculation: { requiresSpouseConsent: true },
    });
  }

  const projectDocs = asRecord(getFields(fixture, "property_documents_parsed.json").project_documents);
  const missingProjectDocuments = [
    !asBoolean(projectDocs.bank_guarantee_certificate_present, false) ? "bank_guarantee_certificate" : undefined,
    !asBoolean(projectDocs.lien_release_for_unit_present, false) ? "lien_release_for_unit" : undefined,
  ].filter((item): item is string => Boolean(item));

  if (asBoolean(property.is_future_property, false) && missingProjectDocuments.length > 0) {
    findings.push({
      ruleId: "FUTURE-HOUSING-GUARANTEE-001",
      status: "PASS_WITH_CONDITION",
      severity: "CONDITION",
      blocksAt: "DISBURSEMENT",
      text: "Collect missing future-housing project documents before disbursement.",
      calculation: { projectEligible: false, missingProjectDocuments },
    });
  }

  if (!hasConsentScope(fixture, "INCOME_VERIFICATION_BHXH")) {
    findings.push({
      ruleId: "PDPD-CONSENT-001",
      status: "CONSENT_REQUIRED",
      severity: "BLOCKER",
      blocksAt: "EXTERNAL_DATA_CALL",
      text: "External income verification is blocked until INCOME_VERIFICATION_BHXH consent exists.",
      calculation: {
        scopeRequested: "INCOME_VERIFICATION_BHXH",
        consentValid: false,
        outboundCallsMade: 0,
      },
    });
  }

  return findings;
};
