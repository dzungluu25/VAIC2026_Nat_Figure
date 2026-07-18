import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  approveRetailCaseRun,
  buildApprovalIntent,
  getRetailCaseRun,
  listDemoCases,
  runDemoCase,
} from "../services/orchestration/retail-case.service";
import { evaluateKhcnCases } from "../services/retail/evaluation.service";
import { buildRetailGovernanceReport, getModelGatewayStatus } from "../services/retail/model-gateway.service";
import { getProductionReadinessReport } from "../services/retail/production-readiness.service";
import { buildAgentNetworkReport } from "../services/retail/agent-network.service";
import { clearRetailRunRepositoryCache } from "../services/retail/retail-run.repository";
import { clearKhcnFixtureCache, findKhcnCaseFixture, loadKhcnCaseFixtures } from "../services/retail/case-fixture.service";
import { runCreditRuleEngine } from "../services/retail/rule-engine/credit-rule-engine.service";
import { runGateRuleEngine } from "../services/retail/rule-engine/gate-rule-engine.service";
import { runLegalRuleEngine } from "../services/retail/rule-engine/legal-rule-engine.service";
import { maskPiiForModel } from "../services/security/pii-masker.service";
import { createApprovalJwt, requireApprovalAuth } from "../middlewares/auth.middleware";
import { queryCreditPolicies } from "../services/rag/credit-rag.service";
import { queryKhcnRuleEvidence } from "../services/rag/khcn-rule-evidence.service";
import { queryLegalRequirements } from "../services/rag/legal-rag.service";
import { getDocumentIngestionStatus, ingestDocument } from "../services/ingestion/document-ingestion.service";
import { getWorkflowQueueStatus } from "../services/workflow/workflow-queue.service";

