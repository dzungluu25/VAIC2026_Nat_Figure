import { createClient } from "@supabase/supabase-js";
import { config } from "./env";

// For the mock phase, we won't throw if keys are missing, 
// as we might just run locally without a real DB first.
export const supabase = 
  config.supabaseUrl && config.supabaseAnonKey
    ? createClient(config.supabaseUrl, config.supabaseAnonKey)
    : null;
