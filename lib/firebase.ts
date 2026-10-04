import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Inicializace Firebase (zabránění opakované inicializaci v Next.js HMR)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

/**
 * Firestore s offline persistencí:
 * - persistentLocalCache() zapne IndexedDB cache, která ukládá data lokálně
 * - persistentMultipleTabManager() umožňuje sdílet cache přes více záložek
 * - Pokud je Firestore již inicializováno (HMR), použijeme getFirestore()
 * - Tato konfigurace způsobí, že místa zůstanou dostupná i bez internetu
 */
export const db = (() => {
  // Pokud je aplikace na serveru (SSR), offline cache není k dispozici
  if (typeof window === 'undefined') {
    return getFirestore(app);
  }

  try {
    // Klientská strana: inicializujeme s persistentní IndexedDB cache
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch (err: unknown) {
    // Pokud je Firestore již inicializováno (Fast Refresh / HMR), vrátíme existující instanci
    if (err instanceof Error && err.name === 'FirebaseError' && err.message.includes('already been started')) {
      console.warn('[Firebase] Firestore již inicializováno, používám existující instanci.');
      return getFirestore(app);
    }
    throw err;
  }
})();