const fileExists = async (filePath: string) => {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const requireRun = async (caseId: string) => {
  const run = await runDemoCase(caseId);
  assert.ok(run, `${caseId} should produce a run`);
  return run;
};

test("KHCN runtime loads all cases from fixture inputs", async () => {
  const cases = await listDemoCases();
  assert.equal(cases.length, 8);
  assert.deepEqual(
    cases.map((item) => item.caseId),
    [
      "case_01_complex_main",
      "case_02_fast_clean",
      "case_03_insurance_tying_only",
      "case_04_marital_missing_spouse",
      "case_05_project_missing_guarantee",
      "case_06_missing_consent",
      "case_07_dti_fail",
      "case_08_prompt_injection_doc",
    ]
  );
});

test("KHCN fixture cache returns defensive runtime copies", async () => {
  clearKhcnFixtureCache();
  const first = await loadKhcnCaseFixtures();
  assert.equal(first.length, 8);
  first[0].title = "MUTATED TEST TITLE";
  first[0].caseInput.product = "MUTATED_PRODUCT";

  const second = await loadKhcnCaseFixtures();
  assert.equal(second.length, 8);
  assert.notEqual(second[0].title, "MUTATED TEST TITLE");
  assert.notEqual(second[0].caseInput.product, "MUTATED_PRODUCT");
  clearKhcnFixtureCache();
});

test("FAST case uses deterministic auto approval without human review", async () => {
  const run = await requireRun("case_02_fast_clean");
  assert.equal(run.riskTier, "FAST");
  assert.equal(run.approvalRoute, "AUTO_APPROVAL");
  assert.equal(run.gateStatus, "AUTO_APPROVED");
  assert.equal(run.requiresHumanApproval, false);
  assert.ok(run.autoApprovalToken);
  assert.equal(run.systemProposal.loanAmount, 150000000);
});

test("main complex case computes proposal and waits for human approval", async () => {
  const run = await requireRun("case_01_complex_main");
  assert.equal(run.riskTier, "COMPLEX");
  assert.equal(run.approvalRoute, "HYBRID_APPROVAL");
  assert.equal(run.gateStatus, "CONDITIONAL_PASS");
  assert.equal(run.status, "WAITING_HUMAN_APPROVAL");
  assert.equal(run.systemProposal.homeLoanAmount, 2250000000);
  assert.equal(run.systemProposal.stressDti, "59.6%");
  assert.equal(run.systemProposal.ltv, "64.3%");
  assert.ok(run.conditions.some((condition) => condition.blocksAt === "CONTRACT_SIGNING"));
  assert.ok(run.conditions.some((condition) => condition.blocksAt === "DISBURSEMENT"));
  assert.ok(run.conditions.some((condition) => condition.blocksAt === "EXTERNAL_DATA_CALL"));
  assert.ok(
    run.executionActions
      .filter((action) => action.sideEffect === "HIGH")
      .every((action) => action.status === "BLOCKED")
  );
});

test("multi-agent network exposes planner, specialists, handoffs and tool use", async () => {
  const run = await requireRun("case_01_complex_main");
  const report = buildAgentNetworkReport(run);
  const agents = report.specialists.map((specialist) => specialist.agent);

  assert.ok(agents.includes("planner"));
  assert.ok(agents.includes("credit"));
  assert.ok(agents.includes("legal"));
  assert.ok(agents.includes("gate"));
  assert.ok(agents.includes("operations"));
  assert.ok(report.handoffs.length >= 4);
  assert.ok(report.toolUseSummary.toolCallCount >= 8);
  assert.equal(report.toolUseSummary.executesBankingActions, true);
  assert.ok(report.singleAgentComparison.baseline.missingCapabilities.includes("No explicit planner dependency graph"));
});

test("deterministic rule engine modules compute credit, legal findings and gate", async () => {
  const fixture = await findKhcnCaseFixture("case_01_complex_main");
  assert.ok(fixture);

  const credit = runCreditRuleEngine(fixture);
  assert.equal(credit.proposedAmount, 2250000000);
  assert.equal(credit.stressDtiDisplay, "59.6%");
  assert.equal(credit.ltvDisplay, "64.3%");

  const findings = runLegalRuleEngine(fixture);
  assert.ok(findings.some((finding) => finding.ruleId === "TCTD-INSURANCE-TYING-001"));
  assert.ok(findings.some((finding) => finding.ruleId === "MARITAL-COMMON-PROPERTY-001"));
  assert.ok(findings.some((finding) => finding.ruleId === "FUTURE-HOUSING-GUARANTEE-001"));
  assert.ok(findings.some((finding) => finding.ruleId === "PDPD-CONSENT-001"));
  assert.equal(runGateRuleEngine(credit, findings), "CONDITIONAL_PASS");
});

test("PII masker redacts sensitive JSON fields before model gateway", () => {
  const result = maskPiiForModel(
    JSON.stringify({
      customer: {
        full_name: "Nguyen Van A",
        id_number: "001091234567",
        phone: "0912345678",
        monthly_income: 55000000,
      },
    })
  );

  assert.equal(result.maskedFieldCount, 3);
  assert.equal(result.text.includes("Nguyen Van A"), false);
  assert.equal(result.text.includes("001091234567"), false);
  assert.equal(result.text.includes("0912345678"), false);
  assert.ok(result.text.includes("55000000"));
});

test("approval middleware rejects missing token and accepts authorized reviewer", async () => {
  const makeResponse = () => {
    const response = {
      statusCode: 200,
      payload: undefined as unknown,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        this.payload = payload;
        return this;
      },
    };
    return response;
  };

  let nextCalled = false;
  const rejected = makeResponse();
  await requireApprovalAuth({ headers: {}, body: { reviewerRole: "DEMO_REVIEWER" } } as never, rejected as never, () => {
    nextCalled = true;
  });
  assert.equal(rejected.statusCode, 401);
  assert.equal(nextCalled, false);

  const accepted = makeResponse();
  await requireApprovalAuth(
    {
      headers: { authorization: "Bearer demo-approval-token" },
      body: { reviewerRole: "DEMO_REVIEWER" },
    } as never,
    accepted as never,
    () => {
      nextCalled = true;
    }
  );
  assert.equal(accepted.statusCode, 200);
  assert.equal(nextCalled, true);

  nextCalled = false;
  const jwtAccepted = makeResponse();
  const jwt = createApprovalJwt({ sub: "TEST_REVIEWER_001", role: "DEMO_REVIEWER" });
  await requireApprovalAuth(
    {
      headers: { authorization: `Bearer ${jwt}` },
      body: { reviewerId: "TEST_REVIEWER_001", reviewerRole: "DEMO_REVIEWER" },
    } as never,
    jwtAccepted as never,
    () => {
      nextCalled = true;
    }
  );
  assert.equal(jwtAccepted.statusCode, 200);
  assert.equal(nextCalled, true);

  nextCalled = false;
  const jwtRejected = makeResponse();
  await requireApprovalAuth(
    {
      headers: { authorization: `Bearer ${jwt}` },
      body: { reviewerId: "OTHER_REVIEWER", reviewerRole: "DEMO_REVIEWER" },
    } as never,
    jwtRejected as never,
    () => {
      nextCalled = true;
    }
  );
  assert.equal(jwtRejected.statusCode, 403);
  assert.equal(nextCalled, false);
});

