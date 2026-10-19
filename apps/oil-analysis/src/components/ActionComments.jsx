import { useCallback, useEffect, useState } from "react";
import { useTheme } from "../ThemeContext";
import { FormSection } from "./ModalShell";

// Comments on an action, one per person (backend ActionComments.js): each
// shows who wrote it (name, organisation, role) and when; your own are
// marked "You" and can be deleted. Ctrl+Enter posts. Visitors read only.
// Same file in the Oil and Vibration apps; the page passes the calls:
//   load() → { comments, canComment }, add(text) / remove(id) → { comments }
export default function ActionComments({ load, add, remove, onCount, testid = "action-comments" }) {
  const { T, s } = useTheme();
  const [list, setList] = useState(null);
  const [canComment, setCanComment] = useState(true);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const show = useCallback(
    (d) => {
      const c = (d && d.comments) || [];
      setList(c);
      onCount?.(c.length);
    },
    [onCount],
  );
  useEffect(() => {
    let live = true;
    load()
      .then((d) => {
        if (!live) return;
        show(d);
        if (d && d.canComment === false) setCanComment(false);
      })
      .catch((e) => live && (setList([]), setError(String(e.message || e))));
    return () => {
      live = false;
    };
    // load once per action
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const post = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setError("");
    try {
      show(await add(t));
      setText("");
    } catch (e) {
      setError(String(e.message || e));
    }
    setBusy(false);
  };
  const del = async (id) => {
    if (busy || !window.confirm("Delete this comment?")) return;
    setBusy(true);
    setError("");
    try {
      show(await remove(id));
    } catch (e) {
      setError(String(e.message || e));
    }
    setBusy(false);
  };

  const n = list ? list.length : 0;
  return (
    <FormSection icon="messages" title="Comments" hint={list ? (n ? `${n} comment${n === 1 ? "" : "s"}` : "none yet") : ""} testid={testid}>
      {list === null ? (
        <span style={{ fontSize: 13, color: T.textSecondary }}>Loading…</span>
      ) : (
        list.map((c) => <Comment key={c.id} T={T} c={c} onDelete={() => del(c.id)} busy={busy} />)
      )}
      {canComment ? (
        <div style={{ marginTop: n ? 12 : 0 }}>
          <textarea
            style={{ ...s.input, minHeight: 60, width: "100%", resize: "vertical", fontFamily: "inherit" }}
            placeholder="Write a comment…"
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                post();
              }
            }}
            data-testid={`${testid}-text`}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
            <span style={{ fontSize: 12, color: T.textMuted, flex: 1 }}>Everyone on this action sees it and gets a notice.</span>
            <button type="button" onClick={post} disabled={busy || !text.trim()} style={{ ...s.btnPrimary, opacity: busy || !text.trim() ? 0.55 : 1 }} data-testid={`${testid}-post`}>
              <i className="ti ti-send" aria-hidden="true" style={{ marginRight: 5 }} />
              {busy ? "Posting…" : "Post comment"}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: T.textSecondary, marginTop: n ? 10 : 0 }}>Visitors can read comments but not add them.</div>
      )}
      {error && (
        <div role="alert" style={{ color: T.danger, fontSize: 13, marginTop: 8 }} data-testid={`${testid}-error`}>
          {error}
        </div>
      )}
    </FormSection>
  );
}

function initials(name) {
  const w = String(name || "?").replace(/[._-]+/g, " ").trim().split(/\s+/);
  return ((w[0] || "?")[0] + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase();
}

function Comment({ T, c, onDelete, busy }) {
  const when = c.at ? new Date(c.at) : null;
  const tone = c.org === "ACC" ? T.accent : T.info || T.accent;
  return (
    <div style={{ display: "flex", gap: 10, padding: "9px 0", borderTop: `1px solid ${T.border}` }} data-testid={`comment-${c.id}`}>
      <span
        aria-hidden="true"
        style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, background: tone + "22", color: tone, fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        {initials(c.name)}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 12.5 }}>
          <b style={{ color: T.textPrimary }}>{c.name}</b>
          {c.mine && <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: T.accent, color: "#fff" }}>You</span>}
          {c.org && <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: tone + "1A", color: tone }}>{c.org}</span>}
          {c.role && <span style={{ color: T.textMuted }}>{c.role}</span>}
          <span style={{ color: T.textMuted, marginLeft: "auto" }}>{when && !isNaN(when) ? when.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : ""}</span>
          {c.mine && (
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              title="Delete my comment"
              aria-label="Delete my comment"
              style={{ border: 0, background: "none", color: T.textMuted, cursor: "pointer", padding: "0 2px", fontSize: 14 }}
              data-testid={`comment-del-${c.id}`}
            >
              <i className="ti ti-trash" aria-hidden="true" />
            </button>
          )}
        </div>
        <div style={{ fontSize: 13, color: T.textPrimary, marginTop: 3, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{c.text}</div>
      </div>
    </div>
  );
}

// The small "💬 3" on an action card.
export function CommentCount({ n }) {
  const { T } = useTheme();
  if (!n) return null;
  return (
    <span title={`${n} comment${n === 1 ? "" : "s"}`} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, color: T.textSecondary }}>
      <i className="ti ti-message-circle" aria-hidden="true" />
      {n}
    </span>
  );
}
