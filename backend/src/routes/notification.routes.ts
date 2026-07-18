import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware";
import {
  listNotificationsHandler,
  markAllNotificationsReadHandler,
  markNotificationReadHandler,
} from "../controllers/notification.controller";

// Any authenticated user reads their own inbox (recipient scoping is enforced in the service), so
// these need no extra permission beyond a valid session.
export const notificationRoutes = Router();
notificationRoutes.use(requireAuth());
notificationRoutes.get("/", listNotificationsHandler);
notificationRoutes.post("/read-all", markAllNotificationsReadHandler);
notificationRoutes.post("/:id/read", markNotificationReadHandler);
