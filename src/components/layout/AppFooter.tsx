'use client';

import Link from 'next/link';
import { ThemeToggle } from './ThemeToggle';
import { LanguageSelector } from './LanguageSelector';

export function AppFooter() {
  return (
    <footer className="bg-transparent py-4">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 text-sm text-gray-500 dark:text-gray-400">
        <p>© {new Date().getFullYear()} <Link href="/" className="hover:underline">Postino</Link></p>
        <div className="flex items-center gap-1">
          <LanguageSelector />
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}
