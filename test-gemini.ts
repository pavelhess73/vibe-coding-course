import { GoogleGenAI, GenerateContentResponse } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';

// Načtení konfigurace ze souboru .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

interface GeminiTestResult {
  success: boolean;
  modelUsed: string;
  message: string;
}

interface ModelItem {
  name: string;
  displayName?: string;
  supportedActions?: string[];
}

/**
 * Získá seznam všech dostupných modelů podporujících generateContent.
 */
async function getAvailableContentModels(ai: GoogleGenAI): Promise<string[]> {
  try {
    const modelsPager = await ai.models.list();
    const contentModels: string[] = [];

    for await (const model of modelsPager as AsyncIterable<ModelItem>) {
      if (model.supportedActions?.includes('generateContent')) {
        const cleanName: string = model.name.replace(/^models\//, '');
        contentModels.push(cleanName);
      }
    }

    return contentModels;
  } catch (error: unknown) {
    const errorMessage: string =
      error instanceof Error ? error.message : 'Neznámá chyba při načítání seznamu modelů.';
    throw new Error(`Kritická chyba při získávání seznamu modelů: ${errorMessage}`);
  }
}

/**
 * Provede volání API s automatickým retriem při chybě 503 (vysoké vytížení / UNAVAILABLE).
 */
async function generateWithRetry(
  ai: GoogleGenAI,
  modelName: string,
  prompt: string,
  maxRetries: number = 3,
  delayMs: number = 2000
): Promise<GenerateContentResponse> {
  let attempt: number = 0;

  while (attempt < maxRetries) {
    try {
      attempt++;
      const response: GenerateContentResponse = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
      });
      return response;
    } catch (error: unknown) {
      const errorString: string = error instanceof Error ? error.message : String(error);
      const is503Error: boolean =
        errorString.includes('503') ||
        errorString.includes('UNAVAILABLE') ||
        errorString.includes('high demand');

      if (is503Error && attempt < maxRetries) {
        console.warn(
          `⚠️ Model '${modelName}' vrátil chybu 503 (vysoké vytížení). Pokus ${attempt}/${maxRetries}. Čekám ${delayMs / 1000}s...`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else {
        throw error;
      }
    }
  }

  throw new Error(`Nepodařilo se získat odpověď od modelu '${modelName}' ani po ${maxRetries} pokusech.`);
}

async function runGeminiTest(): Promise<GeminiTestResult> {
  const apiKey: string | undefined =
    process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      'API klíč nebyl nalezen. Ujistěte se, že máte v souboru .env.local definovanou proměnnou GEMINI_API_KEY nebo NEXT_PUBLIC_GEMINI_API_KEY.'
    );
  }

  const ai: GoogleGenAI = new GoogleGenAI({ apiKey });

  console.log('🔍 Načítám seznam dostupných modelů z Gemini API...');
  const availableModels: string[] = await getAvailableContentModels(ai);

  console.log('📋 Modely podporující `generateContent`:');
  availableModels.forEach((model: string, index: number) => {
    console.log(`   ${index + 1}. ${model}`);
  });

  if (availableModels.length === 0) {
    throw new Error('Nebyly nalezeny žádné dostupné modely podporující generateContent.');
  }

  const prompt: string =
    'Ahoj Gemini, potvrdíš mi, že náš setup funguje? Odpověz jednou vtipnou větou v češtině.';

  let lastError: Error | null = null;

  // Procházíme dostupné modely dokud nenalezneme plně podporovaný model
  for (const modelCandidate of availableModels) {
    try {
      console.log(`\n🚀 Zkouším odeslat dotaz na model '${modelCandidate}'...`);
      const response: GenerateContentResponse = await generateWithRetry(
        ai,
        modelCandidate,
        prompt
      );

      const responseText: string | undefined = response.text;
      if (responseText) {
        return {
          success: true,
          modelUsed: modelCandidate,
          message: responseText.trim(),
        };
      }
    } catch (error: unknown) {
      const errorMessage: string =
        error instanceof Error ? error.message : String(error);

      // Přeskočíme nedostupné (404), nepodporující TEXT (400) nebo vyčerpané (429) speciální modely
      const isSkipableError: boolean =
        errorMessage.includes('404') ||
        errorMessage.includes('400') ||
        errorMessage.includes('429') ||
        errorMessage.includes('NOT_FOUND') ||
        errorMessage.includes('RESOURCE_EXHAUSTED') ||
        errorMessage.includes('no longer available') ||
        errorMessage.includes('response modalities');

      if (isSkipableError) {
        console.warn(`ℹ️ Model '${modelCandidate}' nebylo možné použít pro tento dotaz (${errorMessage.slice(0, 80)}...). Přeskakuji...`);
        lastError = error instanceof Error ? error : new Error(errorMessage);
        continue;
      }

      // Pro kritické chyby (např. 403 PERMISSION_DENIED z důvodu neplatného klíče) přerušíme cyklus
      throw error;
    }
  }

  throw lastError || new Error('Žádný z dostupných modelů nepřijal požádaný dotaz.');
}

async function main(): Promise<void> {
  try {
    const result: GeminiTestResult = await runGeminiTest();
    console.log(`\n✅ Odpověď od Gemini (model: ${result.modelUsed}):`);
    console.log(`"${result.message}"`);
  } catch (error: unknown) {
    const errorMessage: string =
      error instanceof Error ? error.message : 'Neznámá chyba při komunikaci s API.';
    console.error('\n❌ Při testování Gemini API došlo k chybě:', errorMessage);
    process.exit(1);
  }
}

void main();
