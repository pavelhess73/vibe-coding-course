import { GoogleGenAI, Type, Schema, GenerateContentResponse } from '@google/genai';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc } from 'firebase/firestore';
import dotenv from 'dotenv';
import path from 'path';

// Načtení konfiguračních proměnných ze souboru .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

/**
 * Rozhraní definující strukturu místa / aktivity.
 */
export interface Place {
  title: string;
  category: string;
  description: string;
  recommendedTimeOfDay: string;
}

/**
 * Rozhraní pro výsledek generování z Gemini API.
 */
export interface GeminiPlacesResult {
  success: boolean;
  modelUsed: string;
  places: Place[];
}

/**
 * JSON Schéma pro Gemini API definující pole 3 míst v Luang Prabang.
 */
export const placesSchema: Schema = {
  type: Type.ARRAY,
  description: 'Seznam 3 typických aktivit nebo míst pro město Luang Prabang (Laos).',
  items: {
    type: Type.OBJECT,
    description: 'Strukturovaná informace o místě nebo aktivitě v Luang Prabangu.',
    properties: {
      title: {
        type: Type.STRING,
        description: 'Název místa nebo aktivity (např. Kuang Si Falls, Wat Xieng Thong, Alms Giving Ceremony).',
      },
      category: {
        type: Type.STRING,
        description: 'Kategorie místa či aktivity (např. Příroda, Chrám, Kultura, Trh, Gastro).',
      },
      description: {
        type: Type.STRING,
        description: 'Poutavý popis aktivity nebo místa v češtině.',
      },
      recommendedTimeOfDay: {
        type: Type.STRING,
        description: 'Doporučená doba návštěvy v češtině (např. Ráno, Brzy ráno, Odpoledne, Podvečer, Večer).',
      },
    },
    required: ['title', 'category', 'description', 'recommendedTimeOfDay'],
  },
};

/**
 * Ověření, zda je předaná hodnota platným objektem typu Place.
 */
export function isPlace(item: unknown): item is Place {
  if (typeof item !== 'object' || item === null) {
    return false;
  }

  const record = item as Record<string, unknown>;

  return (
    typeof record.title === 'string' &&
    record.title.trim().length > 0 &&
    typeof record.category === 'string' &&
    record.category.trim().length > 0 &&
    typeof record.description === 'string' &&
    record.description.trim().length > 0 &&
    typeof record.recommendedTimeOfDay === 'string' &&
    record.recommendedTimeOfDay.trim().length > 0
  );
}

/**
 * Validuje neznámá načtená data na pole objektů Place.
 */
export function validatePlacesData(rawPayload: unknown): Place[] {
  let candidateList: unknown = rawPayload;

  // Pokud by model obalil pole do objektu (např. { places: [...] })
  if (!Array.isArray(candidateList) && typeof candidateList === 'object' && candidateList !== null) {
    const values: unknown[] = Object.values(candidateList);
    const arrayMatch: unknown = values.find((val: unknown) => Array.isArray(val));
    if (arrayMatch) {
      candidateList = arrayMatch;
    }
  }

  if (!Array.isArray(candidateList)) {
    throw new Error(`Výstup z Gemini není polem (Array). Obdržený typ: ${typeof rawPayload}`);
  }

  const validatedPlaces: Place[] = [];
  for (let i = 0; i < candidateList.length; i++) {
    const item: unknown = candidateList[i];
    if (!isPlace(item)) {
      throw new Error(`Položka na indexu ${i} neodpovídá schématu Place:\n${JSON.stringify(item, null, 2)}`);
    }
    validatedPlaces.push(item);
  }

  return validatedPlaces;
}

/**
 * Seznam kandidátních modelů s požadovanými modely gemini-3.8-flash a gemini-3.5-flash a fallbacky.
 */
const CANDIDATE_MODELS: string[] = [
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
  'gemini-1.5-flash',
  'gemini-flash-latest',
];

/**
 * Vygeneruje 3 typická místa/aktivity pro Luang Prabang pomocí Gemini API s ošetřením chyby 503 a fallbackem.
 */
