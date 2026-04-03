'use client';

import dynamic from 'next/dynamic';
import { I18nProvider } from '@/lib/i18n';

const AuthProvider = dynamic(() => import('./AuthProvider').then((m) => m.AuthProvider), {
  ssr: false,
});

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <AuthProvider>{children}</AuthProvider>
    </I18nProvider>
  );
}
