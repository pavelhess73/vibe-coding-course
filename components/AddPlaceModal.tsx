'use client';

import { useState, useEffect } from 'react';
import { z } from 'zod';
import { db } from '../lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import {
  X,
  Sparkles,
  MapPin,
  FileText,
  Tag,
  Loader2,
  WifiOff,
  Wifi,
  AlertTriangle,
  PlusCircle,
  CheckCircle2,
} from 'lucide-react';

/**
 * 1. ZOD SCHÉMA PRO FORMULÁŘ
 * - title: min. 2 znaky
 * - rawNote: min. 5 znaků
 * - city: min. 1 znak
 */
export const AddPlaceFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, { message: 'Název místa musí mít alespoň 2 znaky' }),
  city: z
    .string()
    .trim()
    .min(1, { message: 'Město je povinné' }),
  rawNote: z
    .string()
    .trim()
    .min(5, { message: 'Stručná poznámka musí mít alespoň 5 znaků' }),
});

export type AddPlaceFormData = z.infer<typeof AddPlaceFormSchema>;

export interface EnrichmentResult {
  category: string;
  description: string;
  recommendedTimeOfDay: string;
  spicinessLevel: number;
  lat?: number;
  lng?: number;
}

import { enrichCustomPlaceAction } from '../app/actions/generatePlace';

const DEFAULT_CITIES = [
  'Luang Prabang',
  'Bangkok',
  'Hanoj',
  'Saigon (HCMC)',
  'Pattaya',
];

interface AddPlaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCity?: string;
  onSuccess?: (title: string, isEnriched: boolean, rateLimitWarning?: boolean) => void;
}

