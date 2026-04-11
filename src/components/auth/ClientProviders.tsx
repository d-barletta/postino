'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { I18nProvider } from '@/lib/i18n';
import { cleanupLegacyPushArtifacts } from '@/lib/push-notifications';

const AuthProvider = dynamic(() => import('./AuthProvider').then((m) => m.AuthProvider), {
  ssr: false,
});

export function ClientProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    cleanupLegacyPushArtifacts();
  }, []);

  return (
    <I18nProvider>
      <AuthProvider>{children}</AuthProvider>
    </I18nProvider>
  );
}
