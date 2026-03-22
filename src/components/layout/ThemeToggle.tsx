'use client';

import { useEffect, useState } from 'react';

export function ThemeToggle() {
  // Keep initial render deterministic to avoid server/client hydration mismatch.
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    //eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggleTheme = () => {
    const nextIsDark = !isDark;
    setIsDark(nextIsDark);
    document.documentElement.classList.toggle('dark', nextIsDark);
    localStorage.setItem('theme', nextIsDark ? 'dark' : 'light');
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-700 dark:text-gray-200 transition-colors"
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      <i className={`bi ${isDark ? 'bi-sun-fill' : 'bi-moon-stars-fill'} text-sm`} aria-hidden="true" />
    </button>
  );
}
