'use client';

import { AuthContext, useAuthState } from '@/hooks/useAuth';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const authState = useAuthState();
  return <AuthContext.Provider value={authState}>{children}</AuthContext.Provider>;
}
