import { promises as fs } from "fs";
import path from "path";
import { config } from "../../config/env";

export interface RuleEvidence {
  ruleId: string;
  title: string;
  packId: string;
  sourceType: string;
  sourceName?: string;
  severity?: string;
  ruleType?: string;
  snippet: string;
  score: number;
}

interface RuleIndexItem extends RuleEvidence {
  searchText: string;
  tokens: Set<string>;
}

interface RulePack {
  pack_id?: unknown;
  rules?: unknown;
}

type JsonRecord = Record<string, unknown>;

const projectRoot = path.resolve(__dirname, "../../../..");
const dataRoot = process.env.KHCN_DATA_ROOT || process.env.DATA_ROOT || path.join(projectRoot, "data");
const rulesRoot = path.join(dataRoot, "rules");
const ruleFiles = [
  "khcn_internal_policy_rules.json",
  "khcn_legal_rules.json",
  "internal_policy_rules.json",
  "legal_rules.json",
];

let cache: { signature: string; items: RuleIndexItem[] } | undefined;
let loadPromise: Promise<RuleIndexItem[]> | undefined;

const asRecord = (value: unknown): JsonRecord => (value && typeof value === "object" ? (value as JsonRecord) : {});

const asString = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const normalize = (value: string) => value.toLowerCase();

const tokenize = (value: string) => new Set(normalize(value).match(/[a-z0-9]+/g) ?? []);

const fileExists = async (filePath: string) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const collectSignature = async () => {
  const signatures = await Promise.all(
    ruleFiles.map(async (fileName) => {
      const filePath = path.join(rulesRoot, fileName);
      if (!(await fileExists(filePath))) {
        return "";
      }

      const stats = await fs.stat(filePath);
      return `${path.basename(filePath)}:${stats.mtimeMs}:${stats.size}`;
    })
  );

  return signatures.filter(Boolean).join("|");
};

const stringifyForSearch = (value: unknown): string => {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(stringifyForSearch).join(" ");
  }

  if (typeof value === "object") {
    return Object.entries(value as JsonRecord)
      .map(([key, nested]) => `${key} ${stringifyForSearch(nested)}`)
      .join(" ");
  }

  return "";
};

const chooseSnippet = (rule: JsonRecord) => {
  const preferredFields = ["logic", "plain_finding", "required_fix_template", "note", "article_note"];
  for (const field of preferredFields) {
    const value = asString(rule[field]);
    if (value) {
      return value.length > 420 ? `${value.slice(0, 417)}...` : value;
    }
  }

  return asString(rule.title, asString(rule.rule_id, "Rule evidence"));
};

const loadRulePack = async (fileName: string): Promise<RuleIndexItem[]> => {
  const filePath = path.join(rulesRoot, fileName);
  if (!(await fileExists(filePath))) {
    return [];
  }

  const pack = JSON.parse(await fs.readFile(filePath, "utf8")) as RulePack;
  const packId = asString(pack.pack_id, path.basename(fileName, ".json"));
  const rules = Array.isArray(pack.rules) ? pack.rules : [];

  return rules.map((rawRule) => {
    const rule = asRecord(rawRule);
    const ruleId = asString(rule.rule_id, "UNKNOWN_RULE");
    const title = asString(rule.title, ruleId);
    const sourceType = asString(rule.source_type, fileName.includes("legal") ? "LEGAL_RULE_PACK" : "INTERNAL_POLICY_DEMO");
    const sourceName = asString(rule.source_name);
    const severity = asString(rule.severity);
    const ruleType = asString(rule.rule_type);
    const snippet = chooseSnippet(rule);
    const searchText = [
      ruleId,
      title,
      sourceType,
      sourceName,
      severity,
      ruleType,
      asString(rule.blocks_at),
      stringifyForSearch(rule.input_fields),
      stringifyForSearch(rule.output_fields),
      stringifyForSearch(rule.logic),
      stringifyForSearch(rule.plain_finding),
      stringifyForSearch(rule.required_fix_template),
      stringifyForSearch(rule.parameters),
      ...asStringArray(rule.tags),
    ].join(" ");

    return {
      ruleId,
      title,
      packId,
      sourceType,
      sourceName: sourceName || undefined,
      severity: severity || undefined,
      ruleType: ruleType || undefined,
      snippet,
      score: 0,
      searchText: normalize(searchText),
      tokens: tokenize(searchText),
    };
  });
};

const loadRuleIndex = async () => {
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = (async () => {
    const signature = await collectSignature();
    if (cache && cache.signature === signature) {
      return cache.items;
    }

    const packs = await Promise.all(ruleFiles.map(loadRulePack));
    const items = packs.flat();
    cache = { signature, items };
    return items;
  })();

  try {
    return await loadPromise;
  } finally {
    loadPromise = undefined;
  }
};

const scoreRule = (query: string, queryTokens: Set<string>, item: RuleIndexItem) => {
  let score = 0;
  for (const token of queryTokens) {
    if (item.tokens.has(token)) {
      score += token.length >= 4 ? 3 : 1;
    }
  }

  const normalizedQuery = normalize(query).trim();
  if (normalizedQuery && item.searchText.includes(normalizedQuery)) {
    score += 8;
  }

  if (item.ruleId.toLowerCase().includes(normalizedQuery) || item.title.toLowerCase().includes(normalizedQuery)) {
    score += 12;
  }

  return score;
};

export const clearKhcnRuleEvidenceCache = () => {
  cache = undefined;
  loadPromise = undefined;
};

const queryVectorRuleEvidence = async (query: string, limit: number): Promise<RuleEvidence[]> => {
  if (config.ragProvider !== "vector" || !config.vectorRetrievalUrl) {
    return [];
  }

  const response = await fetch(config.vectorRetrievalUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit, domain: "khcn-retail-rules" }),
  });

  if (!response.ok) {
    throw new Error(`Vector retrieval failed with HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as { evidence?: RuleEvidence[] };
  return Array.isArray(payload.evidence) ? payload.evidence.slice(0, limit) : [];
};

export const getRuleEvidenceRetrievalStatus = () => ({
  provider: config.ragProvider,
  vectorConfigured: Boolean(config.vectorRetrievalUrl),
  localFallbackEnabled: true,
  productionReady: config.ragProvider === "vector" && Boolean(config.vectorRetrievalUrl),
});

export const queryKhcnRuleEvidence = async (query: string, limit = 5): Promise<RuleEvidence[]> => {
  const queryTokens = tokenize(query);
  if (queryTokens.size === 0) {
    return [];
  }

  try {
    const vectorEvidence = await queryVectorRuleEvidence(query, limit);
    if (vectorEvidence.length > 0) {
      return vectorEvidence;
    }
  } catch {
    // Fall back to source-locked local rules so explanations fail closed instead of hallucinating citations.
  }

  return (await loadRuleIndex())
    .map((item) => ({ ...item, score: scoreRule(query, queryTokens, item) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.ruleId.localeCompare(right.ruleId))
    .slice(0, limit)
    .map(({ searchText: _searchText, tokens: _tokens, ...evidence }) => evidence);
};
