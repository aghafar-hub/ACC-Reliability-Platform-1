import { useEmbeddedNav } from '../embeddedNav';
import { canOpenModule, tabLevel, useModuleAccess } from '../moduleAccess';
import './ModuleAccessNotice.css';

/**
 * What a person sees above (or instead of) an embedded module, per Phase 0's
 * Module Access settings: a full "no access" message, the maintenance
 * banner, a "this tab isn't available to you" cover, or a small view-only
 * note. Returns `blocked` so the caller can keep the module itself hidden.
 */
export function useModuleNotice(moduleId: string, moduleName: string) {
  const { access } = useModuleAccess();
  const embeddedNav = useEmbeddedNav();
  const a = access[moduleId];
  const page = embeddedNav.activePageFor(moduleId);

  if (!canOpenModule(a)) {
    const off = a?.status === 'Off';
    return {
      blocked: true,
      notice: (
        <div className="module-notice module-notice--full" role="status">
          <h2>{off ? `${moduleName} is switched off` : `You don't have access to ${moduleName}`}</h2>
          <p>
            {off
              ? a?.admin
                ? 'Switch it back on in Settings → General → Module Access.'
                : 'The App Owner has switched this module off for now.'
              : 'Ask the App Owner to add you to this module in Settings.'}
          </p>
        </div>
      ),
    };
  }

  const hiddenTab = !!page && tabLevel(a, page) === 'Hidden';
  const viewOnly = !!page && tabLevel(a, page) === 'View';
  const maintenance = a?.enforced && a.status === 'Maintenance';

  return {
    blocked: hiddenTab,
    notice: (
      <>
        {maintenance && (
          <div className="module-notice module-notice--maintenance" role="status">
            <strong>{moduleName} is being updated.</strong> You can look around, but changes can't be saved right now.
            {a?.version && <span className="module-notice-version"> Version: {a.version}</span>}
          </div>
        )}
        {hiddenTab && (
          <div className="module-notice module-notice--full" role="status">
            <h2>This page isn't available to you</h2>
            <p>Pick another page from the menu, or ask the App Owner for access.</p>
          </div>
        )}
        {viewOnly && !maintenance && (
          <div className="module-notice module-notice--viewonly" role="status">
            View only — you can look at this page but not change it.
          </div>
        )}
      </>
    ),
  };
}
