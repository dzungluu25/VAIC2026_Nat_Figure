import { Pool } from "pg";

const pgHost = process.env.PG_HOST || "localhost";
const pgPort = parseInt(process.env.PG_PORT || "5432", 10);
const pgUser = process.env.PG_USER || "vaic";
const pgPassword = process.env.PG_PASSWORD || "vaic_pass";
const pgDatabase = process.env.PG_DB || "vaic_db";

export const pgPool = process.env.SUPABASE_DB_URL 
  ? new Pool({ 
      connectionString: process.env.SUPABASE_DB_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    })
  : new Pool({
      host: pgHost,
      port: pgPort,
      user: pgUser,
      password: pgPassword,
      database: pgDatabase,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

pgPool.on("error", (err: Error) => {
  console.error("Unexpected error on idle PostgreSQL client:", err);
});

export const pgQuery = async (text: string, params?: any[]) => {
  return pgPool.query(text, params);
};
