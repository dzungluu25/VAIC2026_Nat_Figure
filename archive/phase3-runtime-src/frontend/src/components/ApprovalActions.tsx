"use client";

import { useState } from "react";
import { Badge } from "./primitives/Badge";
import { Button } from "./primitives/Button";
import { browserApiBase } from "../lib/api";

type ApprovalState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "approved"; message: string }
  | { status: "error"; message: string };

interface ApprovalActionsProps {
  requestId: string;
  approvalIntent: string;
  readyForApproval: boolean;
}

export const ApprovalActions = ({ requestId, approvalIntent, readyForApproval }: ApprovalActionsProps) => {
  const [state, setState] = useState<ApprovalState>({ status: "idle" });

  const approve = async () => {
    setState({ status: "submitting" });
    const response = await fetch(`${browserApiBase()}/api/requests/${requestId}/approve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer demo-approval-token",
      },
      body: JSON.stringify({
        reviewerId: "reviewer.lan",
        reviewerRole: "SENIOR_CREDIT_REVIEWER",
        decision: "APPROVE",
        approvalIntent,
        idempotencyKey: `ui-${requestId}`,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setState({ status: "error", message: payload.error ?? `HTTP ${response.status}` });
      return;
    }

    const run = (await response.json()) as { status: string; executionActions?: Array<{ status: string }> };
    setState({
      status: "approved",
      message: `Approved. Lifecycle=${run.status}; actions=${run.executionActions?.length ?? 0}.`,
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-n900">Reviewer action</span>
        <Badge variant={readyForApproval ? "warning" : "default"}>
          {readyForApproval ? "READY" : "LOCKED"}
        </Badge>
      </div>

      <Button
        variant="primary"
        className="w-full"
        disabled={!readyForApproval || state.status === "submitting" || state.status === "approved"}
        onClick={approve}
      >
        {state.status === "submitting" ? "Approving..." : state.status === "approved" ? "Approved" : "Approve"}
      </Button>

      {state.status === "approved" && <p className="text-sm text-success">{state.message}</p>}
      {state.status === "error" && <p className="text-sm text-error">{state.message}</p>}
    </div>
  );
};
