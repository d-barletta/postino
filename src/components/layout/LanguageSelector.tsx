'use client';

import { useI18n, SUPPORTED_LOCALES, type Locale } from '@/lib/i18n';
import { useRef, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface LanguageSelectorProps {
  /** When true, renders as a compact icon-only trigger (used inside mobile menu). */
  compact?: boolean;
}

export function LanguageSelector({ compact = false }: LanguageSelectorProps) {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const currentLabel = SUPPORTED_LOCALES.find((l) => l.code === locale)?.label ?? locale;

  const handleSelect = (code: Locale) => {
    setLocale(code);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={t.language.select}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg border border-white/50 dark:border-white/10',
          'text-gray-700 dark:text-gray-200 hover:bg-yellow-100/80 dark:hover:bg-yellow-300/20 transition-colors',
          'h-9 px-2.5 text-xs',
        )}
      >
        <i className="bi bi-translate text-sm" aria-hidden="true" />
        {compact ? (
          <span className="font-medium">{currentLabel}</span>
        ) : (
          <span className="hidden sm:inline font-medium">{currentLabel}</span>
        )}
        <i className={cn('bi bi-chevron-down text-[10px] transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t.language.select}
          className={cn(
            'absolute right-0 z-50 mt-1 min-w-[140px] rounded-xl border border-white/50 dark:border-white/10',
            'bg-white dark:bg-gray-900 shadow-lg py-1 ui-fade-up',
          )}
        >
          {SUPPORTED_LOCALES.map((loc) => (
            <button
              key={loc.code}
              role="option"
              aria-selected={locale === loc.code}
              type="button"
              onClick={() => handleSelect(loc.code)}
              className={cn(
                'w-full text-left px-3 py-2 text-sm transition-colors',
                locale === loc.code
                  ? 'bg-yellow-50 dark:bg-yellow-300/10 text-gray-900 dark:text-white font-medium'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-yellow-50/80 dark:hover:bg-yellow-300/10',
              )}
            >
              {loc.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
