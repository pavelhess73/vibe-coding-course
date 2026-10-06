'use server';

import { headers } from 'next/headers';
import { GoogleGenAI, Type, Schema, GenerateContentResponse } from '@google/genai';
import { checkRateLimit } from '../../lib/rateLimit';
import { db } from '../../lib/firebase';
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
  lat?: number;
  lng?: number;
  createdAt?: string;
  imageUrl?: string;
}

export interface EnrichmentResult {
  category: string;
  description: string;
  recommendedTimeOfDay: string;
  spicinessLevel: number;
  lat?: number;
  lng?: number;
}

const singlePlaceSchema: Schema = {
  type: Type.OBJECT,
  description: 'Detailní strukturované informace o novém místě nebo aktivitě.',
  properties: {
    title: { type: Type.STRING, description: 'Název aktivity nebo místa.' },
    category: { type: Type.STRING, description: 'Kategorie (Příroda, Kavárny, Kultura, Street Food, Kraftová Piva).' },
    description: { type: Type.STRING, description: 'Poutavý popis v češtině (2-3 věty).' },
    recommendedTimeOfDay: { type: Type.STRING, description: 'Doporučená doba návštěvy.' },
    city: { type: Type.STRING, description: 'Město, ve kterém se místo nachází.' },
    spicinessLevel: { type: Type.INTEGER, description: 'Úroveň pálivosti od 1 do 5.' },
    priceCZK: { type: Type.INTEGER, description: 'Orientační cena v Kč.' },
    lat: { type: Type.NUMBER, description: 'Zeměpisná šířka.' },
    lng: { type: Type.NUMBER, description: 'Zeměpisná délka.' },
    imageQuery: {
      type: Type.STRING,
      description:
        'Short English keywords for an Unsplash photo search representing this specific place or dish (e.g. "luang prabang temple monk", "bangkok street food pad thai", "hanoi pho noodles"). 3-5 words, lowercase, no commas.',
    },
  },
  required: ['title', 'category', 'description', 'recommendedTimeOfDay', 'city', 'spicinessLevel', 'lat', 'lng', 'imageQuery'],
};