export default function AddPlaceModal({
  isOpen,
  onClose,
  defaultCity = 'Luang Prabang',
  onSuccess,
}: AddPlaceModalProps) {
  const [title, setTitle] = useState('');
  const [selectedCity, setSelectedCity] = useState(defaultCity);
  const [isCustomCity, setIsCustomCity] = useState(false);
  const [customCityInput, setCustomCityInput] = useState('');
  const [rawNote, setRawNote] = useState('');

  const [errors, setErrors] = useState<{ title?: string; city?: string; rawNote?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(true);

  // Sledování online / offline stavu prohlížeče
  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Reset formuláře při otevření
  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setSelectedCity(DEFAULT_CITIES.includes(defaultCity) ? defaultCity : 'Luang Prabang');
      setIsCustomCity(!DEFAULT_CITIES.includes(defaultCity) && Boolean(defaultCity));
      setCustomCityInput(!DEFAULT_CITIES.includes(defaultCity) ? defaultCity : '');
      setRawNote('');
      setErrors({});
      setSubmitting(false);
    }
  }, [isOpen, defaultCity]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const effectiveCity = isCustomCity ? customCityInput : selectedCity;

    // 1. ZOD VALIDACE
    const parseResult = AddPlaceFormSchema.safeParse({
      title,
      city: effectiveCity,
      rawNote,
    });

    if (!parseResult.success) {
      const formattedErrors: { title?: string; city?: string; rawNote?: string } = {};
      parseResult.error.issues.forEach((issue) => {
        const fieldName = issue.path[0] as keyof typeof formattedErrors;
        if (fieldName) {
          formattedErrors[fieldName] = issue.message;
        }
      });
      setErrors(formattedErrors);
      return;
    }

    const validData = parseResult.data;
    setSubmitting(true);

    let enriched: EnrichmentResult | null = null;
    let enrichedSuccess = false;
    let rateLimited = false;

    // 2. AI ENRICHMENT PŘES SERVER ACTION (pokud jsme online)
    if (isOnline) {
      try {
        const result = await enrichCustomPlaceAction({
          title: validData.title,
          city: validData.city,
          rawNote: validData.rawNote,
        });

        if (result.success && result.enrichment) {
          enriched = result.enrichment;
          enrichedSuccess = true;
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg.includes('limit AI') || errMsg.includes('5/10 min')) {
          rateLimited = true;
        }
        console.warn('⚠️ Gemini AI enrichment selhal, ukládám neobohacený tip:', errMsg);
      }
    }

    // 3. SESTAVENÍ VÝSLEDNÉHO OBJEKTU PRO FIRESTORE
    const placeDoc = {
      title: validData.title,
      city: validData.city,
      category: enriched?.category || 'Vlastní tip',
      description: enriched?.description || validData.rawNote,
      recommendedTimeOfDay: enriched?.recommendedTimeOfDay || 'Celý den',
      spicinessLevel: enriched?.spicinessLevel ?? 1,
      lat: enriched?.lat,
      lng: enriched?.lng,
      createdAt: new Date().toISOString(),
    };

    try {
      // 4. ULOŽENÍ DO FIRESTORE (funguje i offline díky IndexedDB cache)
      const placesRef = collection(db, 'places');
      await addDoc(placesRef, placeDoc);

      setSubmitting(false);
      if (onSuccess) {
        onSuccess(validData.title, enrichedSuccess, rateLimited);
      }
      onClose();
    } catch (err: unknown) {
      console.error('Chyba při ukládání do Firestore:', err);
      setErrors({ title: 'Chyba při ukládání do databáze Firestore.' });
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="glass-panel max-w-lg w-full p-6 sm:p-8 rounded-3xl space-y-6 border border-amber-500/30 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        {/* Zavírací tlačítko */}
        <button
          onClick={onClose}
          disabled={submitting}
          className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-xl hover:bg-slate-800/80 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Hlavička modalu */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-amber-400 uppercase tracking-wider">
              <PlusCircle className="w-4 h-4 text-amber-400" />
              <span>Zadání vlastní doporučení</span>
            </div>

            {/* Online / Offline status badge */}
            {isOnline ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                <Wifi className="w-3 h-3 text-emerald-400" />
                <span>Online (AI Aktivní)</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-300">
                <WifiOff className="w-3 h-3 text-amber-400" />
                <span>Offline Režim</span>
              </span>
            )}
          </div>

          <h3 className="text-2xl font-extrabold text-white flex items-center gap-2">
            ➕ Přidat vlastní tip z cest
          </h3>
          <p className="text-slate-300 text-xs sm:text-sm">
            Zadejte svůj objev! Při připojení jej <strong className="text-amber-300">Gemini AI automaticky obohatí</strong> o kategorii, poutavý popis a GPS souřadnice.
          </p>
        </div>

        {/* Upozornění pro Offline Režim */}
        {!isOnline && (
          <div className="p-3.5 rounded-2xl bg-amber-950/60 border border-amber-500/40 text-amber-200 text-xs flex items-start gap-2.5 shadow-lg">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">Offline režim detekován:</span>
              AI enrichment vyžaduje internetové připojení. Váš tip bude bezpečně uložen do offline Firestore databáze bez obohacení.
            </div>
          </div>
        )}

        {/* FORMULÁŘ */}
        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          {/* 1. NÁZEV MÍSTA / PODNIKU */}
          <div className="space-y-1.5">
            <label htmlFor="add-place-title" className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-amber-400" />
              Název místa / podniku: <span className="text-rose-400">*</span>
            </label>
            <input
              id="add-place-title"
              type="text"
              placeholder="např. Night Market Noodle Stall, Wat Xieng Thong..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`w-full bg-slate-900/90 border rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${
                errors.title
                  ? 'border-rose-500 focus:ring-rose-500/30'
                  : 'border-slate-700/80 focus:border-amber-500 focus:ring-amber-500/20'
              }`}
            />
            {errors.title && (
              <p className="text-xs text-rose-400 font-medium flex items-center gap-1">
                <span>⚠️</span> {errors.title}
              </p>
            )}
          </div>

          {/* 2. MĚSTO (VÝBĚR ZE SEZNAMU NEBO VLASTNÍ TEXT) */}
          <div className="space-y-1.5">
            <label htmlFor="add-place-city-select" className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-amber-400" />
              Město / Destinace: <span className="text-rose-400">*</span>
            </label>

            {!isCustomCity ? (
              <div className="flex gap-2">
                <select
                  id="add-place-city-select"
                  value={selectedCity}
                  onChange={(e) => {
                    if (e.target.value === 'CUSTOM') {
                      setIsCustomCity(true);
                      setCustomCityInput('');
                    } else {
                      setSelectedCity(e.target.value);
                    }
                  }}
                  className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 cursor-pointer"
                >
                  {DEFAULT_CITIES.map((c) => (
                    <option key={c} value={c} className="bg-slate-900 text-slate-100">
                      {c}
                    </option>
                  ))}
                  <option value="CUSTOM" className="bg-slate-900 text-amber-400 font-bold">
                    ✏️ Jiné město (zadat vlastní text)...
                  </option>
                </select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Zadejte název vlastního města..."
                    value={customCityInput}
                    onChange={(e) => setCustomCityInput(e.target.value)}
                    className={`w-full bg-slate-900/90 border rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${
                      errors.city
                        ? 'border-rose-500 focus:ring-rose-500/30'
                        : 'border-amber-500/80 focus:border-amber-500 focus:ring-amber-500/20'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomCity(false);
                      setSelectedCity('Luang Prabang');
                    }}
                    className="px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 text-xs text-slate-300 hover:text-white transition-colors cursor-pointer shrink-0"
                  >
                    Seznam
                  </button>
                </div>
              </div>
            )}
            {errors.city && (
              <p className="text-xs text-rose-400 font-medium flex items-center gap-1">
                <span>⚠️</span> {errors.city}
              </p>
            )}
          </div>

          {/* 3. STRUČNÁ POZNÁMKA NEBO DOJEM (RAW NOTE) */}
          <div className="space-y-1.5">
            <label htmlFor="add-place-raw-note" className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-amber-400" />
              Stručná poznámka nebo dojem: <span className="text-rose-400">*</span>
            </label>
            <textarea
              id="add-place-raw-note"
              rows={3}
              placeholder="Napište 1-2 věty o atmosféře, jídle nebo zážitku (např. Skvělé Khao Soi polévky u milé babičky)..."
              value={rawNote}
              onChange={(e) => setRawNote(e.target.value)}
              className={`w-full bg-slate-900/90 border rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${
                errors.rawNote
                  ? 'border-rose-500 focus:ring-rose-500/30'
                  : 'border-slate-700/80 focus:border-amber-500 focus:ring-amber-500/20'
              }`}
            />
            {errors.rawNote && (
              <p className="text-xs text-rose-400 font-medium flex items-center gap-1">
                <span>⚠️</span> {errors.rawNote}
              </p>
            )}
          </div>

          {/* PATIČKA A TLAČÍTKA */}
          <div className="pt-4 border-t border-slate-800/80 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 rounded-xl border border-slate-800 text-slate-400 hover:text-white text-xs font-medium cursor-pointer transition-colors"
            >
              Zrušit
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-slate-950 font-extrabold text-sm hover:brightness-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-xl shadow-amber-500/20 cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                  <span>{isOnline ? 'Obohacuji přes Gemini AI...' : 'Ukládám offline...'}</span>
                </>
              ) : isOnline ? (
                <>
                  <Sparkles className="w-4 h-4 text-slate-950" />
                  <span>Uložit & Obohatit AI</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-slate-950" />
                  <span>Uložit bez enrichmentu (Offline)</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
