'use client';

import { useI18n, SUPPORTED_LOCALES, type Locale } from '@/lib/i18n';
import { useRef, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

export function LanguageSelector() {
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

  const current = SUPPORTED_LOCALES.find((l) => l.code === locale) ?? SUPPORTED_LOCALES[0];

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
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 h-9 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100/80 dark:hover:bg-white/10 transition-colors"
      >
        <span aria-hidden="true" className="text-base leading-none">
          {current.flag}
        </span>
        <i
          className={cn('bi bi-chevron-up text-[10px] transition-transform', !open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t.language.select}
          className="absolute bottom-full right-0 mb-1 z-50 min-w-[150px] rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-gray-900 shadow-lg py-1"
        >
          {SUPPORTED_LOCALES.map((loc) => (
            <button
              key={loc.code}
              role="option"
              aria-selected={locale === loc.code}
              type="button"
              onClick={() => handleSelect(loc.code)}
              className={cn(
                'w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 transition-colors',
                locale === loc.code
                  ? 'bg-yellow-50 dark:bg-yellow-300/10 text-gray-900 dark:text-white font-medium'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-yellow-50/80 dark:hover:bg-yellow-300/10',
              )}
            >
              <span aria-hidden="true" className="text-base leading-none">
                {loc.flag}
              </span>
              {loc.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
