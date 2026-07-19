import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck } from "lucide-react";
import { useSessionStore } from "../store/sessionStore";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationRecord,
} from "../services/notificationService";
import styles from "./NotificationBell.module.css";

const POLL_INTERVAL_MS = 30_000;

const CATEGORY_LABEL: Record<NotificationRecord["category"], string> = {
  MISSING_DOCUMENTS: "Thiếu giấy tờ",
  FORM_REJECTED: "Sai mẫu",
  DOSSIER_COMPLETE: "Đã đủ hồ sơ",
  REVIEW_DECISION: "Kết quả xét duyệt",
};

const relativeTime = (iso: string): string => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return new Date(iso).toLocaleDateString("vi-VN");
};

export const NotificationBell = () => {
  const { accessToken } = useSessionStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [unread, setUnread] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (!accessToken) return;
    try {
      const data = await listNotifications(accessToken);
      setItems(data.notifications);
      setUnread(data.unreadCount);
    } catch {
      // Silent: the bell must never interrupt the app if the inbox is briefly unreachable.
    }
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    refresh();
    const timer = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [accessToken, refresh]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const openNotification = async (item: NotificationRecord) => {
    if (!accessToken) return;
    if (!item.read) {
      setItems(prev => prev.map(n => (n.id === item.id ? { ...n, read: true } : n)));
      setUnread(prev => Math.max(0, prev - 1));
      try {
        await markNotificationRead(accessToken, item.id);
      } catch {
        /* optimistic update already applied; next poll reconciles */
      }
    }
    if (item.dossierId) {
      setOpen(false);
      navigate(`/dossiers/${item.dossierId}`);
    }
  };

  const markAll = async () => {
    if (!accessToken || unread === 0) return;
    setItems(prev => prev.map(n => ({ ...n, read: true })));
    setUnread(0);
    try {
      await markAllNotificationsRead(accessToken);
    } catch {
      refresh();
    }
  };

  if (!accessToken) return null;

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        type="button"
        className={styles.bellButton}
        aria-label={`Thông báo${unread > 0 ? ` (${unread} chưa đọc)` : ""}`}
        aria-expanded={open}
        onClick={() => setOpen(prev => !prev)}
      >
        <Bell size={17} />
        {unread > 0 ? <span className={styles.badge}>{unread > 9 ? "9+" : unread}</span> : null}
      </button>

      {open ? (
        <div className={styles.panel} role="dialog" aria-label="Danh sách thông báo">
          <div className={styles.panelHead}>
            <strong>Thông báo</strong>
            {unread > 0 ? (
              <button type="button" className={styles.markAll} onClick={markAll}>
                <CheckCheck size={14} /> Đánh dấu đã đọc
              </button>
            ) : null}
          </div>
          <div className={styles.list}>
            {items.length === 0 ? (
              <p className={styles.empty}>Chưa có thông báo nào.</p>
            ) : (
              items.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className={[styles.item, item.read ? "" : styles.itemUnread].filter(Boolean).join(" ")}
                  onClick={() => openNotification(item)}
                >
                  <div className={styles.itemHead}>
                    <span className={styles.category}>{CATEGORY_LABEL[item.category] ?? item.category}</span>
                    <span className={styles.time}>{relativeTime(item.createdAt)}</span>
                  </div>
                  <span className={styles.title}>{item.title}</span>
                  <span className={styles.body}>{item.body}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};
