import { randomUUID } from "crypto";
import { pgQuery } from "../../config/pg";
import { AuthorizationContext } from "../../config/authorization";
import { createLogger } from "../observability/logger";

const logger = createLogger("notifications");

export type NotificationCategory =
  | "MISSING_DOCUMENTS"
  | "FORM_REJECTED"
  | "DOSSIER_COMPLETE"
  | "REVIEW_DECISION";

export interface NotificationRecord {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  dossierId: string | null;
  read: boolean;
  createdAt: string;
}

interface CreateNotificationInput {
  tenantId: string;
  recipientUserId?: string | null;
  recipientCustomerId?: string | null;
  category: NotificationCategory;
  title: string;
  body: string;
  dossierId?: string | null;
}

const mapRow = (row: any): NotificationRecord => ({
  id: row.id,
  category: row.category,
  title: row.title,
  body: row.body,
  dossierId: row.dossier_id ?? null,
  read: row.read_at !== null,
  createdAt: (row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at),
});

/**
 * Best-effort in-app notification. Like the missing-document email, a notification is a side-channel:
 * a failure here must never fail the dossier/document operation that triggered it, so callers should
 * not await this in a way that can reject the main flow (it swallows its own errors).
 */
export const createNotification = async (input: CreateNotificationInput): Promise<void> => {
  if (!input.recipientUserId && !input.recipientCustomerId) return;
  try {
    await pgQuery(
      `INSERT INTO notifications (id,tenant_id,recipient_user_id,recipient_customer_id,category,title,body,dossier_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        randomUUID(),
        input.tenantId,
        input.recipientUserId ?? null,
        input.recipientCustomerId ?? null,
        input.category,
        input.title,
        input.body,
        input.dossierId ?? null,
      ]
    );
  } catch (error) {
    logger.error("Notification insert failed (non-fatal)", { error });
  }
};

// Matches rows addressed to this caller: staff by user id, customer by customer id.
const recipientPredicate = (context: AuthorizationContext, startIndex: number): { sql: string; params: unknown[] } => {
  const params: unknown[] = [context.userId];
  let sql = `recipient_user_id=$${startIndex}`;
  if (context.customerId) {
    params.push(context.customerId);
    sql = `(${sql} OR recipient_customer_id=$${startIndex + 1})`;
  }
  return { sql, params };
};

export const listNotifications = async (
  context: AuthorizationContext,
  limit = 30
): Promise<{ notifications: NotificationRecord[]; unreadCount: number }> => {
  const recipient = recipientPredicate(context, 2);
  const rows = await pgQuery(
    `SELECT id,category,title,body,dossier_id,read_at,created_at FROM notifications
     WHERE tenant_id=$1 AND ${recipient.sql}
     ORDER BY created_at DESC LIMIT $${recipient.params.length + 2}`,
    [context.tenantId, ...recipient.params, limit]
  );
  const unread = await pgQuery(
    `SELECT COUNT(*)::int AS c FROM notifications WHERE tenant_id=$1 AND ${recipient.sql} AND read_at IS NULL`,
    [context.tenantId, ...recipient.params]
  );
  return { notifications: rows.rows.map(mapRow), unreadCount: unread.rows[0]?.c ?? 0 };
};

export const markNotificationRead = async (context: AuthorizationContext, id: string): Promise<boolean> => {
  const recipient = recipientPredicate(context, 3);
  const result = await pgQuery(
    `UPDATE notifications SET read_at=NOW()
     WHERE id=$1 AND tenant_id=$2 AND ${recipient.sql} AND read_at IS NULL RETURNING id`,
    [id, context.tenantId, ...recipient.params]
  );
  return result.rows.length > 0;
};

export const markAllNotificationsRead = async (context: AuthorizationContext): Promise<number> => {
  const recipient = recipientPredicate(context, 2);
  const result = await pgQuery(
    `UPDATE notifications SET read_at=NOW() WHERE tenant_id=$1 AND ${recipient.sql} AND read_at IS NULL RETURNING id`,
    [context.tenantId, ...recipient.params]
  );
  return result.rows.length;
};
