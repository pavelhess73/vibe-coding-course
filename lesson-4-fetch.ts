import { GoogleGenAI, Type, Schema, GenerateContentResponse } from '@google/genai';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
  addDoc,
  doc,
  updateDoc,
} from 'firebase/firestore';
import dotenv from 'dotenv';
import path from 'path';

// Načtení konfiguračních proměnných ze souboru .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

/**
 * Rozhraní pro dokument Místo / Aktivita ve Firestore a Gemini.
 */
export interface Place {
  id?: string;
  title: string;
  category: string;
  description: string;
  recommendedTimeOfDay: string;
  city: string;
  createdAt?: string;
}

/**
 * Výsledek funkce getOrGeneratePlace.
 */
export interface GetOrGenerateResult {
  place: Place;
  statusMessage: string;
  source: 'database' | 'ai';
}

/**
 * Inicializace Firebase App a Firestore z .env.local
 */
function initFirestore() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

  if (!apiKey || !projectId) {
    throw new Error(
      'Konfigurační proměnné pro Firebase nebyly v .env.local nalezeny. Zkontrolujte NEXT_PUBLIC_FIREBASE_*.'
    );
  }

  const firebaseConfig = {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
  };

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  return { app, db };
}

/**
 * Pomocná funkce pro doplnění atributu `city: 'Luang Prabang'` do starších dokumentů
 * vytvořených v Lesson 3 bez atributu `city`.
 */
async function backfillCityIfMissing(): Promise<void> {
  const { db } = initFirestore();
  const placesRef = collection(db, 'places');
  const snapshot = await getDocs(placesRef);

  for (const document of snapshot.docs) {
    const data = document.data();
    if (!data.city) {
      const docRef = doc(db, 'places', document.id);
      await updateDoc(docRef, { city: 'Luang Prabang' });
    }
  }
}

/**
 * 1. Prohledá databázi Firebase Firestore a načte všechny položky z kolekce places, kde city je 'Luang Prabang'.
 *    Vypíše je přehledně do konzole (název, kategorie, doporučený čas dnem).
 */
export async function fetchPlacesByCity(city: string): Promise<Place[]> {
  await backfillCityIfMissing();

  const { db } = initFirestore();
  const placesRef = collection(db, 'places');
  const q = query(placesRef, where('city', '==', city));

  console.log(`\n🔍 Hledám v databázi Firestore všechna místa pro město '${city}'...`);
  const querySnapshot = await getDocs(q);

  const places: Place[] = [];

  querySnapshot.forEach((docSnap) => {
    const data = docSnap.data();
    places.push({
      id: docSnap.id,
      title: data.title || 'Bez názvu',
      category: data.category || 'Nespecifikováno',
      description: data.description || '',
      recommendedTimeOfDay: data.recommendedTimeOfDay || 'Kdykoliv',
      city: data.city || city,
      createdAt: data.createdAt,
    });
  });

  console.log(`\n===============================================================`);
  console.log(`📍 NAČTENÁ MÍSTA Z FIRESTORE – Město: ${city.toUpperCase()} (${places.length} položek)`);
  console.log(`===============================================================`);

  if (places.length === 0) {
    console.log(`⚠️ Žádná místa pro město '${city}' nebyla ve Firestore nalezena.`);
  } else {
    places.forEach((place, index) => {
      console.log(`\n[#${index + 1}] ${place.title} (ID: ${place.id})`);
      console.log(`   📁 Kategorie:        ${place.category}`);
      console.log(`   🕒 Doporučený čas:   ${place.recommendedTimeOfDay}`);
      console.log(`   📝 Popis:            ${place.description}`);
    });
  }

  console.log(`---------------------------------------------------------------\n`);

  return places;
}

/**
 * JSON schéma pro generování jednoho objektu Place přes Gemini API.
 */
