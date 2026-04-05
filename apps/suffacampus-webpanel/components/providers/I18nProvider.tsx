'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { Locale, TranslationKeys, TranslationKey } from '@/lib/i18n';
import {
  SUPPORTED_LOCALES,
  getPersistedLocale,
  loadTranslations,
  persistLocale,
  resolveKey,
} from '@/lib/i18n';

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

interface I18nContextValue {
  locale: Locale;
  translations: TranslationKeys | null;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
  isLoading: boolean;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');
  const [translations, setTranslations] = useState<TranslationKeys | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load initial locale from localStorage
  useEffect(() => {
    const persisted = getPersistedLocale();
    setLocaleState(persisted);
  }, []);

  // Load translations whenever locale changes
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    loadTranslations(locale).then((t) => {
      if (!cancelled) {
        setTranslations(t);
        setIsLoading(false);
        // Update HTML lang attribute
        document.documentElement.lang = locale;
      }
    });
    return () => { cancelled = true; };
  }, [locale]);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    persistLocale(newLocale);
  }, []);

  const t = useCallback(
    (key: TranslationKey): string => {
      if (!translations) return key;
      return resolveKey(translations, key);
    },
    [translations]
  );

  const value = useMemo(
    () => ({ locale, translations, setLocale, t, isLoading }),
    [locale, translations, setLocale, t, isLoading]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useTranslation must be used inside <I18nProvider>');
  }
  return ctx;
}

export { SUPPORTED_LOCALES };
