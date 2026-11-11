import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  deleteDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const FIREBASE_AUTH_DOMAIN = firebaseConfig.authDomain;
export const FIREBASE_AUTHORIZED_DOMAINS_CONSOLE_URL = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings`;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate connection to Firestore on boot
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export const ADMIN_EMAIL = 'imtyroon@gmail.com';

export function isAdminEmail(email?: string | null): boolean {
  return Boolean(email && email.trim().toLowerCase() === ADMIN_EMAIL);
}

export interface AuthorizedDomainEntry {
  id: string;
  ownerId: string;
  domain: string;
  environment: 'vercel-production' | 'vercel-preview' | 'custom-domain';
}

export const DEFAULT_WHITELISTED_DOMAINS: AuthorizedDomainEntry[] = [
  {
    id: 'hotseat-vercel-app',
    ownerId: 'system',
    domain: 'hotseat.vercel.app',
    environment: 'vercel-production',
  },
  {
    id: 'ais-pre-run-app',
    ownerId: 'system',
    domain: 'ais-pre-krsocsjs65al5fd37nocme-287948708629.europe-west2.run.app',
    environment: 'vercel-preview',
  },
  {
    id: 'ais-dev-run-app',
    ownerId: 'system',
    domain: 'ais-dev-krsocsjs65al5fd37nocme-287948708629.europe-west2.run.app',
    environment: 'vercel-preview',
  },
];

/**
 * Syncs the authenticated Firebase user's public profile (/users/{uid}),
 * isolated private PII (/users/{uid}/private/info), and (for admin imtyroon@gmail.com)
 * whitelisted Vercel production domain (hotseat.vercel.app) in Firestore.
 */
export async function syncFirebaseUserToFirestore(
  fbUser: FirebaseUser,
  paypalEmailOverride?: string
): Promise<{
  uid: string;
  name: string;
  email: string;
  paypalEmail: string;
}> {
  const uid = fbUser.uid;
  const displayName = (fbUser.displayName || fbUser.email?.split('@')[0] || 'Founder').slice(
    0,
    80
  );
  const email = (fbUser.email || 'founder@startup.io').slice(0, 120);
  const paypalEmail = (paypalEmailOverride || email).slice(0, 120);

  const userProfilePath = `users/${uid}`;
  const userPrivatePath = `users/${uid}/private/info`;

  try {
    const profileRef = doc(db, 'users', uid);
    const existingProfile = await getDoc(profileRef);
    if (!existingProfile.exists()) {
      await setDoc(profileRef, {
        uid,
        displayName,
        provider: 'google',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(profileRef, {
        displayName,
        provider: 'google',
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    if (fbUser.emailVerified) {
      handleFirestoreError(error, OperationType.WRITE, userProfilePath);
    }
  }

  let resolvedPaypalEmail = paypalEmail;
  try {
    const privateRef = doc(db, 'users', uid, 'private', 'info');
    const existingPrivate = await getDoc(privateRef);
    if (!existingPrivate.exists()) {
      await setDoc(privateRef, {
        uid,
        email,
        paypalEmail,
        updatedAt: serverTimestamp(),
      });
    } else {
      const data = existingPrivate.data();
      resolvedPaypalEmail = paypalEmailOverride || data?.paypalEmail || email;
      if (paypalEmailOverride && paypalEmailOverride !== data?.paypalEmail) {
        await updateDoc(privateRef, {
          email,
          paypalEmail: resolvedPaypalEmail.slice(0, 120),
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (error) {
    if (fbUser.emailVerified) {
      handleFirestoreError(error, OperationType.WRITE, userPrivatePath);
    }
  }

  // Only seed hotseat.vercel.app into Firestore domains subcollection for the admin (imtyroon@gmail.com)
  if (isAdminEmail(email)) {
    try {
      const vercelDomainRef = doc(db, 'users', uid, 'domains', 'hotseat-vercel-app');
      const existingDomain = await getDoc(vercelDomainRef);
      if (!existingDomain.exists()) {
        await setDoc(vercelDomainRef, {
          ownerId: uid,
          domain: 'hotseat.vercel.app',
          environment: 'vercel-production',
          createdAt: serverTimestamp(),
        });
      }
    } catch {
      // Non-fatal if offline or unverified
    }
  }

  return {
    uid,
    name: displayName,
    email,
    paypalEmail: resolvedPaypalEmail,
  };
}

export async function signInWithGooglePopup(): Promise<{
  uid: string;
  name: string;
  email: string;
  paypalEmail: string;
}> {
  const cred = await signInWithPopup(auth, googleProvider);
  return syncFirebaseUserToFirestore(cred.user);
}

export async function signOutFirebaseUser(): Promise<void> {
  await firebaseSignOut(auth);
}

export { onAuthStateChanged };
export type { FirebaseUser };

export async function listUserAuthorizedDomains(uid: string): Promise<AuthorizedDomainEntry[]> {
  if (!isAdminEmail(auth.currentUser?.email)) {
    return DEFAULT_WHITELISTED_DOMAINS;
  }
  const path = `users/${uid}/domains`;
  try {
    const q = query(collection(db, 'users', uid, 'domains'), where('ownerId', '==', uid));
    const snap = await getDocs(q);
    const fromDb = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ownerId: data.ownerId,
        domain: data.domain,
        environment: data.environment,
      } as AuthorizedDomainEntry;
    });
    const byDomain = new Map<string, AuthorizedDomainEntry>();
    for (const def of DEFAULT_WHITELISTED_DOMAINS) {
      byDomain.set(def.domain, def);
    }
    for (const item of fromDb) {
      byDomain.set(item.domain, item);
    }
    return Array.from(byDomain.values());
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function addUserAuthorizedDomain(
  uid: string,
  domain: string,
  environment: 'vercel-production' | 'vercel-preview' | 'custom-domain'
): Promise<AuthorizedDomainEntry> {
  const cleanDomain = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .slice(0, 120);
  const domainId = cleanDomain.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64) || `dom-${Date.now()}`;
  const path = `users/${uid}/domains/${domainId}`;

  try {
    await setDoc(doc(db, 'users', uid, 'domains', domainId), {
      ownerId: uid,
      domain: cleanDomain,
      environment,
      createdAt: serverTimestamp(),
    });
    return {
      id: domainId,
      ownerId: uid,
      domain: cleanDomain,
      environment,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function removeUserAuthorizedDomain(uid: string, domainId: string): Promise<void> {
  const path = `users/${uid}/domains/${domainId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'domains', domainId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveAdminPayPalSettingsToFirestore(payload: {
  sandboxEnabled: boolean;
  environment: 'SANDBOX' | 'LIVE';
  clientIdPrefix?: string;
  webhookId?: string;
}): Promise<void> {
  if (!isAdminEmail(auth.currentUser?.email)) return;
  const path = 'admin/paypalConfig';
  try {
    await setDoc(doc(db, 'admin', 'paypalConfig'), {
      sandboxEnabled: payload.sandboxEnabled,
      environment: payload.environment,
      clientIdPrefix: (payload.clientIdPrefix || '').slice(0, 64),
      webhookId: (payload.webhookId || '').slice(0, 120),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (auth.currentUser?.emailVerified) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }
}
