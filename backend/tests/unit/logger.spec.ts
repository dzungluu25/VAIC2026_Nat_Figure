import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "@/services/observability/logger";

const captureLog = () => vi.spyOn(console, "log").mockImplementation(() => {});
const captureError = () => vi.spyOn(console, "error").mockImplementation(() => {});
const captureWarn = () => vi.spyOn(console, "warn").mockImplementation(() => {});

afterEach(() => vi.restoreAllMocks());

describe("structured logger", () => {
  it("scopes messages and routes errors to console.error", () => {
    const errorSink = captureError();
    createLogger("credit").error("stage failed");

    expect(errorSink).toHaveBeenCalledOnce();
    expect(errorSink.mock.calls[0][0]).toContain("credit: stage failed");
  });

  it("nests child scopes", () => {
    const sink = captureLog();
    createLogger("orchestration").child("planner").info("planning started");

    expect(sink.mock.calls[0][0]).toContain("orchestration.planner: planning started");
  });

  it("masks direct identifiers in context", () => {
    const sink = captureLog();
    createLogger("intake").info("case received", {
      caseId: "case-1",
      phone: "0912345678",
      email: "customer@example.com",
      cccd: "012345678901",
    });

    const context = sink.mock.calls[0][1] as Record<string, unknown>;
    expect(context.caseId).toBe("case-1");
    expect(context.phone).not.toBe("0912345678");
    expect(context.email).not.toBe("customer@example.com");
    expect(context.cccd).not.toBe("012345678901");
  });

  it("masks identifiers embedded in free-form context strings", () => {
    const sink = captureWarn();
    createLogger("intake").warn("rejected", { reason: "Khách hàng gọi từ 0912345678" });

    const context = sink.mock.calls[0][1] as Record<string, string>;
    expect(context.reason).not.toContain("0912345678");
  });

  it("serialises an Error instead of spreading it, and masks its message", () => {
    const errorSink = captureError();
    createLogger("provider").error("call failed", {
      error: new Error("rejected payload for customer@example.com"),
    });

    const context = errorSink.mock.calls[0][1] as { error: { name: string; message: string; stack?: string } };
    expect(context.error.name).toBe("Error");
    expect(context.error.message).not.toContain("customer@example.com");
    expect(context.error.stack).toBeTypeOf("string");
  });

  it("serialises a non-Error rejection value", () => {
    const errorSink = captureError();
    createLogger("provider").error("call failed", { error: "socket hang up" });

    const context = errorSink.mock.calls[0][1] as { error: { message: string } };
    expect(context.error.message).toBe("socket hang up");
  });

  it("omits the detail argument when there is no context", () => {
    const sink = captureLog();
    createLogger("server").info("listening");

    expect(sink.mock.calls[0][1]).toBe("");
  });
});
