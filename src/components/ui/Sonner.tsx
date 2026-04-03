'use client';

import { useEffect, useState } from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

type Theme = 'light' | 'dark';

export function Toaster(props: ToasterProps) {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const getTheme = (): Theme =>
      document.documentElement.classList.contains('dark') ? 'dark' : 'light';

    setTheme(getTheme());

    const observer = new MutationObserver(() => setTheme(getTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast !bg-[var(--surface)] !text-[var(--foreground)] !border-[var(--border)] !shadow-lg !rounded-sm',
          title: '!text-[var(--foreground)] !font-medium',
          description: '!text-[var(--muted-text)]',
          actionButton: '!bg-[#efd957] !text-black !font-medium',
          cancelButton: '!bg-[var(--surface-muted)] !text-[var(--muted-text)]',
          success: '!border-l-4 !border-l-green-500',
          error: '!border-l-4 !border-l-red-500',
          warning: '!border-l-4 !border-l-yellow-500',
          info: '!border-l-4 !border-l-blue-500',
          closeButton: '!bg-[var(--surface-muted)] !border-[var(--border)] !text-[var(--muted-text)]',
        },
      }}
      {...props}
    />
  );
}
