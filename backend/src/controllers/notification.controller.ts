import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth.middleware";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "../services/notifications/notification.service";

export const listNotificationsHandler = async (req: AuthenticatedRequest, res: Response) => {
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 30));
  return res.json(await listNotifications(req.user!, limit));
};

export const markNotificationReadHandler = async (req: AuthenticatedRequest, res: Response) => {
  const updated = await markNotificationRead(req.user!, req.params.id);
  if (!updated) return res.status(404).json({ error: "NOTIFICATION_NOT_FOUND" });
  return res.json({ id: req.params.id, read: true });
};

export const markAllNotificationsReadHandler = async (req: AuthenticatedRequest, res: Response) => {
  const count = await markAllNotificationsRead(req.user!);
  return res.json({ markedRead: count });
};
