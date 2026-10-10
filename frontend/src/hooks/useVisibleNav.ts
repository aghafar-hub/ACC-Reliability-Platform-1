import { useMemo } from 'react';
import { NAV_ITEMS, type NavItem } from '../navigation';
import { canOpenModule, tabLevel, useModuleAccess } from '../moduleAccess';
import { useAuth } from '../auth/AuthContext';

/**
 * NAV_ITEMS minus what Module Access hides for this person: a module they
 * can't open (not added, or switched Off) and any of its tabs set to Hidden.
 * A module left with no visible tab at all is dropped too.
 */
export function useVisibleNav(): NavItem[] {
  const { access } = useModuleAccess();
  const { claims } = useAuth();
  const roles = claims?.roles;
  return useMemo(
    () =>
      NAV_ITEMS.flatMap((item) => {
        if (item.roles && !item.roles.some((r) => (roles || []).includes(r))) return [];
        if (!item.moduleId) return [item];
        const a = access[item.moduleId];
        if (!canOpenModule(a)) return [];
        const subTabs = (item.subTabs || []).filter((t) => tabLevel(a, t.id) !== 'Hidden');
        if (item.subTabs?.length && subTabs.length === 0) return [];
        return [{ ...item, subTabs }];
      }),
    [access, roles],
  );
}

/** The first tab of a module this person can see, or null. */
export function firstVisibleTab(item: NavItem | undefined): string | null {
  return item?.subTabs?.[0]?.id ?? null;
}