test("hybrid approval path is explicit and does not run before approval", async () => {
  const run = await requireRun("case_01_complex_main");
  assert.equal(run.requiresHumanApproval, true);
  assert.equal(run.humanApprovalToken, undefined);
  await assert.rejects(() => approveRetailCaseRun(run.requestId), /Missing reviewerId/);
  assert.equal((await getRetailCaseRun(run.requestId))?.humanApprovalToken, undefined);

  const approved = await approveRetailCaseRun(run.requestId, {
    reviewerId: "TEST_REVIEWER_001",
    reviewerRole: "DEMO_REVIEWER",
    decision: "APPROVE",
    approvalIntent: buildApprovalIntent(run),
    idempotencyKey: `test-${run.requestId}`,
  });
  assert.ok(approved?.humanApprovalToken);
  assert.equal(approved?.status, "COMPLETED");
  assert.ok(
    approved?.executionActions
      .filter((action) => action.sideEffect === "HIGH")
      .every((action) => action.status !== "BLOCKED")
  );
});

test("retail run repository persists runs across cache reload", async () => {
  const previousStoreDir = process.env.RETAIL_RUN_STORE_DIR;
  const storeDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "khcn-run-store-"));
  process.env.RETAIL_RUN_STORE_DIR = storeDir;
  clearRetailRunRepositoryCache();

  try {
    const run = await requireRun("case_02_fast_clean");
    assert.ok(await fileExists(path.join(storeDir, "retail-runs.json")));
    assert.ok(await fileExists(path.join(storeDir, "retail-events.jsonl")));

    clearRetailRunRepositoryCache();
    const rehydrated = await getRetailCaseRun(run.requestId);
    assert.equal(rehydrated?.requestId, run.requestId);
    assert.equal(rehydrated?.gateStatus, "AUTO_APPROVED");
  } finally {
    if (previousStoreDir === undefined) {
      delete process.env.RETAIL_RUN_STORE_DIR;
    } else {
      process.env.RETAIL_RUN_STORE_DIR = previousStoreDir;
    }
    clearRetailRunRepositoryCache();
  }
});

test("runtime evaluation is read-only against the persistent run store", async () => {
  const previousStoreDir = process.env.RETAIL_RUN_STORE_DIR;
  const storeDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "khcn-eval-store-"));
  process.env.RETAIL_RUN_STORE_DIR = storeDir;
  clearRetailRunRepositoryCache();

  try {
    const report = await evaluateKhcnCases();
    assert.equal(report.status, "PASS");
    assert.equal(report.passed, 21);
    assert.equal(await fileExists(path.join(storeDir, "retail-runs.json")), false);
    assert.equal(await fileExists(path.join(storeDir, "retail-events.jsonl")), false);
  } finally {
    if (previousStoreDir === undefined) {
      delete process.env.RETAIL_RUN_STORE_DIR;
    } else {
      process.env.RETAIL_RUN_STORE_DIR = previousStoreDir;
    }
    clearRetailRunRepositoryCache();
  }
});

