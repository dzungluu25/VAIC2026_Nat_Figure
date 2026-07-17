import { RetailCase } from "../../types/case.types";
import { RETAIL_CASES } from "./retail-case-data";
import { pgQuery } from "../../config/pg";
import { supabase } from "../../config/supabase";

/** Loads a case from Supabase or local Postgres, falling back to the static seed data. */
export const loadRetailCase = async (caseId: string): Promise<RetailCase | undefined> => {
  let retailCase: RetailCase | undefined;

  try {
    if (process.env.SUPABASE_DB_URL) {
      const { data, error } = await supabase
        .from("retail_cases")
        .select("payload")
        .eq("case_id", caseId)
        .single();

      if (error) {
        console.warn("Supabase: failed to load case, falling back to static seeds:", error.message);
      } else if (data) {
        retailCase = data.payload as RetailCase;
      }
    } else {
      const dbResult = await pgQuery("SELECT payload FROM retail_cases WHERE case_id = $1", [caseId]);
      if (dbResult.rows.length > 0) {
        retailCase = dbResult.rows[0].payload as RetailCase;
      }
    }
  } catch (err) {
    console.warn("Database: unexpected error loading case:", err);
  }

  return retailCase ?? RETAIL_CASES[caseId];
};
