'use client';

import Link from 'next/link';
import { ThemeToggle } from './ThemeToggle';
import { LanguageSelector } from './LanguageSelector';
import { useI18n } from '@/lib/i18n';

export function AppFooter() {
  const { t } = useI18n();
  return (
    <footer className="bg-transparent py-4">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 text-sm text-gray-500 dark:text-gray-400">
        <p>© {new Date().getFullYear()} <Link href="/" className="hover:underline">Postino</Link>. {t.nav.allRightsReserved}</p>
        <div className="flex items-center gap-1">
          <LanguageSelector />
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}
