import "./load-env";
import { Pool } from "pg";

const buildPgPoolConfig = () => {
  if (process.env.SUPABASE_DB_URL) {
    return {
      connectionString: process.env.SUPABASE_DB_URL,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 500,
      connectionTimeoutMillis: 5000,
    };
  }

  return {
    host: process.env.PG_HOST || "localhost",
    port: Number(process.env.PG_PORT) || 5432,
    user: process.env.PG_USER || "vaic",
    password: process.env.PG_PASSWORD || "vaic_dev_password",
    database: process.env.PG_DB || "vaic_db",
    max: 10,
    idleTimeoutMillis: 500,
    connectionTimeoutMillis: 5000,
  };
};

export const pgPool = new Pool(buildPgPoolConfig());

pgPool.on("error", (err: Error) => {
  console.error("Unexpected error on idle PostgreSQL client:", err);
});

export const pgQuery = async (text: string, params?: any[]) => {
  return pgPool.query(text, params);
};