export async function generatePlacesFromGemini(): Promise<GeminiPlacesResult> {
  const apiKey: string | undefined =
    process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      'API klíč pro Gemini nebyl nalezen v .env.local. Zkontrolujte GEMINI_API_KEY nebo NEXT_PUBLIC_GEMINI_API_KEY.'
    );
  }

  const ai = new GoogleGenAI({ apiKey });

  const prompt =
    'Vygeneruj přesně 3 typické a populární aktivity nebo místa pro město Luang Prabang (Laos). ' +
    'Výstup musí odpovídat požadovanému JSON schématu bez jakéhokoliv dalšího doprovodného textu.';

  let lastError: Error | null = null;

  for (const modelCandidate of CANDIDATE_MODELS) {
    let attempt = 0;
    const maxAttempts = 3; // Retry až 3x při 503 chybě

    while (attempt < maxAttempts) {
      attempt++;
      try {
        console.log(
          `🚀 Zkouším model '${modelCandidate}' pro generování aktivit v Luang Prabang` +
            `${attempt > 1 ? ` (pokus ${attempt}/${maxAttempts})` : ''}...`
        );

        const response: GenerateContentResponse = await ai.models.generateContent({
          model: modelCandidate,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: placesSchema,
          },
        });

        const responseText: string | undefined = response.text;

        if (!responseText) {
          throw new Error(`Model '${modelCandidate}' vrátil prázdnou odpověď.`);
        }

        const cleanedText: string = responseText.replace(/```json|```/g, '').trim();
        const parsedPayload: unknown = JSON.parse(cleanedText);
        const validatedPlaces: Place[] = validatePlacesData(parsedPayload);

        if (validatedPlaces.length === 0) {
          throw new Error(`Model '${modelCandidate}' vrátil prázdné pole míst.`);
        }

        return {
          success: true,
          modelUsed: modelCandidate,
          places: validatedPlaces,
        };
      } catch (error: unknown) {
        const errorMessage: string = error instanceof Error ? error.message : String(error);

        // Ošetření chyby 503 (vysoké vytížení / UNAVAILABLE / overloaded)
        const is503Error: boolean =
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

        // Přeskočení neexistujících (404), nepodporovaných (400) nebo přetížených modelů a přechod na fallback
        const isSkipableModelError: boolean =
          errorMessage.includes('404') ||
          errorMessage.includes('NOT_FOUND') ||
          errorMessage.includes('not found') ||
          errorMessage.includes('unsupported') ||
          errorMessage.includes('400') ||
          errorMessage.includes('429') ||
          errorMessage.includes('500') ||
          errorMessage.includes('503') ||
          errorMessage.includes('UNAVAILABLE') ||
          errorMessage.includes('SyntaxError') ||
          errorMessage.includes('neodpovídá schématu');

        if (isSkipableModelError) {
          console.warn(
            `ℹ️ Model '${modelCandidate}' nebylo možné použít (${errorMessage.slice(0, 80)}...). Zkouším fallback model...`
          );
          lastError = error instanceof Error ? error : new Error(errorMessage);
          break; // Přechod na další model v CANDIDATE_MODELS
        }

        // Kritická chyba (např. 403 Invalid API Key)
        throw error;
      }
    }
  }

  throw lastError || new Error('Žádný z modelů neusplnil požadavek na vygenerování míst.');
}

/**
 * Inicializace Firebase App a Firestore databáze z proměnných v .env.local
 */
function initFirebaseFirestore() {
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
 * Uloží pole míst do Firestore databáze do kolekce `places` a vrátí seznam ID vytvořených dokumentů.
 */
export async function savePlacesToFirestore(places: Place[]): Promise<string[]> {
  const { db } = initFirebaseFirestore();
  const placesCollection = collection(db, 'places');
  const insertedIds: string[] = [];

  console.log(`\n💾 Ukládám ${places.length} míst do Firestore databáze (kolekce 'places')...`);

  for (const place of places) {
    const docRef = await addDoc(placesCollection, {
      ...place,
      createdAt: new Date().toISOString(),
    });
    insertedIds.push(docRef.id);
    console.log(`   └─ Uloženo místo: "${place.title}" -> Document ID: ${docRef.id}`);
  }

  return insertedIds;
}

/**
 * Hlavní funkce skriptu.
 */
async function main(): Promise<void> {
  console.log('===============================================================');
  console.log('🇱🇦 LESSON 3: Gemini AI + Firebase Firestore (Luang Prabang)');
  console.log('===============================================================\n');

  try {
    // 1. Vygenerování JSON dat z Gemini API
    const result = await generatePlacesFromGemini();

    console.log(`\n✅ Úspěšně vygenerováno modelem '${result.modelUsed}':`);
    result.places.forEach((place, index) => {
      console.log(`\n[${index + 1}] ${place.title}`);
      console.log(`    📁 Kategorie: ${place.category}`);
      console.log(`    🕒 Doporučená doba: ${place.recommendedTimeOfDay}`);
      console.log(`    📝 Popis: ${place.description}`);
    });

    // 2. Uložení do Firestore databáze
    const savedIds = await savePlacesToFirestore(result.places);

    // 3. Výpis ID vložených dokumentů do konzole
    console.log('\n===============================================================');
    console.log('🎉 ÚSPĚŠNĚ DOKONČENO!');
    console.log('📋 ID vložených dokumentů ve Firestore (kolekce `places`):');
    savedIds.forEach((id, index) => {
      console.log(`   ${index + 1}. ID: ${id}`);
    });
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
