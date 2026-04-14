'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { I18nProvider } from '@/lib/i18n';
import { AgentChatProvider } from '@/lib/agent-chat';
import { GlobalModalsProvider } from '@/lib/modals';
import { cleanupLegacyPushArtifacts, initOneSignal } from '@/lib/push-notifications';

const AuthProvider = dynamic(() => import('./AuthProvider').then((m) => m.AuthProvider), {
  ssr: false,
});

export function ClientProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    console.log(
      '[Push] ClientProviders mounted — cleaning up legacy artifacts and initializing OneSignal',
    );
    cleanupLegacyPushArtifacts();
    initOneSignal();
  }, []);

  return (
    <I18nProvider>
      <AuthProvider>
        <AgentChatProvider>
          <GlobalModalsProvider>{children}</GlobalModalsProvider>
        </AgentChatProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
