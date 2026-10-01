import { GoogleGenAI, Type, Schema, GenerateContentResponse } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';

// Načtení proměnných prostředí z lokálního .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

/**
 * Rozhraní pro jedno doporučené street food jídlo.
 */
export interface StreetFoodItem {
  dishName: string;
  localName: string;
  city: string;
  spicinessLevel: number; // 1 až 5
  isVegetarian: boolean;
  ingredients: string[];
  approxPriceCZK: number;
}

/**
 * Rozhraní výsledku dotazu na model.
 */
export interface StreetFoodResult {
  success: boolean;
  modelUsed: string;
  items: StreetFoodItem[];
}

/**
 * Schéma pro strukturovaný JSON výstup pomocí Gemini API (@google/genai).
 * Definuje pole objektů s požadovanými vlastnostmi pro doporučená street food jídla.
 */
export const streetFoodSchema: Schema = {
  type: Type.ARRAY,
  description: 'Seznam doporučených tradičních pouličních jídel (street food) v jihovýchodní Asii.',
  items: {
    type: Type.OBJECT,
    description: 'Detailní strukturované informace o konkrétním pouličním jídle.',
    properties: {
      dishName: {
        type: Type.STRING,
        description: 'Název jídla v angličtině nebo mezinárodní transkripci (např. Pad Kra Pao, Pad Thai).',
      },
      localName: {
        type: Type.STRING,
        description: 'Autentický název jídla v originálním písmu (např. thajské písmo pro Thajsko, laoština pro Laos).',
      },
      city: {
        type: Type.STRING,
        description: 'Město, ve kterém se pokrm doporučuje (např. Bangkok, Luang Prabang).',
      },
      spicinessLevel: {
        type: Type.INTEGER,
        description: 'Úroveň pálivosti pokrmu na celočíselné škále 1 (vůbec nepálí) až 5 (extrémně pálivé).',
      },
      isVegetarian: {
        type: Type.BOOLEAN,
        description: 'Pravdivostní hodnota (true/false) indikující, zda je pokrm bezmasý/vegetariánský.',
      },
      ingredients: {
        type: Type.ARRAY,
        description: 'Pole řetězců se seznamem základních surovin a ingrediencí pokrmu.',
        items: {
          type: Type.STRING,
        },
      },
      approxPriceCZK: {
        type: Type.NUMBER,
        description: 'Odhadovaná orientační cena jedné porce u pouličního stánku v českých korunách (CZK).',
      },
    },
    required: [
      'dishName',
      'localName',
      'city',
      'spicinessLevel',
      'isVegetarian',
      'ingredients',
      'approxPriceCZK',
    ],
  },
};

/**
 * Type Guard pro ověření, zda objekt splňuje rozhraní StreetFoodItem.
 */
export function isStreetFoodItem(item: unknown): item is StreetFoodItem {
  if (typeof item !== 'object' || item === null) {
    return false;
  }

  const record = item as Record<string, unknown>;

  const hasValidDishName: boolean =
    typeof record.dishName === 'string' && record.dishName.trim().length > 0;
  const hasValidLocalName: boolean =
    typeof record.localName === 'string' && record.localName.trim().length > 0;
  const hasValidCity: boolean =
    typeof record.city === 'string' && record.city.trim().length > 0;
  const hasValidSpiciness: boolean =
    typeof record.spicinessLevel === 'number' &&
    Number.isInteger(record.spicinessLevel) &&
    record.spicinessLevel >= 1 &&
    record.spicinessLevel <= 5;
  const hasValidVegetarian: boolean = typeof record.isVegetarian === 'boolean';
  const hasValidIngredients: boolean =
    Array.isArray(record.ingredients) &&
    record.ingredients.length > 0 &&
    record.ingredients.every(
      (ing: unknown) => typeof ing === 'string' && ing.trim().length > 0
    );
  const hasValidPrice: boolean =
    typeof record.approxPriceCZK === 'number' &&
    !isNaN(record.approxPriceCZK) &&
    record.approxPriceCZK >= 0;

  return (
    hasValidDishName &&
    hasValidLocalName &&
    hasValidCity &&
    hasValidSpiciness &&
    hasValidVegetarian &&
    hasValidIngredients &&
    hasValidPrice
  );
}

