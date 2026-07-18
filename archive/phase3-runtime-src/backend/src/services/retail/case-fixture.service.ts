import { promises as fs } from "fs";
import type { Dirent } from "fs";
import path from "path";
import { ApprovalRoute, DemoCaseSummary, RiskTier } from "../../types/orchestration.types";
import { clock } from "../platform/clock.service";
import { RetailRouterInput, routeRetailRequest } from "./router.service";

export type JsonRecord = Record<string, unknown>;

export interface KhcnCoreData {
  customer360: JsonRecord;
  consentRegistry: JsonRecord;
}

export interface KhcnCaseFixture {
  caseId: string;
  title: string;
  objective: string;
  product: string;
  riskTier: RiskTier;
  approvalRoute: ApprovalRoute;
  targetSlaHours: number;
  trapCount: number;
  caseInput: JsonRecord;
  parsedDocs: Record<string, JsonRecord>;
  core: KhcnCoreData;
}

const projectRoot = path.resolve(__dirname, "../../../..");
const dataRoot = process.env.KHCN_DATA_ROOT || process.env.DATA_ROOT || path.join(projectRoot, "data");
const khcnRoot = path.join(dataRoot, "khcn");
const casesRoot = path.join(khcnRoot, "cases");
const coreRoot = path.join(khcnRoot, "core");
const fixtureCacheTtlMs = Number(process.env.KHCN_FIXTURE_CACHE_TTL_MS || 5000);

interface FixtureCache {
  root: string;
  signature: string;
  checkedAt: number;
  fixtures: KhcnCaseFixture[];
}

let fixtureCache: FixtureCache | undefined;
let fixtureLoadPromise: Promise<KhcnCaseFixture[]> | undefined;

const readJson = async (filePath: string): Promise<JsonRecord> =>
  JSON.parse(await fs.readFile(filePath, "utf8")) as JsonRecord;

const pathExists = async (filePath: string) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const asRecord = (value: unknown): JsonRecord => (value && typeof value === "object" ? (value as JsonRecord) : {});

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const asString = (value: unknown, fallback: string) => (typeof value === "string" ? value : fallback);

const asNumber = (value: unknown, fallback: number) => (typeof value === "number" ? value : fallback);

const asBoolean = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);

const collectJsonFileStats = async (directory: string): Promise<string[]> => {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectJsonFileStats(entryPath);
      }

      if (!entry.isFile() || !entry.name.endsWith(".json")) {
        return [];
      }

      const stats = await fs.stat(entryPath);
      return [`${path.relative(khcnRoot, entryPath)}:${stats.mtimeMs}:${stats.size}`];
    })
  );

  return nested.flat().sort();
};

const getFixtureSignature = async () => (await collectJsonFileStats(khcnRoot)).join("|");

const loadCore = async (): Promise<KhcnCoreData> => ({
  customer360: await readJson(path.join(coreRoot, "customer_360.json")),
  consentRegistry: await readJson(path.join(coreRoot, "consent_registry.json")),
});

const loadParsedDocs = async (directory: string, caseInput: JsonRecord): Promise<Record<string, JsonRecord>> => {
  const docs: Record<string, JsonRecord> = {};

  await Promise.all(
    asArray(caseInput.documents).map(async (docRef) => {
      if (typeof docRef !== "string") {
        return;
      }

      const normalizedRef = docRef.replace(/\\/g, "/");
      const fileName = path.basename(normalizedRef);
      docs[fileName] = await readJson(path.join(casesRoot, directory, normalizedRef));
    })
  );

  return docs;
};

export const routerInputFromCaseInput = (caseInput: JsonRecord): RetailRouterInput => {
  const input = asRecord(caseInput.risk_router_inputs);
  return {
    loanAmount: asNumber(input.loan_amount, 0),
    collateralType: asString(input.collateral_type, "NONE_OR_DEPOSIT_BACKED") as RetailRouterInput["collateralType"],
    incomeSourcesCount: asNumber(input.income_sources_count, 0),
    hasUnverifiedIncome: asBoolean(input.has_unverified_income, false),
    hasExternalDebt: asBoolean(input.has_external_debt, false),
    isFutureProperty: asBoolean(input.is_future_property, false),
  };
};

