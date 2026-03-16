import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  DocumentData,
} from 'firebase/firestore';
import { db } from './firebase';
import type { User, Rule, EmailLog, Settings } from '@/types';

// User helpers
export async function getUserById(uid: string): Promise<User | null> {
  const docRef = doc(db, 'users', uid);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    uid: snap.id,
    ...data,
    createdAt: data.createdAt?.toDate?.() ?? new Date(),
  } as User;
}

export async function createUser(uid: string, data: Omit<User, 'uid'>): Promise<void> {
  await setDoc(doc(db, 'users', uid), {
    ...data,
    createdAt: Timestamp.fromDate(data.createdAt),
  });
}

export async function updateUser(uid: string, data: Partial<User>): Promise<void> {
  await updateDoc(doc(db, 'users', uid), data as DocumentData);
}

// Rule helpers
export async function getRulesByUser(userId: string): Promise<Rule[]> {
  const q = query(
    collection(db, 'rules'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    createdAt: d.data().createdAt?.toDate?.() ?? new Date(),
    updatedAt: d.data().updatedAt?.toDate?.() ?? new Date(),
  })) as Rule[];
}

export async function createRule(data: Omit<Rule, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, 'rules'), {
    ...data,
    createdAt: Timestamp.fromDate(data.createdAt),
    updatedAt: Timestamp.fromDate(data.updatedAt),
  });
  return ref.id;
}

export async function updateRule(id: string, data: Partial<Rule>): Promise<void> {
  const updateData: DocumentData = { ...data };
  if (data.updatedAt) updateData.updatedAt = Timestamp.fromDate(data.updatedAt);
  await updateDoc(doc(db, 'rules', id), updateData);
}

export async function deleteRule(id: string): Promise<void> {
  await deleteDoc(doc(db, 'rules', id));
}

// EmailLog helpers
export async function getEmailLogsByUser(userId: string, limitCount = 50): Promise<EmailLog[]> {
  const q = query(
    collection(db, 'emailLogs'),
    where('userId', '==', userId),
    orderBy('receivedAt', 'desc'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    receivedAt: d.data().receivedAt?.toDate?.() ?? new Date(),
    processedAt: d.data().processedAt?.toDate?.() ?? undefined,
  })) as EmailLog[];
}

// Settings helpers
export async function getSettings(): Promise<Settings | null> {
  const snap = await getDoc(doc(db, 'settings', 'global'));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    ...data,
    updatedAt: data.updatedAt?.toDate?.() ?? undefined,
  } as Settings;
}