/**
 * Ověří a zvaliduje neznámá data na pole instancí StreetFoodItem.
 */
export function validateStreetFoodData(rawPayload: unknown): StreetFoodItem[] {
  let candidateList: unknown = rawPayload;

  // Pokud by model obalil pole do kořenového objektu (např. { items: [...] } nebo { recommendations: [...] })
  if (
    !Array.isArray(candidateList) &&
    typeof candidateList === 'object' &&
    candidateList !== null
  ) {
    const values: unknown[] = Object.values(candidateList);
    const arrayMatch: unknown = values.find((val: unknown) => Array.isArray(val));
    if (arrayMatch) {
      candidateList = arrayMatch;
    }
  }

  if (!Array.isArray(candidateList)) {
    throw new Error(
      `Výstup z modelu není polem (Array). Získaný datový typ: ${typeof rawPayload}`
    );
  }

  const validatedItems: StreetFoodItem[] = [];

  for (let i = 0; i < candidateList.length; i++) {
    const element: unknown = candidateList[i];
    if (!isStreetFoodItem(element)) {
      throw new Error(
        `Položka na indexu ${i} nesplňuje schéma StreetFoodItem:\n${JSON.stringify(element, null, 2)}`
      );
    }
    validatedItems.push(element);
  }

  return validatedItems;
}

/**
 * Přehledně zformátuje a vytiskne katalog jídel do konzole.
 */
export function printStreetFoodCatalog(items: StreetFoodItem[], modelName: string): void {
  const cityName: string = items[0]?.city ? items[0].city.toUpperCase() : 'HANOI';
  console.log('\n' + '='.repeat(74));
  console.log(`🍜 DOPORUČENÁ STREET FOOD JÍDLA – ${cityName} (JV ASIE)`);
  console.log(`🤖 Vygenerováno modelem: ${modelName}`);
  console.log('='.repeat(74) + '\n');

  items.forEach((item: StreetFoodItem, index: number) => {
    const spiceIcons: string =
      '🌶️'.repeat(item.spicinessLevel) + '⚪'.repeat(5 - item.spicinessLevel);
    const vegBadge: string = item.isVegetarian
      ? '🌱 Ano (Vegetariánské)'
      : '🥩 Ne';

    console.log(`[#${index + 1}] ${item.dishName} (${item.localName})`);
    console.log(`   🏙️  Město:              ${item.city}`);
    console.log(`   🌶️  Pálivost:           ${spiceIcons} (${item.spicinessLevel}/5)`);
    console.log(`   🥗  Vegetariánské:      ${vegBadge}`);
    console.log(`   💵  Přibližná cena:     ~${item.approxPriceCZK} CZK`);
    console.log(`   🧂  Suroviny:           ${item.ingredients.join(', ')}`);
    console.log('-'.repeat(74));
  });

  console.log(`✅ Úspěšně načteno a typově ověřeno celkem ${items.length} jídel.\n`);
}

/**
 * Kandidáti na model: primárně požadované modely 'gemma-4-26b-a4b-it' nebo 'gemini-3.5-flash',
 * s bezpečným fallbackem na dostupné 'gemini-2.5-flash' / 'gemini-1.5-flash'.
 */
const CANDIDATE_MODELS: string[] = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.5-flash',
  'gemini-flash-latest',
];

/**
 * Hlavní funkce pro získání strukturovaných street food doporučení.
 */
