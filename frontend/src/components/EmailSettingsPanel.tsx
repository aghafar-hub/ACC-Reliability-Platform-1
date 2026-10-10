import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/client';
import { getEmailSettings, saveEmailSettings, type EmailSettings, type EmailToggles } from '../api/platformCore';
import { Icon } from '../icons';
import './EmailSettingsPanel.css';

// Settings → Email & notifications (App Owner). One platform sender for
// every module; everything is off until the sender exists and "Send
// emails" is switched on. The bell is not affected. Each card saves on its
// own and shows who changed it last (also written to Activity).

function Switch({ on, onChange, disabled, label, testid }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string; testid?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={on ? 'em-switch em-switch--on' : 'em-switch'}
      disabled={disabled}
      onClick={() => onChange(!on)}
      data-testid={testid}
    >
      <span className="em-switch-knob" />
    </button>
  );
}

function Changed({ c }: { c?: { by: string; at: string } }) {
  if (!c || !c.by) return null;
  const d = new Date(c.at);
  return (
    <span className="em-changed">
      Last changed by {c.by}
      {isNaN(d.getTime()) ? '' : ' · ' + d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
    </span>
  );
}

export default function EmailSettingsPanel() {
  const { sessionToken } = useAuth();
  const [s, setS] = useState<EmailSettings | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ part: string; text: string; ok: boolean } | null>(null);
  // card drafts
  const [sender, setSender] = useState({ email: '', name: '' });
  const [events, setEvents] = useState<EmailToggles>({});
  const [digestTime, setDigestTime] = useState('07:00');
  const [mod, setMod] = useState('oil-analysis');

  const take = (r: EmailSettings) => {
    setS(r);
    setSender({ email: r.senderEmail, name: r.senderName });
    setEvents(JSON.parse(JSON.stringify(r.events)));
    setDigestTime(r.digestTime);
  };
  useEffect(() => {
    if (!sessionToken) return;
    getEmailSettings(sessionToken).then(take, (e) => setError(describeError(e, 'Could not load the email settings.')));
  }, [sessionToken]);

  async function save(part: 'sender' | 'switch' | 'events', enabled?: boolean) {
    if (!sessionToken || !s) return;
    setBusy(part);
    setMsg(null);
    try {
      const r =
        part === 'sender'
          ? await saveEmailSettings(sessionToken, { part, senderEmail: sender.email, senderName: sender.name })
          : part === 'switch'
            ? await saveEmailSettings(sessionToken, { part, enabled: !!enabled })
            : await saveEmailSettings(sessionToken, { part, events, digestTime });
      take(r);
      setMsg({ part, text: 'Saved.', ok: true });
    } catch (e) {
      setMsg({ part, text: describeError(e, 'Not saved — please try again.'), ok: false });
    } finally {
      setBusy('');
    }
  }

  if (error) return <div className="em-msg em-msg--error">{error}</div>;
  if (!s) return <p className="em-muted">Loading…</p>;

  const senderDirty = sender.email !== s.senderEmail || sender.name !== s.senderName;
  const eventsDirty = JSON.stringify(events) !== JSON.stringify(s.events) || digestTime !== s.digestTime;
  const module = s.modules.find((m) => m.id === mod) || s.modules[0];
  const onCount = (id: string) => Object.values(events[id] || {}).filter((x) => x.email || x.digest).length;
  const note = (part: string) =>
    msg && msg.part === part ? <span className={msg.ok ? 'em-note em-note--ok' : 'em-note em-note--error'}>{msg.text}</span> : null;
  const setEv = (key: string, kind: 'email' | 'digest', v: boolean) =>
    setEvents((all) => ({ ...all, [module.id]: { ...all[module.id], [key]: { ...all[module.id][key], [kind]: v } } }));

  return (
    <div className="em-panel" data-testid="email-settings">
      {!s.enabled && (
        <div className="em-banner" data-testid="em-off-banner">
          <Icon name="mailOff" size={20} />
          <span>
            <b>No emails are sent.</b> Oil and Vibration send nothing until the platform sender address is added and you switch emails on. The bell in the app still works.
          </span>
        </div>
      )}

      <section className="em-card">
        <div className="em-head">
          <span className="em-head-icon"><Icon name="send" size={17} /></span>
          <b>Platform sender</b>
          <span className="em-muted">One address sends for every module</span>
        </div>
        <div className="em-sender">
          <label className="em-field">
            <span>Sender email</span>
            <input
              type="email"
              value={sender.email}
              placeholder="reliability@… (to be created)"
              onChange={(e) => setSender({ ...sender, email: e.target.value })}
              data-testid="em-sender-email"
            />
          </label>
          <label className="em-field">
            <span>Display name</span>
            <input value={sender.name} onChange={(e) => setSender({ ...sender, name: e.target.value })} data-testid="em-sender-name" />
          </label>
          <button type="button" className="em-btn em-test" disabled title="Available once the platform sender exists">
            <Icon name="mail" size={15} /> Send test email
          </button>
        </div>
        <div className="em-foot">
          <span className="em-muted">
            Status:{' '}
            {s.senderEmail ? (
              <b className="em-status em-status--set">Added · not tested yet</b>
            ) : (
              <b className="em-status em-status--unset">Not set</b>
            )}{' '}
            {s.senderEmail ? '— the test email will check it works' : '— add the address when it exists; the test email checks it works'}
          </span>
          <span className="em-foot-right">
            <Changed c={s.changed.senderEmail} />
            {note('sender')}
            <button type="button" className="em-btn em-btn--primary" disabled={!senderDirty || !!busy} onClick={() => save('sender')} data-testid="em-save-sender">
              {busy === 'sender' ? 'Saving…' : 'Save'}
            </button>
          </span>
        </div>
      </section>

      <section className="em-card">
        <div className="em-head">
          <span className="em-head-icon"><Icon name="mail" size={17} /></span>
          <b>Send emails</b>
          <span className="em-head-right">
            <Switch
              on={s.enabled}
              disabled={!!busy || (!s.enabled && !s.senderEmail)}
              onChange={(v) => save('switch', v)}
              label="Send emails"
              testid="em-master"
            />
            <span className="em-onoff">{s.enabled ? 'On' : 'Off'}</span>
          </span>
        </div>
        <div className="em-foot em-foot--tight">
          <span className="em-muted">
            Master switch for all modules. Bell notifications are not affected.
            {!s.senderEmail && ' Add the platform sender first.'}
          </span>
          <span className="em-foot-right">
            <Changed c={s.changed.enabled} />
            {note('switch')}
          </span>
        </div>
      </section>

      <section className="em-card">
        <div className="em-head">
          <span className="em-head-icon"><Icon name="list" size={17} /></span>
          <b>What is sent</b>
          <span className="em-muted">Who receives comes from Module Access (responsible engineers, managers, technicians)</span>
          <span className="em-head-right em-chips">
            {s.modules.map((m) => (
              <button
                key={m.id}
                type="button"
                className={m.id === module.id ? 'em-chip em-chip--on' : 'em-chip'}
                onClick={() => setMod(m.id)}
                data-testid={`em-mod-${m.id}`}
              >
                {m.name}
                {onCount(m.id) > 0 && <span className="em-chip-count">{onCount(m.id)}</span>}
              </button>
            ))}
          </span>
        </div>
        <div className="em-table-wrap">
          <table className="em-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Email</th>
                <th>Daily digest</th>
              </tr>
            </thead>
            <tbody>
              {module.events.map((e) => {
                const v = events[module.id]?.[e.key] || { email: false, digest: false };
                return (
                  <tr key={e.key}>
                    <td>
                      <span className="em-ev">{e.label}</span>
                      <span className="em-to">{e.to}</span>
                    </td>
                    <td>
                      <Switch on={v.email} onChange={(x) => setEv(e.key, 'email', x)} label={`${e.label}: email`} testid={`em-${module.id}-${e.key}-email`} />
                    </td>
                    <td>
                      <Switch on={v.digest} onChange={(x) => setEv(e.key, 'digest', x)} label={`${e.label}: daily digest`} testid={`em-${module.id}-${e.key}-digest`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="em-foot">
          <span className="em-muted em-digest">
            Daily digest time
            <input type="time" value={digestTime} onChange={(e) => setDigestTime(e.target.value)} data-testid="em-digest-time" />
            · one email a day instead of one per event
          </span>
          <span className="em-foot-right">
            <Changed c={s.changed.events} />
            {note('events')}
            <button type="button" className="em-btn em-btn--primary" disabled={!eventsDirty || !!busy} onClick={() => save('events')} data-testid="em-save-events">
              {busy === 'events' ? 'Saving…' : 'Save'}
            </button>
          </span>
        </div>
        {!s.enabled && <p className="em-muted em-hint">You can choose events now; nothing is sent while “Send emails” is off.</p>}
      </section>
    </div>
  );
}