const singlePlaceSchema: Schema = {
  type: Type.OBJECT,
  description: 'Informace o jedné konkrétní aktivitě nebo místě v daném městě a kategorii.',
  properties: {
    title: {
      type: Type.STRING,
      description: 'Název místa nebo aktivity.',
    },
    category: {
      type: Type.STRING,
      description: 'Kategorie místa nebo aktivity.',
    },
    description: {
      type: Type.STRING,
      description: 'Poutavý popis aktivity nebo místa v češtině.',
    },
    recommendedTimeOfDay: {
      type: Type.STRING,
      description: 'Doporučená doba návštěvy v češtině (např. Ráno, Dopoledne, Odpoledne, Podvečer, Večer).',
    },
    city: {
      type: Type.STRING,
      description: 'Město, ve kterém se místo nachází.',
    },
  },
  required: ['title', 'category', 'description', 'recommendedTimeOfDay', 'city'],
};

/**
 * Kandidátní modely pro Gemini API.
 */
const CANDIDATE_MODELS: string[] = [
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
  'gemini-1.5-flash',
  'gemini-flash-latest',
];

/**
 * Vygeneruje nové místo pomocí Gemini API v případě, že se nenachází v databázi.
 */
async function generateSinglePlaceWithAI(city: string, category: string): Promise<Place> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('API klíč pro Gemini nebyl nalezen v .env.local.');
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt =
    `Vygeneruj jedno atraktivní a autentické místo nebo aktivitu ve městě '${city}' ` +
    `spadající do kategorie '${category}'. ` +
    `Výstup musí přesně odpovídat požadovanému JSON schématu bez jakéhokoliv dalšího doprovodného textu.`;

  let lastError: Error | null = null;

  for (const modelCandidate of CANDIDATE_MODELS) {
    let attempt = 0;
    const maxAttempts = 3;

    while (attempt < maxAttempts) {
      attempt++;
      try {
        console.log(
          `🤖 Generuji nové místo přes AI ('${modelCandidate}') pro město '${city}' a kategorii '${category}'...`
        );

        const response: GenerateContentResponse = await ai.models.generateContent({
          model: modelCandidate,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: singlePlaceSchema,
          },
        });

        const responseText = response.text;
        if (!responseText) {
          throw new Error(`Model '${modelCandidate}' vrátil prázdnou odpoved.`);
        }

        const cleanedText = responseText.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(cleanedText) as Record<string, unknown>;

        const place: Place = {
          title: String(parsed.title || `Aktivita v ${city}`),
          category: String(parsed.category || category),
          description: String(parsed.description || ''),
          recommendedTimeOfDay: String(parsed.recommendedTimeOfDay || 'Kdykoliv'),
          city: String(parsed.city || city),
        };

        return place;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const is503Error =
          errorMessage.includes('503') ||
          errorMessage.includes('UNAVAILABLE') ||
          errorMessage.includes('high demand') ||
          errorMessage.includes('overloaded');

        if (is503Error && attempt < maxAttempts) {
          console.warn(
            `⚠️ Model '${modelCandidate}' vrátil chybu 503 (vysoké vytížení). Čekám 2 sekundy před dalším pokusem...`
          );
          await new Promise((resolve) => setTimeout(resolve, 2000));
          continue;
        }

        const isSkipableError =
          errorMessage.includes('404') ||
          errorMessage.includes('NOT_FOUND') ||
          errorMessage.includes('400') ||
          errorMessage.includes('429') ||
          errorMessage.includes('500') ||
          errorMessage.includes('503') ||
          errorMessage.includes('UNAVAILABLE') ||
          errorMessage.includes('SyntaxError');

        if (isSkipableError) {
          console.warn(`ℹ️ Zkouším další model pro generování AI...`);
          lastError = error instanceof Error ? error : new Error(errorMessage);
          break;
        }

        throw error;
      }
    }
  }

  throw lastError || new Error('Nepodařilo se vygenerovat místo pomocí Gemini AI.');
}

/**
 * 2. Implementuje chytré vyhledávání: getOrGeneratePlace(city, category)
 *    - Nejprve zkusí najít místo v daném městě a kategorii v DB.
 *    - Pokud existuje v DB, ihned ho vrátí s hláškou ⚡ 'Načteno z databáze (0 ms)'.
 *    - Pokud v DB neexistuje, zavolá Gemini API (gemini-3.8-flash), vygeneruje nový objekt,
 *      uloží ho do Firestore a vrátí s hláškou 🤖 'Vygenerováno přes AI a uloženo'.
 */
