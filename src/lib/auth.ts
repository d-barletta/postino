import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut as firebaseSignOut,
  User as FirebaseUser,
} from 'firebase/auth';
import { auth } from './firebase';
import { createUser, getUserById } from './firestore';
import { generateAssignedEmail } from './email-utils';

function getAuth() {
  if (!auth) throw new Error('Firebase is not configured. Please set NEXT_PUBLIC_FIREBASE_* environment variables.');
  return auth;
}

export async function registerUser(email: string, password: string): Promise<FirebaseUser> {
  const credential = await createUserWithEmailAndPassword(getAuth(), email, password);
  const user = credential.user;

  await sendEmailVerification(user);

  const assignedEmail = generateAssignedEmail();

  await createUser(user.uid, {
    email: user.email!,
    assignedEmail,
    createdAt: new Date(),
    isAdmin: false,
    isActive: true,
  });

  return user;
}

export async function loginUser(email: string, password: string): Promise<FirebaseUser> {
  const credential = await signInWithEmailAndPassword(getAuth(), email, password);
  return credential.user;
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(getAuth());
}

export async function getIdToken(): Promise<string | null> {
  const a = auth;
  if (!a) return null;
  const user = a.currentUser;
  if (!user) return null;
  return user.getIdToken();
}

export async function isCurrentUserAdmin(): Promise<boolean> {
  const a = auth;
  if (!a) return false;
  const user = a.currentUser;
  if (!user) return false;
  const userData = await getUserById(user.uid);
  return userData?.isAdmin ?? false;
}
