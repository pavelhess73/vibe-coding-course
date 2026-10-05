/**
 * lib/offlineStore.ts
 * Offline fronta pro uložení neodoslaných tipů z cest.
 * Používá knihovnu idb (IndexedDB wrapper) pro typově bezpečnou práci s IDB.
 *
 * Databáze: asia-travel-db
 * Store:    pending-places
 */

import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'asia-travel-db';
const DB_VERSION = 1;
const STORE_NAME = 'pending-places';

/** Tvar neodoslaného tipu uloženého v IndexedDB */
export interface PendingPlace {
  id: string;          // Dočasné lokální ID (crypto.randomUUID)
  title: string;
  city: string;
  rawNote: string;     // Původní uživatelská poznámka — AI to obohatí po připojení
  savedAt: string;     // ISO timestamp uložení
}

let dbInstance: IDBPDatabase | null = null;

/**
 * Lazily inicializuje a vrátí instanci IndexedDB databáze.
 * Bezpečné pro SSR – vrací null na serveru.
 */
async function getDb(): Promise<IDBPDatabase | null> {
  if (typeof window === 'undefined') return null;

  if (dbInstance) return dbInstance;

  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    },
  });

  return dbInstance;
}

/**
 * Uloží neodoslaný tip do IndexedDB pending-places store.
 */
export async function savePendingPlace(
  place: Omit<PendingPlace, 'id' | 'savedAt'>
): Promise<PendingPlace> {
  const db = await getDb();
  if (!db) throw new Error('IndexedDB není dostupná (pravděpodobně SSR prostředí).');

  const pendingPlace: PendingPlace = {
    ...place,
    id: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
  };

  await db.put(STORE_NAME, pendingPlace);
  return pendingPlace;
}

/**
 * Načte všechny čekající tipy z IndexedDB.
 */
export async function getPendingPlaces(): Promise<PendingPlace[]> {
  const db = await getDb();
  if (!db) return [];

  return db.getAll(STORE_NAME);
}

/**
 * Smaže vyřešený (synchronizovaný) tip z IndexedDB podle ID.
 */
export async function removePendingPlace(id: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.delete(STORE_NAME, id);
}

/**
 * Vrátí počet čekajících tipů (pro UI badge).
 */
export async function getPendingCount(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  return db.count(STORE_NAME);
}