export async function getOrGeneratePlace(
  city: string,
  category: string
): Promise<GetOrGenerateResult> {
  const startTime = Date.now();
  const { db } = initFirestore();
  const placesRef = collection(db, 'places');

  console.log(`\n🔎 [Chytré vyhledávání] Hledám místo pro město '${city}' v kategorii '${category}'...`);

  // Vyhledání v databázi Firestore
  const q = query(placesRef, where('city', '==', city));
  const querySnapshot = await getDocs(q);

  let existingPlace: Place | null = null;

  querySnapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const docCategory = (data.category || '').toString().toLowerCase().trim();
    const targetCategory = category.toLowerCase().trim();

    if (docCategory === targetCategory || docCategory.includes(targetCategory) || targetCategory.includes(docCategory)) {
      existingPlace = {
        id: docSnap.id,
        title: data.title,
        category: data.category,
        description: data.description,
        recommendedTimeOfDay: data.recommendedTimeOfDay,
        city: data.city || city,
        createdAt: data.createdAt,
      };
    }
  });

  // Pokud místo existuje v DB:
  if (existingPlace) {
    const elapsedTime = Date.now() - startTime;
    const statusMessage = `⚡ Načteno z databáze (${elapsedTime} ms)`;
    console.log(statusMessage);
    return {
      place: existingPlace,
      statusMessage,
      source: 'database',
    };
  }

  // Pokud v DB neexistuje -> Generujeme přes AI
  console.log(`ℹ️ Místo v kategorii '${category}' pro '${city}' nebyl ve Firestore nalezen. Spouštím AI...`);
  const generatedPlace = await generateSinglePlaceWithAI(city, category);

  // Uložení do Firestore
  const docRef = await addDoc(placesRef, {
    ...generatedPlace,
    createdAt: new Date().toISOString(),
  });

  generatedPlace.id = docRef.id;

  const statusMessage = `🤖 Vygenerováno přes AI a uloženo (Document ID: ${docRef.id})`;
  console.log(statusMessage);

  return {
    place: generatedPlace,
    statusMessage,
    source: 'ai',
  };
}

/**
 * Hlavní funkce skriptu.
 */
async function main(): Promise<void> {
  console.log('===============================================================');
  console.log('🇱🇦 LESSON 4: Firestore Fetch & Smart Cache (getOrGeneratePlace)');
  console.log('===============================================================\n');

  try {
    // Krok 1: Načtení všech položek z kolekce places, kde city je 'Luang Prabang'
    await fetchPlacesByCity('Luang Prabang');

    // Krok 2: Test chytrého vyhledávání – Hledáme kategorii 'Kultura' (měla by být v DB z Lesson 3)
    console.log('\n--- TEST 1: Dotaz na existující kategorii (očakáváme ⚡ z databáze) ---');
    const result1 = await getOrGeneratePlace('Luang Prabang', 'Kultura');
    console.log(`📍 Výsledek: ${result1.place.title} [${result1.place.category}]`);
    console.log(`   Hláška: ${result1.statusMessage}`);

    // Krok 3: Test chytrého vyhledávání – Hledáme novou kategorii 'Gastronomie' (není v DB -> vygeneruje se přes AI)
    console.log('\n--- TEST 2: Dotaz na novou kategorii (očekáváme 🤖 vygenerování přes AI) ---');
    const result2 = await getOrGeneratePlace('Luang Prabang', 'Gastronomie');
    console.log(`📍 Výsledek: ${result2.place.title} [${result2.place.category}]`);
    console.log(`   Hláška: ${result2.statusMessage}`);

    // Krok 4: Test opakovaného dotazu na stejnou novou kategorii (nyní už je v DB -> načte se z DB!)
    console.log('\n--- TEST 3: Opakovaný dotaz na "Gastronomie" (nyní očekáváme ⚡ z databáze) ---');
    const result3 = await getOrGeneratePlace('Luang Prabang', 'Gastronomie');
    console.log(`📍 Výsledek: ${result3.place.title} [${result3.place.category}]`);
    console.log(`   Hláška: ${result3.statusMessage}`);

    console.log('\n===============================================================');
    console.log('🎉 LESSON 4 ÚSPĚŠNĚ DOKONČENA!');
    console.log('===============================================================\n');

    process.exit(0);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('\n❌ Při zpracování došlo k chybě:', errorMessage);
    process.exit(1);
  }
}

// Spuštění hlavního procesu
void main();
