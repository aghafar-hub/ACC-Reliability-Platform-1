import { useEmbeddedNav } from "../embeddedNav";
import { Icon } from "../icons";
import { MODULE_TABS } from "../navigation";
import { useOnlineStatus } from "../useOnlineStatus";
import "./OfflineBanner.css";

// PWA item 26: when the connection drops, say so plainly under the top bar —
// how old the data on screen is and how many entries are waiting to send —
// instead of only a small grey dot. Once back online it stays (in blue)
// until the waiting entries have gone.
function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? time
    : `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, ${time}`;
}

export default function OfflineBanner() {
  const online = useOnlineStatus();
  const embeddedNav = useEmbeddedNav();
  const infos = MODULE_TABS.map((m) =>
    embeddedNav.syncInfoFor(m.moduleId),
  ).filter((i) => i !== null);
  const waiting = infos.reduce((n, i) => n + (i.pendingSyncCount || 0), 0);
  // oldest of the modules' last syncs = the oldest data that may be on screen
  const last = infos
    .map((i) => i.lastSyncAt)
    .filter((t): t is string => !!t)
    .sort()[0];
  const entries = `${waiting} ${waiting === 1 ? "entry" : "entries"}`;

  if (online && waiting === 0) return null;
  if (online) {
    return (
      <div
        className="offline-banner offline-banner--sending"
        role="status"
        data-testid="offline-banner"
      >
        <Icon name="sync" size={16} />
        <span>Back online — sending {entries} saved while offline…</span>
      </div>
    );
  }
  return (
    <div className="offline-banner" role="status" data-testid="offline-banner">
      <Icon name="wifiOff" size={16} />
      <span>
        <b>Offline</b>
        {last
          ? ` — showing data from ${fmtTime(last)}.`
          : " — showing the data saved on this device."}
        {waiting > 0
          ? ` ${entries} waiting; they'll send when you're back online.`
          : " You can keep working; new entries wait and send later."}
      </span>
    </div>
  );
}