const finalizeFixture = (fixture: Omit<KhcnCaseFixture, "riskTier" | "approvalRoute">): KhcnCaseFixture => {
  const routerDecision = routeRetailRequest(routerInputFromCaseInput(fixture.caseInput));
  return {
    ...fixture,
    riskTier: routerDecision.tier,
    approvalRoute: routerDecision.approvalRoute,
  };
};

const cloneFixture = (fixture: KhcnCaseFixture): KhcnCaseFixture => ({
  ...fixture,
  caseInput: clone(fixture.caseInput),
  parsedDocs: Object.fromEntries(Object.entries(fixture.parsedDocs).map(([name, doc]) => [name, clone(doc)])),
  core: {
    customer360: clone(fixture.core.customer360),
    consentRegistry: clone(fixture.core.consentRegistry),
  },
});

const decodePointerSegment = (segment: string) => segment.replace(/~1/g, "/").replace(/~0/g, "~");

const setJsonPointer = (target: JsonRecord, pointer: string, value: unknown) => {
  if (!pointer || pointer === "/") {
    throw new Error("Root-level fixture overrides are not supported.");
  }

  const segments = pointer.split("/").slice(1).map(decodePointerSegment);
  let cursor: unknown = target;

  for (const segment of segments.slice(0, -1)) {
    if (Array.isArray(cursor)) {
      cursor = cursor[Number(segment)];
      continue;
    }

    const record = asRecord(cursor);
    if (!(segment in record) || typeof record[segment] !== "object" || record[segment] === null) {
      record[segment] = {};
    }
    cursor = record[segment];
  }

  const last = segments[segments.length - 1];
  if (Array.isArray(cursor)) {
    cursor[Number(last)] = value;
    return;
  }

  asRecord(cursor)[last] = value;
};

const applyOverride = (fixture: KhcnCaseFixture, override: JsonRecord) => {
  const rawPointer = asString(override.pointer, "");
  const [targetPath, jsonPointer = ""] = rawPointer.split("#");
  const normalizedTarget = targetPath.replace(/\\/g, "/");

  if (normalizedTarget === "/case_input.json") {
    setJsonPointer(fixture.caseInput, jsonPointer, override.value);
    return;
  }

  if (normalizedTarget === "/core/customer_360.json") {
    setJsonPointer(fixture.core.customer360, jsonPointer, override.value);
    return;
  }

  if (normalizedTarget === "/core/consent_registry.json") {
    setJsonPointer(fixture.core.consentRegistry, jsonPointer, override.value);
    return;
  }

  if (normalizedTarget.startsWith("/parsed_docs/")) {
    const fileName = path.basename(normalizedTarget);
    const doc = fixture.parsedDocs[fileName];
    if (!doc) {
      throw new Error(`Unknown parsed document in fixture override: ${fileName}`);
    }
    setJsonPointer(doc, jsonPointer, override.value);
    return;
  }

  throw new Error(`Unsupported fixture override target: ${rawPointer}`);
};

const buildFixtureFromInput = (
  directory: string,
  caseInput: JsonRecord,
  metaSource: JsonRecord,
  parsedDocs: Record<string, JsonRecord>,
  core: KhcnCoreData,
  trapCount: number
): KhcnCaseFixture => {
  const meta = asRecord(metaSource._meta ?? caseInput._meta);
  const caseId = asString(meta.case_id, directory);
  const product = asString(caseInput.product, caseId === "case_02_fast_clean" ? "UNSECURED_PERSONAL_LOAN" : "HOME_LOAN");

  return finalizeFixture({
    caseId,
    title: asString(meta.title, caseId),
    objective: asString(meta.objective, caseId === "case_01_complex_main" ? "Main KHCN hybrid approval demo case." : ""),
    product,
    targetSlaHours: asNumber(caseInput.target_sla_hours, caseId === "case_02_fast_clean" ? 1 : 24),
    trapCount,
    caseInput,
    parsedDocs,
    core,
  });
};

