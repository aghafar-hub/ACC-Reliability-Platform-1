import { useNavigate } from 'react-router-dom';
import { useEmbeddedNav } from '../embeddedNav';
import { canOpenModule, tabLevel, useModuleAccess } from '../moduleAccess';
import StateCard, { StateIcon } from './StateCard';
import './ModuleAccessNotice.css';

/**
 * What a person sees above (or instead of) an embedded module, per Phase 0's
 * Module Access settings: a full "no access" message, the maintenance
 * banner, a "this tab isn't available to you" cover, or a small view-only
 * note. Returns `blocked` so the caller can keep the module itself hidden.
 * The full messages are StateCards (brand band, who to ask, where to go).
 */
export function useModuleNotice(moduleId: string, moduleName: string) {
  const { access } = useModuleAccess();
  const embeddedNav = useEmbeddedNav();
  const a = access[moduleId];
  const page = embeddedNav.activePageFor(moduleId);
  const navigate = useNavigate();
  const toPlant = { label: 'Go to Plant overview', onClick: () => navigate('/') };

  if (!canOpenModule(a)) {
    const off = a?.status === 'Off';
    return {
      blocked: true,
      notice: off ? (
        <StateCard
          testid="module-off"
          icon="power"
          tone="grey"
          eyebrow={moduleName}
          title="This module is switched off"
          text={`The Admin has switched ${moduleName} off for now. Your data is safe and nothing has been deleted.`}
          hint={
            a?.admin ? (
              <>
                Admin: switch it back on in <b>Settings → General → Module Access</b>.
              </>
            ) : undefined
          }
          primary={toPlant}
        />
      ) : (
        <StateCard
          testid="module-no-access"
          icon="lock"
          eyebrow={moduleName}
          title="You don't have access yet"
          text="Your account is active, but you have not been added to this module."
          hint={
            <>
              Ask the Admin to add you in <b>Settings → Module Access</b>. You will see it in the menu the next time you open the app.
            </>
          }
          primary={toPlant}
          secondary={{ label: 'Open My Work', onClick: () => navigate('/my-work') }}
        />
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
          <div className="maint-banner" role="status" data-testid="maintenance-banner">
            <div className="maint-banner-icon">
              <StateIcon name="gear" size={24} />
            </div>
            <div>
              <b>{moduleName} is being updated</b>
              <span>You can look around, but changes can't be saved right now. We'll be back shortly.</span>
            </div>
            {a?.version && (
              <div className="maint-banner-ver" data-no-translate="">
                Version {a.version}
              </div>
            )}
          </div>
        )}
        {hiddenTab && (
          <StateCard
            testid="page-not-available"
            icon="eye-off"
            tone="grey"
            eyebrow={moduleName}
            title="This page isn't available to you"
            text="Your role does not include this page. Pick another page from the menu."
            hint="If you need it for your work, ask the Admin for access."
            primary={{ label: `Back to ${moduleName} dashboard`, onClick: () => embeddedNav.navigateTo(moduleId, 'dashboard') }}
            secondary={{ label: 'Go back', onClick: () => navigate(-1) }}
          />
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
