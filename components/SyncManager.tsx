'use client';

import { useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import {
  getPendingPlaces,
  removePendingPlace,
  getPendingCount,
} from '../lib/offlineStore';
import { enrichCustomPlaceAction } from '../app/actions/generatePlace';

interface SyncManagerProps {
  /** Callback pro zobrazení toast notifikace v rodičovské komponentě */
  onNotification: (message: string, type: 'success' | 'info' | 'error') => void;
}

/**
 * SyncManager — neviditelná komponenta naslouchající na událost 'online'.
 * Při návratu připojení postupně:
 *   1. Načte pending tipy z IndexedDB
 *   2. Pro každý zavolá Gemini AI enrichment (Server Action)
 *   3. Uloží obohacený tip do Firestore
 *   4. Smaže z IndexedDB
 *   5. Zobrazí celkový toast po dokončení
 */
export default function SyncManager({ onNotification }: SyncManagerProps) {
  const syncingRef = useRef(false);

  const syncPendingPlaces = async () => {
    // Zabránění souběžnému spuštění více sync cyklů
    if (syncingRef.current) return;

    const count = await getPendingCount();
    if (count === 0) return;

    syncingRef.current = true;

    onNotification(
      `⏳ Synchronizuji ${count} offline tip${count > 1 ? 'y' : ''} přes Gemini AI...`,
      'info'
    );

    const pending = await getPendingPlaces();
    let successCount = 0;
    let failCount = 0;

    for (const pendingPlace of pending) {
      try {
        // 1. AI Enrichment přes Server Action
        let enriched = null;

        try {
          const enrichResult = await enrichCustomPlaceAction({
            title: pendingPlace.title,
            city: pendingPlace.city,
            rawNote: pendingPlace.rawNote,
          });

          if (enrichResult.success && enrichResult.enrichment) {
            enriched = enrichResult.enrichment;
          }
        } catch (enrichErr) {
          console.warn(
            `⚠️ AI enrichment selhal pro "${pendingPlace.title}", ukládám bez obohacení:`,
            enrichErr
          );
        }

        // 2. Sestavení finálního dokumentu
        const placeDoc = {
          title: pendingPlace.title,
          city: pendingPlace.city,
          category: enriched?.category || 'Vlastní tip',
          description: enriched?.description || pendingPlace.rawNote,
          recommendedTimeOfDay: enriched?.recommendedTimeOfDay || 'Celý den',
          spicinessLevel: enriched?.spicinessLevel ?? 1,
          lat: enriched?.lat,
          lng: enriched?.lng,
          createdAt: pendingPlace.savedAt,
          syncedAt: new Date().toISOString(),
        };

        // 3. Uložení do Firestore
        const placesRef = collection(db, 'places');
        await addDoc(placesRef, placeDoc);

        // 4. Smazání z IndexedDB
        await removePendingPlace(pendingPlace.id);

        successCount++;
        console.log(`✅ Synchronizováno: "${pendingPlace.title}"`);
      } catch (err) {
        failCount++;
        console.error(`❌ Synchronizace selhala pro "${pendingPlace.title}":`, err);
      }
    }

    syncingRef.current = false;

    // 5. Výsledná toast notifikace
    if (successCount > 0 && failCount === 0) {
      onNotification(
        `✅ Offline tipy byly úspěšně synchronizovány a obohaceny přes AI! (${successCount} tip${successCount > 1 ? 'y' : ''})`,
        'success'
      );
    } else if (successCount > 0 && failCount > 0) {
      onNotification(
        `⚠️ Synchronizováno ${successCount} tipů, ${failCount} selhalo. Zkuste to znovu.`,
        'error'
      );
    } else if (failCount > 0) {
      onNotification(
        `❌ Synchronizace ${failCount} offline tipů selhala. Zkuste to znovu.`,
        'error'
      );
    }
  };

  useEffect(() => {
    // Pokus o sync okamžitě při montáži (mohl uživatel obnovit stránku online)
    if (navigator.onLine) {
      syncPendingPlaces();
    }

    const handleOnline = () => {
      console.log('🌐 Připojení obnoveno — spouštím sync offline fronty...');
      syncPendingPlaces();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Neviditelná komponenta — pouze logika, žádný render
  return null;
}
