import "./load-env";
import fs from "fs";
import { Pool } from "pg";

const isProduction = (process.env.NODE_ENV || "development") === "production";

/**
 * Resolves the Supabase pooler CA certificate from SUPABASE_CA_CERT, which may hold either the raw
 * PEM content or a path to a .crt/.pem file. Returns undefined when the variable is not set.
 */
const loadSupabaseCa = (): string | undefined => {
  const raw = process.env.SUPABASE_CA_CERT?.trim();
  if (!raw) return undefined;
  if (raw.includes("BEGIN CERTIFICATE")) return raw;
  try {
    return fs.readFileSync(raw, "utf8");
  } catch {
    throw new Error(`SUPABASE_CA_CERT is set but points to an unreadable file: ${raw}`);
  }
};

/**
 * Builds the TLS config for the managed Supabase connection. A CA certificate enables full
 * verification (rejectUnauthorized: true). Without one, verification is refused in production so a
 * misconfigured deployment fails loudly instead of silently accepting any server certificate.
 */
const buildSupabaseSsl = () => {
  const ca = loadSupabaseCa();
  if (ca) return { ca, rejectUnauthorized: true as const };

  if (isProduction && process.env.SUPABASE_DB_SSL_INSECURE !== "true") {
    throw new Error(
      "Refusing to connect to Supabase without TLS certificate verification in production. " +
        "Provide SUPABASE_CA_CERT (PEM content or a file path), or set SUPABASE_DB_SSL_INSECURE=true to explicitly opt out."
    );
  }

  console.warn(
    "[pg] Supabase TLS certificate is NOT verified (rejectUnauthorized=false). " +
      "Set SUPABASE_CA_CERT to enable a verified connection before running in production."
  );
  return { rejectUnauthorized: false as const };
};

const buildPgPoolConfig = () => {
  if (process.env.SUPABASE_DB_URL) {
    return {
      connectionString: process.env.SUPABASE_DB_URL,
      ssl: buildSupabaseSsl(),
      max: 10,
      idleTimeoutMillis: 500,
      connectionTimeoutMillis: 5000,
    };
  }

  let host = process.env.PG_HOST || "localhost";
  if (host === "postgres" && !fs.existsSync("/.dockerenv")) {
    host = "localhost";
  }

  return {
    host,
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
