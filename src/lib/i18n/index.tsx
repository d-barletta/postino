'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Translations } from './types';
import en from './locales/en';
import it from './locales/it';
import es from './locales/es';
import fr from './locales/fr';
import de from './locales/de';

export type { Translations } from './types';

// ---------------------------------------------------------------------------
// Supported locales
// ---------------------------------------------------------------------------
export type Locale = 'en' | 'it' | 'es' | 'fr' | 'de';

export const SUPPORTED_LOCALES: { code: Locale; label: string; flag: string }[] = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
];

// ---------------------------------------------------------------------------
// Translation dictionaries
// ---------------------------------------------------------------------------
const translations: Record<Locale, Translations> = { en, it, es, fr, de };

// ---------------------------------------------------------------------------
function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return 'en';
  const lang = navigator.language || '';
  const primary = lang.split('-')[0].toLowerCase();
  const supported: Locale[] = ['en', 'it', 'es', 'fr', 'de'];
  return supported.includes(primary as Locale) ? (primary as Locale) : 'en';
}

function getStoredLocale(): Locale | null {
  try {
    const stored = localStorage.getItem('locale') as Locale | null;
    const supported: Locale[] = ['en', 'it', 'es', 'fr', 'de'];
    return stored && supported.includes(stored) ? stored : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translations;
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'en',
  setLocale: () => {},
  t: translations.en,
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    const stored = getStoredLocale();
    setLocaleState(stored ?? detectLocale());
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem('locale', next);
    } catch {
      // ignore
    }
  }, []);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t: translations[locale] ?? translations.en }}>
      {children}
    </I18nContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
