import { useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { postAction } from '../api/client';
import { PLATFORM_CORE_URL } from '../config';
import { setSheetTranslations, useLang } from './translator';

// EN / عربي switch (top bar on a computer, More sheet on a phone). The
// language is kept on this device.
export function LangToggle({ className, testid }: { className: string; testid?: string }) {
  const [lang, setLang] = useLang();
  const ar = lang === 'ar';
  return (
    <button
      type="button"
      className={className}
      data-no-translate=""
      data-testid={testid}
      aria-label={ar ? 'Switch to English' : 'التبديل إلى العربية'}
      title={ar ? 'English' : 'عربي'}
      onClick={() => setLang(ar ? 'en' : 'ar')}
    >
      <span className={ar ? '' : 'lang-on'}>EN</span> <span className="shell-topbar-lang-sep">/</span> <span className={ar ? 'lang-on' : ''} lang="ar">عربي</span>
    </button>
  );
}

// After sign-in: the App Owner's Arabic from Platform Core's TRANSLATIONS
// sheet (wins over the draft list); kept on the device for offline use.
export function TranslationsLoader() {
  const { sessionToken } = useAuth();
  useEffect(() => {
    if (!sessionToken) return;
    let cancelled = false;
    postAction<{ terms: { key: string; en: string; ar: string; status?: string }[] }>(PLATFORM_CORE_URL, 'getTranslations', { sessionToken })
      .then((r) => {
        if (!cancelled && r && Array.isArray(r.terms)) setSheetTranslations(r.terms);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sessionToken]);
  return null;
}
