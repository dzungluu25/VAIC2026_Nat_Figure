import { RetailCase } from "../../types/case.types";
import { pgPool, pgQuery } from "../../config/pg";
import { assertPersistedRetailCase, validateRetailCase } from "./data-integrity.service";

/** Loads and runtime-validates a case before any agent is allowed to consume it. */
export const loadRetailCase = async (caseId: string, tenantId = "bank-default"): Promise<RetailCase | undefined> => {
  const dbResult = await pgQuery(
    "SELECT case_id, customer_id, payload FROM retail_cases WHERE case_id = $1 AND tenant_id = $2",
    [caseId, tenantId]
  );
  const row = dbResult.rows[0] as { case_id: string; customer_id: string; payload: unknown } | undefined;
  if (!row) return undefined;

  const retailCase = validateRetailCase(row.payload);
  if (retailCase.caseId !== row.case_id || retailCase.customerId !== row.customer_id) {
    throw new Error(`Database identity columns do not match payload for case ${caseId}.`);
  }
  return retailCase;
};

/**
 * Writes and verifies the complete JSONB payload in one transaction. The row is only
 * committed after Postgres returns a schema-valid, JSON-equivalent document.
 */
export const saveRetailCase = async (retailCase: RetailCase, tenantId = "bank-default"): Promise<void> => {
  const validatedCase = validateRetailCase(retailCase);
  const client = await pgPool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ payload: unknown }>(
      `INSERT INTO retail_cases (case_id, customer_id, payload, tenant_id)
       VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (case_id) DO UPDATE
       SET customer_id = EXCLUDED.customer_id, payload = EXCLUDED.payload
       WHERE retail_cases.tenant_id = EXCLUDED.tenant_id
       RETURNING payload`,
      [validatedCase.caseId, validatedCase.customerId, JSON.stringify(validatedCase), tenantId]
    );
    if (result.rowCount !== 1 || !result.rows[0]) {
      throw new Error(`Database did not confirm exactly one row for case ${validatedCase.caseId}.`);
    }
    assertPersistedRetailCase(validatedCase, result.rows[0].payload);
    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.warn("RetailCase rollback failed; connection may already be closed:", rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
};
