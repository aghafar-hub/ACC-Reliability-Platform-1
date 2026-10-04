import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useEmbeddedNav } from '../embeddedNav';
import { Icon } from '../icons';
import {
  getInAppNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type InAppNotification,
} from '../api/oilLubrication';
import './NotificationBell.css';

const POLL_INTERVAL_MS = 60000;

// Patch 15 ("in app notification... must have one at the top right... the
// notification is related to [the whole] platform not only lubrication" —
// the user's own words): a single bell, mounted once at the shell level
// (see App.tsx's ShellRoot), visible no matter which tab is open. Every
// event it shows today happens to originate in Oil Lubrication (routine
// assigned/submitted/approved, aging-actions digest, low-stock digest —
// the same five events Notifications.js's emails already cover), but the
// bell itself is platform-level: it fetches straight from
// InAppNotifications.js on the Oil Lubrication backend (frontend/src/api/
// oilLubrication.ts, same client My Work's native routine list uses) rather
// than living inside that embedded app, so a future module's notifications
// could feed the same feed without moving this component.
//
// Clicking a notification both marks it read and navigates to wherever
// it's about: a routine-related one deep-links to that exact routine (see
// embeddedNav.tsx's navigate(pageId, recordId) and Routines.jsx's
// initialRoutineId); a digest (aging actions / low stock) lands on the
// relevant list page itself, since a digest has no single record to open.
// onOpenRoutine is for TechnicianShell: that shell never mounts the
// embedded apps/oil-analysis bundle at all (no Sidebar, nothing to
// navigate into — see TechnicianShell.tsx's own comment), so a
// routine-assigned notification there can't deep-link through
// embeddedNav.navigateTo like the normal shell's bell does below. When
// this prop is given, clicking a "routines" notification calls it with
// the routine id instead of the embeddedNav path, so TechnicianShell can
// open that routine straight in its own My Work list.
export default function NotificationBell({ onOpenRoutine }: { onOpenRoutine?: (routineId: string) => void } = {}) {
  const { sessionToken, claims } = useAuth();
  const navigate = useNavigate();
  const embeddedNav = useEmbeddedNav();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    if (!sessionToken || !claims?.email) return;
    try {
      const result = await getInAppNotifications(sessionToken, 30);
      setNotifications(result.notifications);
      setUnreadCount(result.unreadCount);
    } catch {
      // Best-effort — a failed poll just tries again next interval, same as
      // the rest of this shell's background sync.
    }
  }, [sessionToken, claims?.email]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  // Close the dropdown on an outside click, or on Escape -- the trigger is a
  // real <button> so keyboard users can open this panel, but had no
  // keyboard-only way to close it again.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!sessionToken || !claims?.email) return null;

  async function handleOpen(n: InAppNotification) {
    // Optimistic — the bell's own next poll self-corrects if this blind
    // POST silently fails (see markNotificationRead's own comment).
    setNotifications((prev) => prev.map((x) => (x.notificationId === n.notificationId ? { ...x, read: true } : x)));
    setUnreadCount((prev) => Math.max(0, prev - (n.read ? 0 : 1)));
    setOpen(false);
    if (!n.read) markNotificationRead(sessionToken as string, n.notificationId).catch(() => {});

    if (n.linkPage === 'routines' && n.linkRecordId && onOpenRoutine) {
      onOpenRoutine(n.linkRecordId);
    } else if (n.linkPage) {
      navigate('/oil-analysis');
      embeddedNav.navigateTo('oil-analysis', n.linkPage, n.linkRecordId || undefined);
    }
  }

  async function handleMarkAllRead() {
    setNotifications((prev) => prev.map((x) => ({ ...x, read: true })));
    setUnreadCount(0);
    markAllNotificationsRead(sessionToken as string).catch(() => {});
  }

  return (
    <div className="notif-bell" ref={containerRef}>
      <button
        type="button"
        className="notif-bell-trigger"
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Icon name="bell" size={20} />
        {unreadCount > 0 && <span className="notif-bell-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>

      {open && (
        <div className="notif-bell-panel">
          <div className="notif-bell-panel-header">
            <span>Notifications</span>
            {unreadCount > 0 && (
              <button type="button" className="notif-bell-markall" onClick={handleMarkAllRead}>
                Mark all read
              </button>
            )}
          </div>
          <div className="notif-bell-list">
            {notifications.length === 0 && <div className="notif-bell-empty">No notifications yet.</div>}
            {notifications.map((n) => (
              <button
                type="button"
                key={n.notificationId}
                className={`notif-bell-item${n.read ? '' : ' unread'}`}
                onClick={() => handleOpen(n)}
              >
                <span className="notif-bell-dot" />
                <span className="notif-bell-item-body">
                  <span className="notif-bell-message">{n.message}</span>
                  <span className="notif-bell-time">{formatRelative(n.createdDate)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
