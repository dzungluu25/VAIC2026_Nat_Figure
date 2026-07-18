import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { AuditEvent, RetailCaseRun } from "../../types/orchestration.types";
import { nowIso } from "./retail-common";
import { config } from "../../config/env";
import { publishWorkflowEvent } from "../workflow/workflow-queue.service";

interface RetailRunSnapshot {
  version: 1;
  updatedAt: string;
  runs: RetailCaseRun[];
}

interface RetailRunStoreEvent {
  eventId: string;
  eventType: "RUN_SAVED" | "RUN_APPROVED";
  requestId: string;
  caseId: string;
  status: RetailCaseRun["status"];
  gateStatus: RetailCaseRun["gateStatus"];
  actor: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

let cachedRoot = "";
let cachedRuns: Map<string, RetailCaseRun> | undefined;
let loadPromise: Promise<Map<string, RetailCaseRun>> | undefined;
let writeQueue: Promise<void> = Promise.resolve();

const getDataRoot = () => process.env.RETAIL_RUN_STORE_DIR || path.resolve(__dirname, "../../../runtime-data");

const getSnapshotPath = () => path.join(getDataRoot(), "retail-runs.json");

const getEventLogPath = () => path.join(getDataRoot(), "retail-events.jsonl");

const ensureDataRoot = async () => {
  await fs.mkdir(getDataRoot(), { recursive: true });
};

const fileExists = async (filePath: string) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const readSnapshot = async (): Promise<Map<string, RetailCaseRun>> => {
  const snapshotPath = getSnapshotPath();
  if (!(await fileExists(snapshotPath))) {
    return new Map();
  }

  const snapshot = JSON.parse(await fs.readFile(snapshotPath, "utf8")) as RetailRunSnapshot;
  return new Map(snapshot.runs.map((run) => [run.requestId, run]));
};

const getStore = async () => {
  const currentRoot = getDataRoot();
  if (cachedRuns && cachedRoot === currentRoot) {
    return cachedRuns;
  }

  if (!loadPromise || cachedRoot !== currentRoot) {
    loadPromise = (async () => {
      await ensureDataRoot();
      cachedRoot = currentRoot;
      cachedRuns = await readSnapshot();
      return cachedRuns;
    })();
  }

  return loadPromise;
};

const writeSnapshot = async (runs: Map<string, RetailCaseRun>) => {
  await ensureDataRoot();
  const snapshot: RetailRunSnapshot = {
    version: 1,
    updatedAt: nowIso(),
    runs: [...runs.values()],
  };
  const snapshotPath = getSnapshotPath();
  const tempPath = `${snapshotPath}.${randomUUID()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(snapshot, null, 2), "utf8");
  await fs.rename(tempPath, snapshotPath);
};

const appendStoreEvent = async (
  run: RetailCaseRun,
  eventType: RetailRunStoreEvent["eventType"],
  actor: string,
  metadata?: Record<string, unknown>
) => {
  await ensureDataRoot();
  const event: RetailRunStoreEvent = {
    eventId: `${eventType}-${run.requestId}-${randomUUID()}`,
    eventType,
    requestId: run.requestId,
    caseId: run.caseId,
    status: run.status,
    gateStatus: run.gateStatus,
    actor,
    timestamp: nowIso(),
    metadata,
  };
  await fs.appendFile(getEventLogPath(), `${JSON.stringify(event)}\n`, "utf8");

  try {
    await publishWorkflowEvent(event);
  } catch (error) {
    if (config.workflowQueueRequired) {
      throw error;
    }
  }
};

export const saveRetailRun = async (
  run: RetailCaseRun,
  eventType: RetailRunStoreEvent["eventType"] = "RUN_SAVED",
  actor = "system",
  metadata?: Record<string, unknown>
) => {
  const write = async () => {
    const runs = await getStore();
    runs.set(run.requestId, run);
    await writeSnapshot(runs);
    await appendStoreEvent(run, eventType, actor, metadata);
  };

  writeQueue = writeQueue.then(write, write);
  await writeQueue;
  return run;
};

export const getRetailRun = async (requestId: string): Promise<RetailCaseRun | undefined> =>
  (await getStore()).get(requestId);

export const getRetailRunAudit = async (requestId: string): Promise<AuditEvent[] | undefined> =>
  (await getRetailRun(requestId))?.audit;

export const clearRetailRunRepositoryCache = () => {
  cachedRuns = undefined;
  cachedRoot = "";
  loadPromise = undefined;
  writeQueue = Promise.resolve();
};
