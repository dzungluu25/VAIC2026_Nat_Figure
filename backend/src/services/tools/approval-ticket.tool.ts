import { randomUUID } from "crypto";

/** Legacy local adapter. This ID is not evidence of a Core Banking write. */
export const createApprovalTicket = async (details: Record<string, unknown>): Promise<Record<string, unknown>> => ({
  ticketId: `LOCAL-NONBANK-${randomUUID()}`,
  status: "LOCAL_ONLY",
  persistedToCoreBanking: false,
  details,
});
