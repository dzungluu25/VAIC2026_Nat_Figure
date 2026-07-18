import { randomUUID } from "crypto";

export const createApprovalTicket = async (details: Record<string, unknown>): Promise<Record<string, unknown>> => {
  return {
    ticketId: `TKT-${randomUUID()}`,
    status: "CREATED",
    details,
  };
};
