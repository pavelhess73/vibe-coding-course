import { NextResponse } from 'next/server';
import { GoogleGenAI, Type, Schema, GenerateContentResponse } from '@google/genai';

export interface EnrichmentResult {
  category: string;
  description: string;
  recommendedTimeOfDay: string;
  spicinessLevel: number;
  lat?: number;
  lng?: number;
}

const singleEnrichmentSchema: Schema = {
  type: Type.OBJECT,
  description: 'Strukturované obohacení turistického tipu vygenerované z uživatelského názvu a poznámky.',
  properties: {
    category: {
      type: Type.STRING,
      description: 'Kategorie místa (např. Street Food, Kultura, Kavárny, Příroda, Trhy, Vyhlídky).',
    },
    description: {
      type: Type.STRING,
      description: 'Poutavý popis v češtině (2-3 věty) kombinující název a uživatelskou poznámku.',
    },
    recommendedTimeOfDay: {
      type: Type.STRING,
      description: 'Doporučená doba návštěvy (např. Brzy ráno, Ráno, Dopoledne, Odpoledne, Podvečer, Večer, Celý den).',
    },
    spicinessLevel: {
      type: Type.INTEGER,
      description: 'Úroveň pálivosti 1 až 5 (1 = nepálivé/sladké/chrámy, 5 = pekelně pálivé). Výchozí 1.',
    },
    lat: {
      type: Type.NUMBER,
      description: 'Odhad zeměpisné šířky pro toto místo ve zadaném městě.',
    },
    lng: {
      type: Type.NUMBER,
      description: 'Odhad zeměpisné délky pro toto místo ve zadaném městě.',
    },
  },
  required: ['category', 'description', 'recommendedTimeOfDay', 'spicinessLevel', 'lat', 'lng'],
};

const CANDIDATE_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
  'gemini-1.5-flash',
  'gemini-flash-latest',
];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, city, rawNote } = body;

    if (!title || !rawNote) {
      return NextResponse.json(
        { error: 'Chybí povinné údaje (title nebo rawNote).' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API klíč pro Gemini nebyl nalezen.' },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt =
      `Jsi expertní cestovatelský průvodce po jihovýchodní Asii. Uživatel zadal osobní tip z cest pro město '${city || 'JV Asie'}':\n` +
      `- Název místa: "${title}"\n` +
      `- Poznámka/dojem: "${rawNote}"\n\n` +
      `Na základě těchto údajů vytvoř strukturované obohacení (enrichment) pro toto místo:\n` +
      `1. Vyber vhodnou kategorii ('Street Food', 'Kultura', 'Kavárny', 'Příroda' atd.).\n` +
      `2. Vytvoř chytlavý a poutavý popis v češtině (2-3 věty).\n` +
      `3. Urči vhodnou dobu návštěvy (např. 'Brzy ráno', 'Odpoledne', 'Večer').\n` +
      `4. Urči úroveň pálivosti 1-5 (1 pokud nejde o pálivé jídlo).\n` +
      `5. Odhadni přibližné GPS souřadnice lat/lng pro dané město.\n` +
      `Výstup musí přesně odpovídat definovanému JSON schématu.`;

    let enrichmentData: EnrichmentResult | null = null;
    let usedModel = '';
    let lastError: Error | null = null;

    for (const modelCandidate of CANDIDATE_MODELS) {
      let attempt = 0;
      const maxAttempts = 3;

      while (attempt < maxAttempts) {
        attempt++;
        try {
          console.log(`🤖 AI Enrichment API: Zkouším model '${modelCandidate}'...`);
          const response: GenerateContentResponse = await ai.models.generateContent({
            model: modelCandidate,
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: singleEnrichmentSchema,
            },
          });

          const responseText = response.text;
          if (!responseText) throw new Error('Model vrátil prázdný výstup.');

          const cleanedText = responseText.replace(/```json|```/g, '').trim();
          const parsed = JSON.parse(cleanedText) as Record<string, unknown>;

          enrichmentData = {
            category: String(parsed.category || 'Kultura'),
            description: String(parsed.description || rawNote),
            recommendedTimeOfDay: String(parsed.recommendedTimeOfDay || 'Celý den'),
            spicinessLevel: Math.max(1, Math.min(5, Number(parsed.spicinessLevel) || 1)),
            lat: typeof parsed.lat === 'number' ? parsed.lat : undefined,
            lng: typeof parsed.lng === 'number' ? parsed.lng : undefined,
          };
          usedModel = modelCandidate;
          break;
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.warn(`Pokus ${attempt} pro model ${modelCandidate} selhal: ${errMsg}`);
          const isRetryable =
            errMsg.includes('503') ||
            errMsg.includes('UNAVAILABLE') ||
            errMsg.includes('high demand') ||
            errMsg.includes('overloaded');

          if (isRetryable && attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 1500));
            continue;
          }

          lastError = err instanceof Error ? err : new Error(errMsg);
          break;
        }
      }

      if (enrichmentData) break;
    }

    if (!enrichmentData) {
      throw lastError || new Error('Žádný Gemini model nedokázal provést AI enrichment.');
    }

    return NextResponse.json({
      success: true,
      enrichment: enrichmentData,
      modelUsed: usedModel,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
