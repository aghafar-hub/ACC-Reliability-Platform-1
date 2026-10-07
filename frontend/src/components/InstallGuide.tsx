import { useState } from "react";
import { Icon } from "../icons";
import { useInstall } from "../installPrompt";
import "./InstallGuide.css";

const DISMISS_KEY = "acc.installHintDismissed";

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function IosSteps() {
  return (
    <ol className="install-steps">
      <li>
        Tap <b>Share</b> <Icon name="share" size={15} /> at the bottom of
        Safari.
      </li>
      <li>
        Choose <b>Add to Home Screen</b>, then <b>Add</b>.
      </li>
      <li>
        Open ACC Reliability from its icon — it runs full screen and works
        offline.
      </li>
    </ol>
  );
}

// Phone only, shown once until dismissed: a small card above the bottom bar.
export function InstallBanner() {
  const { installed, canPrompt, ios, install } = useInstall();
  const [dismissed, setDismissed] = useState(readDismissed);
  const [showSteps, setShowSteps] = useState(false);
  if (installed || dismissed || (!canPrompt && !ios)) return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore — it just shows again next time
    }
  };
  return (
    <div
      className="install-banner"
      role="dialog"
      aria-label="Install the app"
      data-testid="install-banner"
    >
      <img
        src={`${import.meta.env.BASE_URL}icons/pwa-192.png`}
        alt=""
        width={40}
        height={40}
      />
      <div className="install-banner-text">
        <b>Install ACC Reliability</b>
        <span>
          Opens from your home screen, full screen, and keeps working offline.
        </span>
        {showSteps && <IosSteps />}
      </div>
      <div className="install-banner-actions">
        {canPrompt ? (
          <button
            type="button"
            className="install-btn"
            onClick={() => install().then((ok) => ok && dismiss())}
          >
            Install
          </button>
        ) : (
          !showSteps && (
            <button
              type="button"
              className="install-btn"
              onClick={() => setShowSteps(true)}
            >
              How
            </button>
          )
        )}
        <button type="button" className="install-later" onClick={dismiss}>
          Not now
        </button>
      </div>
    </div>
  );
}

// Settings → General → Appearance: always there, for anyone who said "Not now".
export function InstallCard() {
  const { installed, canPrompt, ios, install } = useInstall();
  return (
    <section className="install-card" data-testid="install-card">
      <h3>Install on this phone or computer</h3>
      {installed ? (
        <p>This device already runs the installed app.</p>
      ) : canPrompt ? (
        <>
          <p>
            Adds ACC Reliability to your home screen or Start menu. It opens
            full screen and keeps working offline.
          </p>
          <button
            type="button"
            className="install-btn"
            onClick={() => install()}
          >
            <Icon name="download" size={16} /> Install the app
          </button>
        </>
      ) : ios ? (
        <IosSteps />
      ) : (
        <p>
          In Chrome or Edge, open the browser menu and choose{" "}
          <b>Install ACC Reliability</b> (or <b>Add to Home screen</b> on
          Android). On iPhone, open this site in Safari and use{" "}
          <b>Share → Add to Home Screen</b>.
        </p>
      )}
    </section>
  );
}