const singleEnrichmentSchema: Schema = {
  type: Type.OBJECT,
  description: 'Strukturované obohacení pro uživatelský tip.',
  properties: {
    category: { type: Type.STRING, description: 'Kategorie místa (Příroda, Kavárny, Kultura, Street Food, Kraftová Piva).' },
    description: { type: Type.STRING, description: 'Poutavý popis v češtině.' },
    recommendedTimeOfDay: { type: Type.STRING, description: 'Doporučená doba návštěvy.' },
    spicinessLevel: { type: Type.INTEGER, description: 'Úroveň pálivosti 1-5.' },
    lat: { type: Type.NUMBER, description: 'Zeměpisná šířka.' },
    lng: { type: Type.NUMBER, description: 'Zeměpisná délka.' },
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

/**
 * Získá klientskou IP adresu ze serverových hlaviček HTTP požadavku.
 */
async function getClientIp(): Promise<string> {
  try {
    const headerList = await headers();
    const forwarded = headerList.get('x-forwarded-for');
    const realIp = headerList.get('x-real-ip');
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    if (realIp) {
      return realIp.trim();
    }
  } catch {
    // Fallback pokud headers nepodaří načíst
  }
  return '127.0.0.1';
}

/**
 * Server Action: Generování nového náhodného AI místa pro město
 */
export async function generateAIPlaceAction(params?: { city?: string; category?: string }) {
  const clientIp = await getClientIp();

  // 1. RATE LIMITING TEST
  const rateLimitResult = checkRateLimit(clientIp);
  if (!rateLimitResult.success) {
    throw new Error('⚠️ Překročen limit AI generování (max 5/10 min). Zkuste to prosím za chvíli.');
  }

  const city = params?.city || 'Luang Prabang';
  const category = params?.category || '';

  // Použití serverové proměnné GEMINI_API_KEY (s fallbackem na NEXT_PUBLIC_GEMINI_API_KEY)
  const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('API klíč pro Gemini nebyl nalezen.');
  }

  const ai = new GoogleGenAI({ apiKey });

  const isCraftBeer =
    category === 'Kraftová Piva' ||
    category.toLowerCase().includes('piv') ||
    category.toLowerCase().includes('craft') ||
    category.toLowerCase().includes('beer');

  const categoryPrompt = category
    ? `spadající do kategorie '${category}'`
    : 's novou a zajímavou kategorií (např. Gastronomie, Trhy, Vyhlídky, Relaxace, Kraftová Piva, Řeky)';

  let craftBeerInstructions = '';
  if (isCraftBeer) {
    craftBeerInstructions =
      ` PRO KATEGORII 'Kraftová Piva': Doporuč unikátní lokální kraftový pivovar, taproom nebo mikropivovar v daném městě '${city}' ` +
      `(např. Pasteur Street Brewing Co. nebo Heart of Darkness v Saigonu / Ho Chi Minh City; ` +
      `Furbrew, Standing Bar nebo Turtle Lake Brewing v Hanoji; ` +
      `Mikkeller Bangkok, Hair of the Dog nebo Chit Hole v Bangkoku; ` +
      `případně lokální řemeslné pivo / microbrewery v Luang Prabang). ` +
      `Doporučení v popisu (description) MUSÍ výslovně obsahovat: ` +
      `1. Konkrétní název pivovaru / podniku, ` +
      `2. Konkrétní styl a název piva (např. Jasmine IPA, Dragonfruit Gose, Imperial Chocolate Stout, Lemongrass Wheat Ale apod.), ` +
      `3. Atmosféru podniku a vibe prostoru (např. střešní terasa, industriální interiér, živá hudba, útulný taproom). ` +
      `Pole category MUSÍ mít hodnotu 'Kraftová Piva'. ` +
      `Pole imageQuery musí obsahovat anglická klíčová slova pro Unsplash (např. 'craft beer taproom brewery bar ${city.toLowerCase()}').`;
  }

  const prompt =
    `Vygeneruj jedno originální a atraktivní místo nebo aktivitu pro cestovatele ve městě '${city}' ${categoryPrompt}. ` +
    (craftBeerInstructions ? `${craftBeerInstructions} ` : '') +
    `Ujisti se, že město v odpovědi je přesně '${city}'. ` +
    `Výstup musí přesně odpovídat definovanému JSON schématu bez jakéhokoliv dalšího textu.`;

  let generatedPlace: Place | null = null;
  let usedModel = '';
  let lastError: Error | null = null;

  for (const modelCandidate of CANDIDATE_MODELS) {
    let attempt = 0;
    const maxAttempts = 2;

    while (attempt < maxAttempts) {
      attempt++;
      try {
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

        const rawImageQuery = String(
          parsed.imageQuery || (isCraftBeer ? `craft beer taproom ${city}` : `${city} travel`)
        ).trim();
        const encodedQuery = encodeURIComponent(rawImageQuery);
        const imageUrl = `https://images.unsplash.com/photo-1535958636474-b021ee887b13?auto=format&fit=crop&w=800&q=80&usq=${encodedQuery}`;
        // We use a known Unsplash photo as base but carry the query as metadata;
        // for dynamic results we build a source.unsplash-style URL via the featured endpoint:
        const dynamicImageUrl = `https://images.unsplash.com/search/photos?query=${encodedQuery}&per_page=1`;
        // Use the Unsplash source CDN URL for direct embedding (no API key needed)
        const finalImageUrl = `https://source.unsplash.com/800x600/?${encodedQuery}`;

        void imageUrl; void dynamicImageUrl; // suppress unused var warnings

        generatedPlace = {
          title: String(parsed.title || `Zážitek v ${city}`),
          category: isCraftBeer ? 'Kraftová Piva' : String(parsed.category || category || 'Kultura'),
          description: String(parsed.description || ''),
          recommendedTimeOfDay: String(parsed.recommendedTimeOfDay || 'Dopoledne'),
          city: String(parsed.city || city),
          spicinessLevel: Math.max(1, Math.min(5, Number(parsed.spicinessLevel) || 1)),
          priceCZK: typeof parsed.priceCZK === 'number' ? Math.max(0, parsed.priceCZK) : undefined,
          lat: typeof parsed.lat === 'number' ? parsed.lat : undefined,
          lng: typeof parsed.lng === 'number' ? parsed.lng : undefined,
          imageUrl: finalImageUrl,
        };
        usedModel = modelCandidate;
        break;
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        break;
      }
    }

    if (generatedPlace) break;
  }

  if (!generatedPlace) {
    throw lastError || new Error('Žádný AI model nedokázal vygenerovat výsledek.');
  }

  // Uložení do Firestore (včetně imageUrl)
  const placesRef = collection(db, 'places');
  const docRef = await addDoc(placesRef, {
    ...generatedPlace,
    createdAt: new Date().toISOString(),
  });

  generatedPlace.id = docRef.id;

  return {
    success: true,
    place: generatedPlace,
    modelUsed: usedModel,
  };
}

/**
 * Server Action: Enrichment vlastního uživatelského tipu
 */
export async function enrichCustomPlaceAction(params: { title: string; city: string; rawNote: string }) {
  const clientIp = await getClientIp();

  // 1. RATE LIMITING TEST
  const rateLimitResult = checkRateLimit(clientIp);
  if (!rateLimitResult.success) {
    throw new Error('⚠️ Překročen limit AI generování (max 5/10 min). Zkuste to prosím za chvíli.');
  }

  const { title, city, rawNote } = params;

  if (!title || !rawNote) {
    throw new Error('Chybí povinné údaje (title nebo rawNote).');
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('API klíč pro Gemini nebyl nalezen.');
  }

  const ai = new GoogleGenAI({ apiKey });

  const prompt =
    `Jsi expertní cestovatelský průvodce po jihovýchodní Asii. Uživatel zadal osobní tip z cest pro město '${city || 'JV Asie'}':\n` +
    `- Název místa: "${title}"\n` +
    `- Poznámka/dojem: "${rawNote}"\n\n` +
    `Na základě těchto údajů vytvoř strukturované obohacení (enrichment) pro toto místo:\n` +
    `1. Vyber vhodnou kategorii ('Street Food', 'Kultura', 'Kavárny', 'Příroda', 'Kraftová Piva' atd.).\n` +
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
    const maxAttempts = 2;

    while (attempt < maxAttempts) {
      attempt++;
      try {
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
        lastError = err instanceof Error ? err : new Error(String(err));
        break;
      }
    }

    if (enrichmentData) break;
  }

  if (!enrichmentData) {
    throw lastError || new Error('Žádný Gemini model nedokázal provést AI enrichment.');
  }

  return {
    success: true,
    enrichment: enrichmentData,
    modelUsed: usedModel,
  };
}
