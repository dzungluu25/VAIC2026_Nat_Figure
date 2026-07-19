import { apiFetch } from "./httpClient";

export type NotificationCategory = "MISSING_DOCUMENTS" | "FORM_REJECTED" | "DOSSIER_COMPLETE" | "REVIEW_DECISION";

export interface NotificationRecord {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  dossierId: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationListResponse {
  notifications: NotificationRecord[];
  unreadCount: number;
}

export const listNotifications = (token: string): Promise<NotificationListResponse> =>
  apiFetch<NotificationListResponse>("/api/notifications", { token });

export const markNotificationRead = (token: string, id: string): Promise<{ id: string; read: boolean }> =>
  apiFetch(`/api/notifications/${encodeURIComponent(id)}/read`, { method: "POST", token });

export const markAllNotificationsRead = (token: string): Promise<{ markedRead: number }> =>
  apiFetch("/api/notifications/read-all", { method: "POST", token });