test("model gateway public status does not expose secret fingerprints", () => {
  const status = getModelGatewayStatus() as Record<string, unknown>;
  assert.equal("apiKeyFingerprint" in status, false);
  assert.equal("apiKey" in status, false);
  assert.equal(typeof status.apiKeyConfigured, "boolean");
  assert.equal(typeof status.circuitOpen, "boolean");
  assert.equal(typeof status.retryMax, "number");
  assert.equal(status.piiMaskingEnabled, true);
  assert.equal(status.ruleEvidenceEnabled, true);
  assert.equal(typeof status.ruleEvidenceRetrieval, "object");
  assert.equal(typeof status.documentIngestion, "object");
  assert.equal(typeof status.workflowQueue, "object");
  assert.equal(status.workflowStateBackend, "file-snapshot-event-log");
});

test("last-mile production seams expose queue and document ingestion boundaries", async () => {
  const workflowStatus = getWorkflowQueueStatus();
  assert.equal(workflowStatus.backend, "file-snapshot-event-log");
  assert.equal(workflowStatus.distributedReady, false);

  const ingestionStatus = getDocumentIngestionStatus();
  assert.equal(ingestionStatus.provider, "fixture-json");
  assert.equal(ingestionStatus.productionReady, false);
  assert.ok(ingestionStatus.requiredForProduction.includes("OCR/Vision extraction"));

  await assert.rejects(
    () =>
      ingestDocument({
        documentId: "DOC-TEST",
        documentType: "loan_application",
        mimeType: "application/pdf",
        bytesBase64: "JVBERi0xLjQ=",
        sourceHash: "sha256:test",
      }),
    /fixture-json only/
  );
});

test("governance report exposes parsed document provenance", async () => {
  const run = await requireRun("case_01_complex_main");
  const report = await buildRetailGovernanceReport(run);

  assert.ok(report.documentEvidence.length >= 5);
  assert.ok(report.documentEvidence.every((document) => document.status === "PASS"));
  assert.ok(report.documentEvidence.every((document) => document.sourceHash.startsWith("sha256:")));
  assert.ok(report.controls.some((control) => control.id === "DOCUMENT_PROVENANCE" && control.status === "PASS"));
});

test("production readiness report separates demo assurance from go-live blockers", async () => {
  const report = await getProductionReadinessReport();

  assert.equal(report.localDemoScore, 95);
  assert.equal(report.productionGoLiveStatus, "BLOCKED");
  assert.ok(report.productionGoLiveScore < report.localDemoScore);
  assert.ok(report.blockers.some((blocker) => blocker.id === "DOCUMENT_INGESTION"));
  assert.ok(report.controls.some((control) => control.id === "HUMAN_APPROVAL_GUARD" && control.status === "PASS"));
});

test("rule evidence retrieval uses local rule packs instead of mock RAG", async () => {
  const dtiEvidence = await queryKhcnRuleEvidence("DTI stress test maximum borrower income", 6);
  assert.ok(dtiEvidence.some((item) => item.ruleId === "SHB-DTI-STRESS-001"));

  const legalRequirements = await queryLegalRequirements("customer consent personal data processing");
  assert.ok(legalRequirements.some((item) => item.includes("PDPD-CONSENT-001")));

  const creditPolicies = await queryCreditPolicies("loan to value retail home loan DTI");
  assert.ok(creditPolicies.some((item) => item.includes("SHB-LTV-RETAIL-001") || item.includes("SHB-DTI-STRESS-001")));
});

