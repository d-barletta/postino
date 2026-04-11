'use client';

import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { signOut } from '@/lib/auth';
import type { User } from '@/types';

const SUPPORTED_LOCALES = ['en', 'it', 'es', 'fr', 'de'] as const;

function getBootstrapLocale(): string {
  try {
    const stored = localStorage.getItem('locale');
    if (stored && (SUPPORTED_LOCALES as readonly string[]).includes(stored)) return stored;
  } catch {
    /* ignore */
  }
  if (typeof navigator !== 'undefined') {
    const primary = (navigator.language || '').split('-')[0].toLowerCase();
    if ((SUPPORTED_LOCALES as readonly string[]).includes(primary)) return primary;
  }
  return 'en';
}

interface AuthContextType {
  /** The raw Supabase auth user. */
  authUser: SupabaseUser | null;
  user: User | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
  /** Returns the current session access token. */
  getIdToken: () => Promise<string | null>;
}

export const AuthContext = createContext<AuthContextType>({
  authUser: null,
  user: null,
  loading: true,
  refreshUser: async () => {},
  getIdToken: async () => null,
});

export function useAuth() {
  return useContext(AuthContext);
}

export function useAuthState() {
  const [authUser, setAuthUser] = useState<SupabaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const [supabase] = useState(() => createClient());

  const getCurrentToken = useCallback(async (): Promise<string | null> => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, [supabase]);

  const fetchUserData = useCallback(async (accessToken: string) => {
    try {
      const res = await fetch('/api/auth/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Locale': getBootstrapLocale(),
        },
      });
      if (res.status === 403) {
        await signOut();
        setUser(null);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      }
    } catch (err) {
      console.error('Failed to fetch user data:', err);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const token = await getCurrentToken();
    if (token) {
      await fetchUserData(token);
    }
  }, [fetchUserData, getCurrentToken]);

  useEffect(() => {
    let isActive = true;

    const loadInitialSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!isActive) return;

        setAuthUser(session?.user ?? null);

        if (session?.user && session.access_token) {
          await fetchUserData(session.access_token);
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error('Failed to hydrate auth session:', err);
        if (isActive) {
          setAuthUser(null);
          setUser(null);
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    void loadInitialSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isActive) return;

      const sbUser = session?.user ?? null;
      const accessToken = session?.access_token ?? null;
      setAuthUser(sbUser);
      setLoading(false);

      if (sbUser) {
        // Supabase documents a deadlock bug when async auth work runs directly
        // inside onAuthStateChange. Defer the follow-up fetch to the next task.
        window.setTimeout(() => {
          if (isActive && accessToken) {
            void fetchUserData(accessToken);
          }
        }, 0);
      } else {
        setUser(null);
      }
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, [fetchUserData, supabase]);

  return {
    authUser,
    user,
    loading,
    refreshUser,
    getIdToken: getCurrentToken,
  };
}
