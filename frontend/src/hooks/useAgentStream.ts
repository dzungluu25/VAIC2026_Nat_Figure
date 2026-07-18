import { useCallback, useRef } from "react";
import { useOrchestrationStore } from "../store/orchestrationStore";
import { streamOrchestration } from "../services/orchestrationService";
import { getDemoAccessToken } from "../services/authService";
import { ApiError } from "../services/httpClient";
import type { OrchestrationRequestBody, RetailCaseInput } from "../types/api";

/** Kicks off a streamed orchestration run and pipes every NDJSON event into the orchestration store. */
export const useAgentStream = () => {
  const phase = useOrchestrationStore(s => s.phase);
  const startRun = useOrchestrationStore(s => s.startRun);
  const applyStreamEvent = useOrchestrationStore(s => s.applyStreamEvent);
  const fail = useOrchestrationStore(s => s.fail);
  const abortRef = useRef<AbortController | null>(null);

  const runRequest = useCallback(
    async (request: OrchestrationRequestBody, displayPrompt: string, approvalToken?: string) => {
      if (!displayPrompt.trim()) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      startRun(displayPrompt);
      try {
        const token = await getDemoAccessToken();
        await streamOrchestration(request, token, approvalToken, applyStreamEvent, controller.signal);
      } catch (err) {
        if (controller.signal.aborted) return;
        fail(err instanceof ApiError ? err.message : "Không thể kết nối tới máy chủ điều phối.");
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [startRun, applyStreamEvent, fail]
  );

  const run = useCallback(
    async (prompt: string, approvalToken?: string) => {
      if (!prompt.trim()) return;
      await runRequest({ prompt }, prompt, approvalToken);
    },
    [runRequest]
  );

  const runStructuredCase = useCallback(
    async (retailCase: RetailCaseInput, approvalToken?: string) => {
      const displayPrompt = `Structured form submission: ${retailCase.requestedLoan.amount} VND over ${retailCase.requestedLoan.tenureYears} years`;
      await runRequest({ retailCase }, displayPrompt, approvalToken);
    },
    [runRequest]
  );

  return { run, runStructuredCase, phase };
};