const loadCaseFixture = async (directory: string): Promise<KhcnCaseFixture> => {
  const caseDir = path.join(casesRoot, directory);
  const caseJsonPath = path.join(caseDir, "case.json");
  const caseInputPath = path.join(caseDir, "case_input.json");

  if (await pathExists(caseInputPath)) {
    const caseInput = await readJson(caseInputPath);
    const meta = asRecord(caseInput._meta);
    const trapCount = asArray(meta.traps).length;
    const [parsedDocs, core] = await Promise.all([loadParsedDocs(directory, caseInput), loadCore()]);
    return buildFixtureFromInput(directory, caseInput, caseInput, parsedDocs, core, trapCount);
  }

  const caseJson = await readJson(caseJsonPath);
  const meta = asRecord(caseJson._meta);

  if ("case_input" in caseJson) {
    const caseInput = asRecord(caseJson.case_input);
    return buildFixtureFromInput(directory, caseInput, caseJson, {}, await loadCore(), asArray(meta.traps).length);
  }

  const baseCase = asString(meta.base_case, "case_01_complex_main");
  const fixture = cloneFixture(await loadCaseFixture(baseCase));
  fixture.caseId = asString(meta.case_id, directory);
  fixture.title = asString(meta.title, fixture.caseId);
  fixture.objective = asString(meta.objective, fixture.objective);
  fixture.trapCount = asArray(caseJson.overrides).length;

  asRecord(fixture.caseInput._meta).case_id = fixture.caseId;
  asRecord(fixture.caseInput._meta).title = fixture.title;

  for (const override of asArray(caseJson.overrides)) {
    applyOverride(fixture, asRecord(override));
  }

  return finalizeFixture(fixture);
};

const loadKhcnCaseFixturesUncached = async (): Promise<KhcnCaseFixture[]> => {
  const entries = await fs.readdir(casesRoot, { withFileTypes: true });
  const fixtures = await Promise.all(
    entries.filter((entry) => entry.isDirectory()).map((entry) => loadCaseFixture(entry.name))
  );
  return fixtures.sort((a, b) => a.caseId.localeCompare(b.caseId));
};

export const loadKhcnCaseFixtures = async (): Promise<KhcnCaseFixture[]> => {
  if (fixtureLoadPromise) {
    return fixtureLoadPromise;
  }

  fixtureLoadPromise = (async () => {
    const now = clock().nowMs();
    if (fixtureCache && fixtureCache.root === khcnRoot && now - fixtureCache.checkedAt < fixtureCacheTtlMs) {
      return fixtureCache.fixtures.map(cloneFixture);
    }

    const signature = await getFixtureSignature();
    if (fixtureCache && fixtureCache.root === khcnRoot && fixtureCache.signature === signature) {
      fixtureCache.checkedAt = now;
      return fixtureCache.fixtures.map(cloneFixture);
    }

    const fixtures = await loadKhcnCaseFixturesUncached();
    fixtureCache = {
      root: khcnRoot,
      signature,
      checkedAt: now,
      fixtures,
    };

    return fixtures.map(cloneFixture);
  })();

  try {
    return await fixtureLoadPromise;
  } finally {
    fixtureLoadPromise = undefined;
  }
};

export const findKhcnCaseFixture = async (caseId: string): Promise<KhcnCaseFixture | undefined> => {
  const normalized = caseId.toLowerCase();
  return (await loadKhcnCaseFixtures()).find((fixture) => fixture.caseId.toLowerCase() === normalized);
};

export const clearKhcnFixtureCache = () => {
  fixtureCache = undefined;
  fixtureLoadPromise = undefined;
};

const expectedOutcome = (fixture: KhcnCaseFixture) => {
  if (fixture.approvalRoute === "AUTO_APPROVAL") {
    return "AUTO_APPROVAL candidate from runtime inputs";
  }

  return "HYBRID_APPROVAL evaluated from runtime inputs and parsed documents";
};

export const fixturesToSummaries = (fixtures: KhcnCaseFixture[]): DemoCaseSummary[] =>
  fixtures.map((fixture) => ({
    caseId: fixture.caseId,
    title: fixture.title,
    product: fixture.product,
    description: fixture.objective || expectedOutcome(fixture),
    riskTier: fixture.riskTier,
    approvalRoute: fixture.approvalRoute,
    targetSlaHours: fixture.targetSlaHours,
    trapCount: fixture.trapCount,
    expectedOutcome: expectedOutcome(fixture),
  }));
