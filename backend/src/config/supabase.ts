import { createClient } from "@supabase/supabase-js";
import { config } from "./env";

export const supabase = createClient(
  config.supabaseUrl || "https://placeholder-url.supabase.co",
  config.supabaseServiceRoleKey || config.supabaseAnonKey || "placeholder-key",
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);