test("container configuration mounts data through DATA_ROOT", async () => {
  const backendRoot = path.resolve(__dirname, "..", "..");
  const projectRoot = path.resolve(backendRoot, "..");
  const compose = await fs.promises.readFile(path.join(projectRoot, "docker-compose.yml"), "utf8");
  const loader = await fs.promises.readFile(path.join(backendRoot, "src/services/retail/case-fixture.service.ts"), "utf8");

  assert.ok(compose.includes("./data:/data:ro"));
  assert.ok(compose.includes("DATA_ROOT=/data"));
  assert.ok(loader.includes("process.env.KHCN_DATA_ROOT"));
  assert.ok(loader.includes("process.env.DATA_ROOT"));
});

test("isolated P0 cases fire their runtime-derived gates", async () => {
  assert.equal((await requireRun("case_03_insurance_tying_only")).gateStatus, "REPLAN_REQUIRED");
  assert.ok(
    (await requireRun("case_04_marital_missing_spouse")).conditions.some(
      (condition) => condition.blocksAt === "CONTRACT_SIGNING"
    )
  );
  assert.ok(
    (await requireRun("case_05_project_missing_guarantee")).conditions.some(
      (condition) => condition.blocksAt === "DISBURSEMENT"
    )
  );

  const missingConsent = await requireRun("case_06_missing_consent");
  assert.equal(missingConsent.gateStatus, "CONSENT_REQUIRED");
  assert.ok(
    missingConsent.traces
      .flatMap((trace) => trace.toolCalls)
      .some((call) => call.toolName === "external.verify_income_bhxh" && call.output.outbound_calls_made === 0)
  );

  const dtiFail = await requireRun("case_07_dti_fail");
  assert.equal(dtiFail.gateStatus, "REJECT_OR_REQUEST_LOWER_AMOUNT");
  assert.equal(dtiFail.systemProposal.homeLoanAmount, null);
});

test("prompt injection is detected before model-facing traces", async () => {
  const run = await requireRun("case_08_prompt_injection_doc");
  const systemTrace = run.traces.find((trace) => trace.agent === "system");
  assert.ok(systemTrace);
  assert.ok(
    systemTrace.toolCalls.some(
      (call) =>
        call.toolName === "prompt_injection_guard.scan" &&
        call.output.injection_detected === true &&
        call.output.instruction_followed === false
    )
  );
  assert.equal(run.governance.rawPiiToLlm, false);
});

test("runtime source does not read oracle fields", async () => {
  const backendRoot = path.resolve(__dirname, "..", "..");
  const runtimeFiles = [
    "src/services/retail/case-fixture.service.ts",
    "src/services/retail/khcn-engine.service.ts",
    "src/services/orchestration/retail-case.service.ts",
    "src/services/retail/evaluation.service.ts",
    "src/services/retail/retail-run.repository.ts",
  ];
  const forbidden = ["expected" + "Output", "expected" + "_output"];

  for (const relativeFile of runtimeFiles) {
    const content = await fs.promises.readFile(path.join(backendRoot, relativeFile), "utf8");
    for (const token of forbidden) {
      assert.equal(content.includes(token), false, `${relativeFile} must not contain ${token}`);
    }
  }
});

test("runtime source does not use blocking filesystem APIs", async () => {
  const backendRoot = path.resolve(__dirname, "..", "..");
  const runtimeFiles = [
    "src/services/retail/case-fixture.service.ts",
    "src/services/retail/retail-run.repository.ts",
    "src/services/rag/khcn-rule-evidence.service.ts",
  ];
  const forbidden = ["readFileSync", "writeFileSync", "appendFileSync", "existsSync", "statSync", "readdirSync", "mkdirSync"];

  for (const relativeFile of runtimeFiles) {
    const content = await fs.promises.readFile(path.join(backendRoot, relativeFile), "utf8");
    for (const token of forbidden) {
      assert.equal(content.includes(token), false, `${relativeFile} must not contain ${token}`);
    }
  }
});
