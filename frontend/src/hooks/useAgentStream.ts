import { useCallback, useRef } from "react";
import { useOrchestrationStore } from "../store/orchestrationStore";
import { streamOrchestration } from "../services/orchestrationService";
import { getDemoAccessToken } from "../services/authService";
import { ApiError } from "../services/httpClient";

/** Kicks off a streamed orchestration run and pipes every NDJSON event into the orchestration store. */
export const useAgentStream = () => {
  const phase = useOrchestrationStore(s => s.phase);
  const startRun = useOrchestrationStore(s => s.startRun);
  const applyStreamEvent = useOrchestrationStore(s => s.applyStreamEvent);
  const fail = useOrchestrationStore(s => s.fail);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (prompt: string, approvalToken?: string) => {
      if (!prompt.trim()) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      startRun(prompt);
      try {
        const token = await getDemoAccessToken();
        await streamOrchestration(prompt, token, approvalToken, applyStreamEvent, controller.signal);
      } catch (err) {
        fail(err instanceof ApiError ? err.message : "Không thể kết nối tới máy chủ điều phối.");
      }
    },
    [startRun, applyStreamEvent, fail]
  );

  return { run, phase };
};
