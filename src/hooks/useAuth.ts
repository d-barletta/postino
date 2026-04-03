'use client';

import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { signOut } from '@/lib/auth';
import type { User } from '@/types';

const SUPPORTED_LOCALES = ['en', 'it', 'es', 'fr', 'de'] as const;

/** Reads the active UI locale from localStorage / navigator for use in the bootstrap request. */
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
  firebaseUser: FirebaseUser | null;
  user: User | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  firebaseUser: null,
  user: null,
  loading: true,
  refreshUser: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function useAuthState() {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(Boolean(auth));

  const fetchUserData = useCallback(async (fbUser: FirebaseUser) => {
    try {
      const token = await fbUser.getIdToken();
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}`, 'X-Locale': getBootstrapLocale() },
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
    if (firebaseUser) {
      await fetchUserData(firebaseUser);
    }
  }, [firebaseUser, fetchUserData]);

  useEffect(() => {
    if (!auth) {
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        await fetchUserData(fbUser);
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [fetchUserData]);

  return { firebaseUser, user, loading, refreshUser };
}
