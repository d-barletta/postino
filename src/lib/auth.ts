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

export async function registerUser(email: string, password: string): Promise<FirebaseUser> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
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
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}

export async function getIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}

export async function isCurrentUserAdmin(): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;
  const userData = await getUserById(user.uid);
  return userData?.isAdmin ?? false;
}
