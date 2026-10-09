import { useCallback, useEffect, useRef, useState } from 'react';
import { useBackClose } from '../mobile/useBackClose';
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
import { getVibNotifications, markVibNotificationsRead } from '../api/vibration';
import './NotificationBell.css';

const POLL_INTERVAL_MS = 60000;

// One feed for the whole platform: Oil Lubrication's and Vibration's own
// notices (each module keeps its list), merged newest first. `module` says
// which backend to mark read and where a tap opens.
type BellItem = InAppNotification & { module: 'oil' | 'vib' };

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
  // The phone's bottom bar has an "Alerts" button (BottomNav.tsx) — it opens
  // this same panel instead of a second notifications screen.
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener('acc:open-notifications', show);
    return () => window.removeEventListener('acc:open-notifications', show);
  }, []);
  const [notifications, setNotifications] = useState<BellItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // the phone's bottom bar shows the same count on Alerts
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('acc:unread', { detail: unreadCount }));
  }, [unreadCount]);
  // phone back gesture closes the panel
  useBackClose(open, () => setOpen(false));

  const refresh = useCallback(async () => {
    if (!sessionToken || !claims?.email) return;
    // Each module on its own: one that fails (offline, not set up, no
    // access) just leaves its part out until the next poll.
    const [oil, vib] = await Promise.all([
      getInAppNotifications(sessionToken, 30).catch(() => null),
      getVibNotifications(sessionToken, 30).catch(() => null),
    ]);
    if (!oil && !vib) return;
    const items: BellItem[] = [
      ...(oil?.notifications || []).map((n) => ({ ...n, module: 'oil' as const })),
      ...(vib?.notifications || []).map((n) => ({ ...n, module: 'vib' as const })),
    ].sort((a, b) => String(b.createdDate).localeCompare(String(a.createdDate)));
    setNotifications(items.slice(0, 40));
    setUnreadCount((oil?.unreadCount || 0) + (vib?.unreadCount || 0));
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

  async function handleOpen(n: BellItem) {
    // Optimistic — the bell's own next poll self-corrects if this blind
    // POST silently fails (see markNotificationRead's own comment).
    setNotifications((prev) => prev.map((x) => (x.notificationId === n.notificationId ? { ...x, read: true } : x)));
    setUnreadCount((prev) => Math.max(0, prev - (n.read ? 0 : 1)));
    setOpen(false);
    if (!n.read) {
      if (n.module === 'vib') markVibNotificationsRead(sessionToken as string, n.notificationId).catch(() => {});
      else markNotificationRead(sessionToken as string, n.notificationId).catch(() => {});
    }

    if (n.linkPage === 'idcheck') {
      // a module found IDs that don't match the platform list (App Owner)
      navigate('/settings?tab=equipment-ids');
    } else if (n.linkPage === 'mywork') {
      // delegation started / ended — the cover shows in My Work
      navigate('/my-work');
    } else if (n.module === 'vib') {
      if (n.linkPage === 'mywork-route' && n.linkRecordId) {
        // the technician's checklist lives in My Work
        if (!onOpenRoutine) navigate(`/my-work?vibRoute=${encodeURIComponent(n.linkRecordId)}`);
        window.dispatchEvent(new CustomEvent('acc:open-vib-route', { detail: n.linkRecordId }));
      } else if (n.linkPage) {
        navigate('/vibration-analysis');
        embeddedNav.navigateTo('vibration-analysis', n.linkPage, n.linkRecordId || undefined);
      }
    } else if (n.linkPage === 'routines' && n.linkRecordId && onOpenRoutine) {
      onOpenRoutine(n.linkRecordId);
    } else if (n.linkPage) {
      navigate('/oil-lubrication');
      embeddedNav.navigateTo('oil-analysis', n.linkPage, n.linkRecordId || undefined);
    }
  }

  async function handleMarkAllRead() {
    setNotifications((prev) => prev.map((x) => ({ ...x, read: true })));
    setUnreadCount(0);
    markAllNotificationsRead(sessionToken as string).catch(() => {});
    markVibNotificationsRead(sessionToken as string, null).catch(() => {});
  }

  const shown = onlyUnread ? notifications.filter((n) => !n.read) : notifications;
  const groups: { label: string; items: BellItem[] }[] = [];
  shown.forEach((n) => {
    const label = dayGroup(n.createdDate);
    const g = groups.find((x) => x.label === label);
    if (g) g.items.push(n);
    else groups.push({ label, items: [n] });
  });

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
        <div className="notif-bell-panel" role="dialog" aria-label="Notifications">
          <div className="notif-bell-panel-header">
            <span className="notif-bell-title">
              Notifications
              {unreadCount > 0 && <span className="notif-bell-count">{unreadCount} new</span>}
            </span>
            <span className="notif-bell-header-actions">
              {unreadCount > 0 && (
                <button type="button" className="notif-bell-markall" onClick={handleMarkAllRead}>
                  Mark all read
                </button>
              )}
              <button type="button" className="notif-bell-close" onClick={() => setOpen(false)} aria-label="Close notifications">
                <Icon name="close" size={16} />
              </button>
            </span>
          </div>
          <div className="notif-bell-filters" role="group" aria-label="Show">
            {[
              { id: false, label: `All ${notifications.length}` },
              { id: true, label: `Unread ${unreadCount}` },
            ].map((f) => (
              <button
                key={String(f.id)}
                type="button"
                aria-pressed={onlyUnread === f.id}
                className={`notif-bell-chip${onlyUnread === f.id ? ' on' : ''}`}
                onClick={() => setOnlyUnread(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="notif-bell-list">
            {shown.length === 0 && (
              <div className="notif-bell-empty">
                <span className="notif-bell-empty-icon">
                  <Icon name="bell" size={22} />
                </span>
                {onlyUnread ? "You're all caught up." : 'No notifications yet.'}
              </div>
            )}
            {groups.map((g) => (
              <div key={g.label}>
                <div className="notif-bell-group">{g.label}</div>
                {g.items.map((n) => {
                  const k = kindOf(n);
                  return (
                    <button
                      type="button"
                      key={n.notificationId}
                      className={`notif-bell-item${n.read ? '' : ' unread'}`}
                      onClick={() => handleOpen(n)}
                    >
                      <span className={`notif-bell-icon kind-${k.tone}`} aria-hidden="true">
                        <Icon name={k.icon} size={16} />
                      </span>
                      <span className="notif-bell-item-body">
                        <span className="notif-bell-message">{n.message}</span>
                        <span className="notif-bell-time">
                          {k.label}
                          {n.contractor ? ` · ${n.contractor}` : ''} · {formatRelative(n.createdDate)}
                        </span>
                      </span>
                      {!n.read && <span className="notif-bell-dot" aria-label="unread" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          {notifications.length > 0 && <div className="notif-bell-footer">Latest {notifications.length} · tap one to open it</div>}
        </div>
      )}
    </div>
  );
}

// What a notification is about, from its type: an icon, a colour and a
// short label for the line under the message.
type Kind = { icon: 'route' | 'action' | 'flask' | 'droplet' | 'bell' | 'graphs'; tone: 'route' | 'action' | 'lab' | 'stock' | 'late' | 'vib'; label: string };
function kindOf(n: BellItem): Kind {
  const t = (n.type || '').toLowerCase();
  if (t === 'delegation') return { icon: 'bell', tone: 'route', label: 'Delegation' };
  if (n.module === 'vib') {
    if (t.startsWith('vib-report')) return { icon: 'graphs', tone: 'vib', label: 'Vibration report' };
    if (t.startsWith('vib-action')) return { icon: 'action', tone: 'action', label: 'Vibration action' };
    if (t.startsWith('vib-route')) return { icon: 'route', tone: 'route', label: 'Vibration route' };
    return { icon: 'graphs', tone: 'vib', label: 'Vibration' };
  }
  if (t.includes('overdue') || t.includes('escalation') || t.includes('due-soon')) return { icon: 'bell', tone: 'late', label: t.includes('due-soon') ? 'Due soon' : 'Overdue' };
  if (t.startsWith('lab-report')) return { icon: 'flask', tone: 'lab', label: 'Lab report' };
  if (t.includes('stock') || t.includes('oil-equivalent')) return { icon: 'droplet', tone: 'stock', label: 'Oil stock' };
  if (t.startsWith('action') || t.includes('agreed-action')) return { icon: 'action', tone: 'action', label: 'Action' };
  if (t.startsWith('rout') || n.linkPage === 'routines') return { icon: 'route', tone: 'route', label: 'Route' };
  return { icon: 'bell', tone: 'route', label: 'Update' };
}

function dayGroup(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Earlier';
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (d.getTime() >= start) return 'Today';
  if (d.getTime() >= start - 86400000) return 'Yesterday';
  return 'Earlier';
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
