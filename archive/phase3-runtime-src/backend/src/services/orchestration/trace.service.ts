import { promises as fs } from "fs";
import path from "path";
import { OrchestrationResponse } from "../../types/orchestration.types";
import { nowIso } from "../retail/retail-common";

interface LegacyOrchestrationSnapshot {
  version: 1;
  updatedAt: string;
  runs: OrchestrationResponse[];
}

let cachedRoot = "";
let cachedRuns: Map<string, OrchestrationResponse> | undefined;

const getDataRoot = () => process.env.RETAIL_RUN_STORE_DIR || path.resolve(__dirname, "../../../runtime-data");

const getSnapshotPath = () => path.join(getDataRoot(), "legacy-orchestration-runs.json");

const fileExists = async (filePath: string) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const loadStore = async () => {
  const currentRoot = getDataRoot();
  if (cachedRuns && cachedRoot === currentRoot) {
    return cachedRuns;
  }

  await fs.mkdir(currentRoot, { recursive: true });
  cachedRoot = currentRoot;

  if (!(await fileExists(getSnapshotPath()))) {
    cachedRuns = new Map();
    return cachedRuns;
  }

  const snapshot = JSON.parse(await fs.readFile(getSnapshotPath(), "utf8")) as LegacyOrchestrationSnapshot;
  cachedRuns = new Map(snapshot.runs.map((run) => [run.runId, run]));
  return cachedRuns;
};

const writeStore = async (runs: Map<string, OrchestrationResponse>) => {
  const snapshot: LegacyOrchestrationSnapshot = {
    version: 1,
    updatedAt: nowIso(),
    runs: [...runs.values()],
  };
  await fs.writeFile(getSnapshotPath(), JSON.stringify(snapshot, null, 2), "utf8");
};

export const saveOrchestrationRun = async (runId: string, data: OrchestrationResponse) => {
  const runs = await loadStore();
  runs.set(runId, data);
  await writeStore(runs);
};

export const getOrchestrationRun = async (runId: string): Promise<OrchestrationResponse | null> => {
  return (await loadStore()).get(runId) ?? null;
};
