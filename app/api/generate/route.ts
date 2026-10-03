import { NextResponse } from 'next/server';
import { GoogleGenAI, Type, Schema, GenerateContentResponse } from '@google/genai';
import { db } from '../../../lib/firebase';
import { collection, addDoc } from 'firebase/firestore';

export interface Place {
  id?: string;
  title: string;
  category: string;
  description: string;
  recommendedTimeOfDay: string;
  city: string;
  spicinessLevel?: number;
  priceCZK?: number;
  createdAt?: string;
}

const singlePlaceSchema: Schema = {
  type: Type.OBJECT,
  description: 'Detailní strukturované informace o novém místě nebo aktivitě.',
  properties: {
    title: {
      type: Type.STRING,
      description: 'Název aktivity nebo místa (minimálně 2 znaky).',
    },
    category: {
      type: Type.STRING,
      description: 'Kategorie (Příroda, Kavárny, Kultura, Street Food).',
    },
    description: {
      type: Type.STRING,
      description: 'Poutavý popis v češtině (2-3 věty).',
    },
    recommendedTimeOfDay: {
      type: Type.STRING,
      description: 'Doporučená doba návštěvy (např. Brzy ráno, Ráno, Dopoledne, Odpoledne, Podvečer, Večer).',
    },
    city: {
      type: Type.STRING,
      description: 'Město, ve kterém se místo nachází.',
    },
    spicinessLevel: {
      type: Type.INTEGER,
      description: 'Úroveň pálivosti od 1 do 5 (1 = nepálivé/sladké/chrámy, 2 = mírné, 3 = středně pálivé, 4 = velmi pálivé, 5 = autentické pálivé street food/jídlo). Výchozí 1.',
    },
    priceCZK: {
      type: Type.INTEGER,
      description: 'Orientační cena nebo vstupné v Kč (např. 60-150 pro street food/kavárny, 100-250 pro chrámy, 0 pro přírodu).',
    },
  },
  required: ['title', 'category', 'description', 'recommendedTimeOfDay', 'city', 'spicinessLevel'],
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
    const city = body.city || 'Luang Prabang';
    const category = body.category || '';

    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API klíč pro Gemini nebyl nalezen v konfiguračních proměnných.' },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const categoryPrompt = category
      ? `spadající do kategorie '${category}'`
      : 's novou a zajímavou kategorií (např. Gastronomie, Trhy, Vyhlídky, Relaxace, Adrenalin, Řeky)';

    const prompt =
      `Vygeneruj jedno originální a atraktivní místo nebo aktivitu pro cestovatele ve městě '${city}' ${categoryPrompt}. ` +
      `Ujisti se, že město v odpovědi je přesně '${city}'. ` +
      `Výstup musí přesně odpovídat definovanému JSON schématu bez jakéhokoliv dalšího textu.`;

    let generatedPlace: Place | null = null;
    let usedModel = '';
    let lastError: Error | null = null;

    for (const modelCandidate of CANDIDATE_MODELS) {
      let attempt = 0;
      const maxAttempts = 3;

      while (attempt < maxAttempts) {
        attempt++;
        try {
          console.log(`🤖 Next.js Server API: Generuji přes '${modelCandidate}' pro ${city}...`);
          const response: GenerateContentResponse = await ai.models.generateContent({
            model: modelCandidate,
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: singlePlaceSchema,
            },
          });

          const responseText = response.text;
          if (!responseText) throw new Error('Model vrátil prázdný výstup.');

          const cleanedText = responseText.replace(/```json|```/g, '').trim();
          const parsed = JSON.parse(cleanedText) as Record<string, unknown>;

          generatedPlace = {
            title: String(parsed.title || `Zážitek v ${city}`),
            category: String(parsed.category || category || 'Kultura'),
            description: String(parsed.description || ''),
            recommendedTimeOfDay: String(parsed.recommendedTimeOfDay || 'Dopoledne'),
            city: String(parsed.city || city),
            spicinessLevel: Math.max(1, Math.min(5, Number(parsed.spicinessLevel) || 1)),
            priceCZK: typeof parsed.priceCZK === 'number' ? Math.max(0, parsed.priceCZK) : undefined,
          };
          usedModel = modelCandidate;
          break;
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err);
          const is503 =
            errMsg.includes('503') ||
            errMsg.includes('UNAVAILABLE') ||
            errMsg.includes('high demand') ||
            errMsg.includes('overloaded');

          if (is503 && attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 1500));
            continue;
          }

          lastError = err instanceof Error ? err : new Error(errMsg);
          break;
        }
      }

      if (generatedPlace) break;
    }

    if (!generatedPlace) {
      throw lastError || new Error('Žádný AI model nedokázal vygenerovat výsledek.');
    }

    // Uložení vygenerovaného místa do Firestore
    const placesRef = collection(db, 'places');
    const docRef = await addDoc(placesRef, {
      ...generatedPlace,
      createdAt: new Date().toISOString(),
    });

    generatedPlace.id = docRef.id;

    return NextResponse.json({
      success: true,
      place: generatedPlace,
      modelUsed: usedModel,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
