import { config } from "../../config/env";
import { maskPiiPayload, maskPiiText } from "../governance/pii-masking.service";

/**
 * Structured application logger.
 *
 * Two properties matter more than formatting here:
 *
 * 1. Every context object is routed through `maskPiiPayload` before it reaches
 *    a transport. Application logs are one of the easiest ways for customer
 *    identifiers to leak out of the decision path, so masking is applied at the
 *    logger rather than left to each call site to remember.
 * 2. Errors are serialised to `{ name, message, stack }` — never spread — so a
 *    provider error carrying a request/response body cannot dump credentials or
 *    raw applicant data into the log stream.
 *
 * Production emits JSON lines for ingestion; development emits a readable line.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const activeLevel: LogLevel =
  (process.env.LOG_LEVEL as LogLevel | undefined) ?? (config.nodeEnv === "production" ? "info" : "debug");

const isProduction = config.nodeEnv === "production";

export interface LogContext {
  [key: string]: unknown;
}

const serialiseError = (error: unknown): LogContext => {
  if (error instanceof Error) {
    return {
      name: error.name,
      // Provider errors routinely quote the offending request body, so the
      // message and stack are masked like any other free-form field.
      message: maskPiiText(error.message),
      stack: error.stack ? maskPiiText(error.stack) : undefined,
    };
  }
  return { message: maskPiiText(String(error)) };
};

const safeContext = (context?: LogContext): LogContext => {
  if (!context) return {};

  const { error, ...rest } = context;
  const masked = maskPiiPayload(rest) as LogContext;

  return error === undefined ? masked : { ...masked, error: serialiseError(error) };
};

const emit = (level: LogLevel, scope: string, message: string, context?: LogContext): void => {
  if (LEVEL_RANK[level] < LEVEL_RANK[activeLevel]) return;

  const masked = safeContext(context);
  // console is the transport, not the interface — swapping in a log shipper
  // later only changes the two lines below.
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;

  if (isProduction) {
    sink(JSON.stringify({ timestamp: new Date().toISOString(), level, scope, message, ...masked }));
    return;
  }

  const detail = Object.keys(masked).length > 0 ? masked : "";
  sink(`[${level}] ${scope}: ${message}`, detail);
};

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(childScope: string): Logger;
}

/**
 * Create a logger bound to a scope, e.g. `createLogger("orchestration.planner")`.
 * Scope should identify the module, not the run — per-run identifiers belong in
 * the context object so they stay queryable.
 */
export const createLogger = (scope: string): Logger => ({
  debug: (message, context) => emit("debug", scope, message, context),
  info: (message, context) => emit("info", scope, message, context),
  warn: (message, context) => emit("warn", scope, message, context),
  error: (message, context) => emit("error", scope, message, context),
  child: childScope => createLogger(`${scope}.${childScope}`),
});