export async function getStreetFoodRecommendations(): Promise<StreetFoodResult> {
  const apiKey: string | undefined =
    process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      'API klíč nebyl nalezen. Ujistěte se, že máte v souboru .env.local definovanou proměnnou GEMINI_API_KEY.'
    );
  }

  const ai: GoogleGenAI = new GoogleGenAI({ apiKey });

  const prompt: string =
    'Doporuč přesně 3 populární a autentická street food jídla v Hanoji. ' +
    'Výstup musí striktně odpovídat definovanému JSON schématu bez jakéhokoliv dalšího doprovodného textu. ' +
    'Vymeň odpověď výhradně jako čistý validní JSON objekt bez jakýchkoliv Markdown značek (neuváděj ```json).';

  let lastError: Error | null = null;

  for (const modelCandidate of CANDIDATE_MODELS) {
    let attempt: number = 0;
    const maxAttempts: number = 2; // 1. pokus + 1 retry při chybě 503

    while (attempt < maxAttempts) {
      attempt++;
      try {
        console.log(
          `🚀 Zkouším model '${modelCandidate}' se strukturovaným schématem${
            attempt > 1 ? ` (opakovaný pokus ${attempt}/${maxAttempts})` : ''
          }...`
        );

        const response: GenerateContentResponse = await ai.models.generateContent({
          model: modelCandidate,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: streetFoodSchema,
          },
        });

        const responseText: string | undefined = response.text;

        if (!responseText) {
          throw new Error(`Model '${modelCandidate}' vrátil prázdný výstup.`);
        }

        // Odstranění případných Markdown obalů před parsováním JSONu
        const cleanedText: string = responseText.replace(/```json|```/g, '').trim();

        // Parsování JSON odpovědi
        let parsedPayload: unknown;
        try {
          parsedPayload = JSON.parse(cleanedText);
        } catch (parseError: unknown) {
          const errorDetails: string =
            parseError instanceof Error ? parseError.message : String(parseError);
          throw new Error(
            `Chyba při JSON parsování výstupu z modelu '${modelCandidate}': ${errorDetails}\nSurový výstup:\n${responseText}`
          );
        }

        // Validace a ověření typů
        const validatedItems: StreetFoodItem[] = validateStreetFoodData(parsedPayload);

        if (validatedItems.length === 0) {
          throw new Error(`Model '${modelCandidate}' vrátil prázdný seznam jídel ([]).`);
        }

        return {
          success: true,
          modelUsed: modelCandidate,
          items: validatedItems,
        };
      } catch (error: unknown) {
        const errorMessage: string =
          error instanceof Error ? error.message : String(error);

        // Při chybě 503 (vysoké vytížení / High Demand) počkáme 3 sekundy a zkusíme to ještě jednou
        const is503Error: boolean =
          errorMessage.includes('503') ||
          errorMessage.includes('UNAVAILABLE') ||
          errorMessage.includes('high demand') ||
          errorMessage.includes('overloaded');

        if (is503Error && attempt < maxAttempts) {
          console.warn(
            `⚠️ Model '${modelCandidate}' vrátil chybu 503 (vysoké vytížení / high demand). Čekám 3 sekundy před opakováním...`
          );
          await new Promise((resolve) => setTimeout(resolve, 3000));
          continue; // Zkusí to na stejném modelu ještě jednou
        }

        // Ošetření případu, kdy model v daném projektu neexistuje (404),
        // nepodporuje responseSchema (400), selhal na výstupu (parse/validace), nebo je dočasně přetížen (503/429/500)
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
          errorMessage.includes('Chyba při JSON parsování') ||
          errorMessage.includes('nesplňuje schéma') ||
          errorMessage.includes('prázdný seznam') ||
          errorMessage.includes('není polem');

        if (isSkipableModelError) {
          console.warn(
            `ℹ️ Model '${modelCandidate}' nebylo možné použít (${errorMessage.slice(0, 85)}...). Zkouším další model...`
          );
          lastError = error instanceof Error ? error : new Error(errorMessage);
          break; // Ukončí while cyklus pro tento model a přejde na další kandidáta
        }

        // Pro závažné chyby (např. špatný klíč - 403) cyklus okamžitě ukončíme
        throw error;
      }
    }
  }

  throw (
    lastError ||
    new Error('Žádný z testovaných modelů nedokázal vrátit validní strukturovaná data.')
  );
}

/**
 * Vstupní bod programu.
 */
async function main(): Promise<void> {
  try {
    const result: StreetFoodResult = await getStreetFoodRecommendations();
    printStreetFoodCatalog(result.items, result.modelUsed);
  } catch (error: unknown) {
    const errorMessage: string =
      error instanceof Error ? error.message : 'Neznámá systémová chyba.';
    console.error('\n❌ Nastala chyba při zpracování:', errorMessage);
    process.exit(1);
  }
}

// Spuštění skriptu
void main();
