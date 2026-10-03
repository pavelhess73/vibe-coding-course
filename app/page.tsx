'use client';

import { useState, useEffect, useMemo } from 'react';
import { z } from 'zod';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import {
  Compass,
  MapPin,
  Sparkles,
  Clock,
  Tag,
  Loader2,
  CheckCircle2,
  Search,
  Bot,
  Database,
  Flame,
  Sun,
  Sunrise,
  Sunset,
  Moon,
  Zap,
  X,
  Copy,
  Check,
  Trees,
  UtensilsCrossed,
  Coffee,
  Landmark,
  ShieldCheck,
  Banknote,
  SlidersHorizontal,
  Filter,
  RotateCcw,
} from 'lucide-react';

/**
 * 1. ZOD SCHÉMA: PlaceSchema
 * Validuje data načtená z databáze Firestore i vstupy z AI generování.
 */
export const PlaceSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(2, { message: 'Název místa musí obsahovat alespoň 2 znaky' }),
  category: z.string().min(1, { message: 'Kategorie je povinná' }),
  description: z.string().min(1, { message: 'Popis místa je povinný' }),
  recommendedTimeOfDay: z.string().min(1, { message: 'Doporučená doba je povinná' }),
  city: z.string().min(1, { message: 'Město je povinné' }),
  spicinessLevel: z
    .number()
    .int({ message: 'Pálivost musí být celé číslo' })
    .min(1, { message: 'Minimální pálivost je 1' })
    .max(5, { message: 'Maximální pálivost je 5' })
    .nullish()
    .transform((val) => val ?? 1)
    .default(1),
  priceCZK: z
    .number()
    .min(0, { message: 'Cena nemůže být záporná' })
    .nullish()
    .transform((val) => val ?? undefined)
    .optional(),
  createdAt: z.string().optional(),
});

export type Place = z.infer<typeof PlaceSchema>;

const CITIES = [
  {
    id: 'Luang Prabang',
    name: 'Luang Prabang',
    country: 'Laos',
    flag: '🇱🇦',
    tagline: 'Královské město chrámů, přírodních vodopádů a ranních rituálů',
    image: 'https://images.unsplash.com/photo-1528181304800-259b08848526?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'Bangkok',
    name: 'Bangkok',
    country: 'Thajsko',
    flag: '🇹🇭',
    tagline: 'Fascinující metropole zlatých paláců, nočních trhů a street foodu',
    image: 'https://images.unsplash.com/photo-1508009603885-50cf7c579365?auto=format&fit=crop&w=800&q=80',
  },
];

/**
 * Požadované kategorie podle zadání:
 * 'Vše', 'Příroda', 'Kavárny', 'Kultura', 'Street Food'
 */
const CATEGORIES = [
  { id: 'all', label: 'Vše', icon: Compass },
  { id: 'Příroda', label: 'Příroda', icon: Trees },
  { id: 'Kavárny', label: 'Kavárny', icon: Coffee },
  { id: 'Kultura', label: 'Kultura', icon: Landmark },
  { id: 'Street Food', label: 'Street Food', icon: UtensilsCrossed },
] as const;

const SPICINESS_LEVELS = [
  { level: 1, label: 'Jemné', chilis: '🌶️', desc: 'Nepálivé / Jemné' },
  { level: 2, label: 'Mírné', chilis: '🌶️🌶️', desc: 'Mírně pálivé' },
  { level: 3, label: 'Střední', chilis: '🌶️🌶️🌶️', desc: 'Středně pálivé' },
  { level: 4, label: 'Pálivé', chilis: '🌶️🌶️🌶️🌶️', desc: 'Velmi pálivé' },
  { level: 5, label: 'Extra 🔥', chilis: '🌶️🌶️🌶️🌶️🔥', desc: 'Pekelně pálivé' },
] as const;

export default function TravelDiscoveryPage() {
  const [selectedCity, setSelectedCity] = useState<string>('Luang Prabang');

  // Filtrační stavy
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSpiciness, setSelectedSpiciness] = useState<'all' | number>('all');
  const [spicinessFilterMode, setSpicinessFilterMode] = useState<'exact' | 'max'>('exact');

  // Data a UI stavy
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [generating, setGenerating] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showAIModal, setShowAIModal] = useState<boolean>(false);
  const [customCategoryInput, setCustomCategoryInput] = useState<string>('');
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  /**
   * Zabezpečené načítání z Firebase Firestore:
   * Každý načtený dokument projde přes PlaceSchema.safeParse().
   * Pokud validace selže, vypíše varování do konzole a neplatný dokument přeskočí.
   */
  useEffect(() => {
    setLoading(true);
    const placesRef = collection(db, 'places');
    const q = query(placesRef, where('city', '==', selectedCity));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const loadedPlaces: Place[] = [];
        let invalidCount = 0;

        snapshot.forEach((doc) => {
          const rawData = {
            id: doc.id,
            ...doc.data(),
          };

          const parseResult = PlaceSchema.safeParse(rawData);

          if (!parseResult.success) {
            console.warn(
              `⚠️ [Zod validace selhala] Dokument ID "${doc.id}" ve městě "${selectedCity}" neprošel schématem PlaceSchema a byl přeskočen:`,
              parseResult.error.format()
            );
            invalidCount++;
            return; // Přeskočení neplatného dokumentu
          }

          loadedPlaces.push(parseResult.data);
        });

        if (invalidCount > 0) {
          console.warn(
            `⚠️ Celkem přeskočeno ${invalidCount} dokumentů, které nesplnily validační schéma PlaceSchema.`
          );
        }

        // Řazení podle data vytvoření (nejnovější nahoře)
        loadedPlaces.sort((a, b) => {
          if (a.createdAt && b.createdAt) {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          }
          return a.title.localeCompare(b.title);
        });

        setPlaces(loadedPlaces);
        setLoading(false);
      },
      (error) => {
        console.error('Chyba Firestore:', error);
        setNotification({
          message: `Chyba načítání Firestore: ${error.message}`,
          type: 'error',
        });
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [selectedCity]);

  /**
   * Pokročilé filtrování na klientovi:
   * 1. Search Bar: Vyhledávání v reálném čase v title i description
   * 2. Filtr kategorií: 'Vše', 'Příroda', 'Kavárny', 'Kultura', 'Street Food'
   * 3. Pálivostní filtr: Podle úrovně pálivosti (Range / Buttons)
   */
  const filteredPlaces = useMemo(() => {
    return places.filter((place) => {
      // 1. Search Bar (v reálném čase v title i description)
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        q === '' ||
        place.title.toLowerCase().includes(q) ||
        place.description.toLowerCase().includes(q);

      // 2. Filtr kategorií
      let matchesCategory = true;
      if (selectedCategory !== 'all') {
        const cat = place.category.toLowerCase();
        if (selectedCategory === 'Příroda') {
          matchesCategory =
            cat.includes('přírod') ||
            cat.includes('prirod') ||
            cat.includes('vodopád') ||
            cat.includes('vodopad') ||
            cat.includes('nature') ||
            cat.includes('park');
        } else if (selectedCategory === 'Kavárny') {
          matchesCategory =
            cat.includes('kavárn') ||
            cat.includes('kavarn') ||
            cat.includes('cafe') ||
            cat.includes('café') ||
            cat.includes('káva') ||
            cat.includes('kava') ||
            cat.includes('coffee') ||
            cat.includes('čaj') ||
            cat.includes('tea');
        } else if (selectedCategory === 'Kultura') {
          matchesCategory =
            cat.includes('kultur') ||
            cat.includes('chrám') ||
            cat.includes('chram') ||
            cat.includes('památk') ||
            cat.includes('pamatk') ||
            cat.includes('histor') ||
            cat.includes('muzeum') ||
            cat.includes('museum') ||
            cat.includes('rituál');
        } else if (selectedCategory === 'Street Food') {
          matchesCategory =
            cat.includes('street food') ||
            cat.includes('streetfood') ||
            cat.includes('gastro') ||
            cat.includes('jídlo') ||
            cat.includes('jidlo') ||
            cat.includes('trh') ||
            cat.includes('food') ||
            cat.includes('polévka') ||
            cat.includes('restaur');
        } else {
          matchesCategory = cat.includes(selectedCategory.toLowerCase());
        }
      }

      // 3. Pálivostní filtr
      let matchesSpiciness = true;
      if (selectedSpiciness !== 'all') {
        const targetLvl = Number(selectedSpiciness);
        const placeLvl = place.spicinessLevel ?? 1;

        if (spicinessFilterMode === 'exact') {
          matchesSpiciness = placeLvl === targetLvl;
        } else {
          // 'max' mód - vyfiltrovat do zvolené úrovně
          matchesSpiciness = placeLvl <= targetLvl;
        }
      }

      return matchesSearch && matchesCategory && matchesSpiciness;
    });
  }, [places, searchQuery, selectedCategory, selectedSpiciness, spicinessFilterMode]);

  // Vygenerování nového AI doporučení přes /api/generate
  const handleAddAIPlace = async (requestedCategory?: string) => {
    try {
      setGenerating(true);
      setShowAIModal(false);
      const targetCat = requestedCategory || customCategoryInput || '';

      setNotification({
        message: `🤖 Gemini AI generuje nové doporučení pro ${selectedCity}${targetCat ? ` (${targetCat})` : ''}...`,
        type: 'info',
      });

      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: selectedCity, category: targetCat }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || 'Generování selhalo.');
      }

      setNotification({
        message: `✨ Uloženo! Model ${data.modelUsed} vytvořil místo "${data.place.title}" ve Firestore!`,
        type: 'success',
      });
      setCustomCategoryInput('');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Neznámá chyba.';
      setNotification({
        message: `❌ Generování selhalo: ${errMsg}`,
        type: 'error',
      });
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedCategory('all');
    setSelectedSpiciness('all');
    setSpicinessFilterMode('exact');
  };

  const getTimeBadge = (timeOfDay: string) => {
    const lower = timeOfDay.toLowerCase();
    let icon = <Clock className="w-3.5 h-3.5 text-slate-400" />;
    let color = 'bg-slate-800/80 text-slate-300 border-slate-700/60';

    if (lower.includes('brzy') || lower.includes('ráno')) {
      icon = <Sunrise className="w-3.5 h-3.5 text-amber-400" />;
      color = 'bg-amber-950/40 text-amber-300 border-amber-500/30';
    } else if (lower.includes('dopoledne') || lower.includes('odpoledne')) {
      icon = <Sun className="w-3.5 h-3.5 text-orange-400" />;
      color = 'bg-orange-950/40 text-orange-300 border-orange-500/30';
    } else if (lower.includes('podvečer')) {
      icon = <Sunset className="w-3.5 h-3.5 text-rose-400" />;
      color = 'bg-rose-950/40 text-rose-300 border-rose-500/30';
    } else if (lower.includes('večer') || lower.includes('noc')) {
      icon = <Moon className="w-3.5 h-3.5 text-indigo-400" />;
      color = 'bg-indigo-950/40 text-indigo-300 border-indigo-500/30';
    }

    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${color}`}>
        {icon}
        <span>{timeOfDay}</span>
      </span>
    );
  };

  const getCategoryBadgeClass = (category: string) => {
    const lower = category.toLowerCase();
    if (lower.includes('příroda') || lower.includes('vodopád') || lower.includes('priroda'))
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 shadow-emerald-500/10';
    if (lower.includes('kavárn') || lower.includes('kavarn') || lower.includes('cafe') || lower.includes('káva'))
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30 shadow-amber-500/10';
    if (lower.includes('kultura') || lower.includes('chrám') || lower.includes('památk') || lower.includes('chram'))
      return 'bg-purple-500/15 text-purple-300 border-purple-500/30 shadow-purple-500/10';
    if (lower.includes('street food') || lower.includes('gastro') || lower.includes('jídlo') || lower.includes('trh'))
      return 'bg-orange-500/15 text-orange-300 border-orange-500/30 shadow-orange-500/10';
    return 'bg-slate-700/50 text-slate-300 border-slate-600/50';
  };

  const getSpicinessBadge = (level: number = 1) => {
    const safeLvl = Math.max(1, Math.min(5, level));
    const chilis = '🌶️'.repeat(safeLvl);
    const labels: Record<number, string> = {
      1: 'Nepálivé / Jemné',
      2: 'Mírně pálivé',
      3: 'Středně pálivé',
      4: 'Velmi pálivé',
      5: 'Extra pálivé 🔥',
    };
    const colorClasses: Record<number, string> = {
      1: 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30',
      2: 'bg-yellow-950/40 text-yellow-300 border-yellow-500/30',
      3: 'bg-orange-950/40 text-orange-300 border-orange-500/30',
      4: 'bg-red-950/50 text-red-300 border-red-500/40',
      5: 'bg-rose-950/60 text-rose-200 border-rose-500/60 shadow-lg shadow-rose-950/50',
    };

    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${
          colorClasses[safeLvl] || colorClasses[1]
        }`}
        title={`Úroveň pálivosti: ${safeLvl}/5 (${labels[safeLvl]})`}
      >
        <Flame className="w-3.5 h-3.5 text-rose-400" />
        <span>{chilis}</span>
        <span className="opacity-90 font-medium text-[11px]">{labels[safeLvl]}</span>
      </span>
    );
  };

  const activeCityInfo = CITIES.find((c) => c.id === selectedCity) || CITIES[0];
  const isAnyFilterActive =
    searchQuery.trim() !== '' || selectedCategory !== 'all' || selectedSpiciness !== 'all';

  return (
    <div className="min-h-screen pb-20 relative">
      {/* 1. HERO HEADER WITH BACKDROP PHOTO & INTEGRATED CONTROLS */}
      <header className="relative w-full overflow-hidden border-b border-slate-800/80 mb-10">
        {/* Background Image */}
        <div
          className="absolute inset-0 z-0 opacity-30 bg-cover bg-center filter saturate-125"
          style={{ backgroundImage: "url('/hero.jpg')" }}
        />
        <div className="absolute inset-0 z-0 bg-gradient-to-b from-slate-950/85 via-slate-950/92 to-slate-950" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 relative z-10 space-y-8">
          {/* Header Title Section */}
          <div className="flex flex-col items-center text-center space-y-5">
            {/* Top Live Pill */}
            <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs sm:text-sm font-semibold shadow-lg shadow-amber-500/10 backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Zod Validace & Pokročilé Filtrování</span>
            </div>

            {/* Main Title */}
            <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white max-w-4xl leading-tight">
              JV Asie{' '}
              <span className="text-gradient-gold">Travel Discovery</span>
            </h1>

            {/* Subtitle */}
            <p className="text-slate-300 text-base sm:text-lg max-w-2xl font-light leading-relaxed">
              Objevujte nejkrásnější chrámy, přírodu, kavárny a street food v jihovýchodní Asii. S bezpečnou Zod validací a pokročilým vyhledáváním v reálném čase.
            </p>

            {/* Stats Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 pt-2 w-full max-w-3xl">
              <div className="glass-panel p-3 rounded-xl text-center">
                <div className="text-xs text-slate-400 font-medium flex items-center justify-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-amber-400" /> Firestore DB
                </div>
                <div className="text-lg font-bold text-white mt-0.5">{places.length} Míst</div>
              </div>
              <div className="glass-panel p-3 rounded-xl text-center">
                <div className="text-xs text-slate-400 font-medium flex items-center justify-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Validováno
                </div>
                <div className="text-lg font-bold text-emerald-300 mt-0.5">Zod 100%</div>
              </div>
              <div className="glass-panel p-3 rounded-xl text-center">
                <div className="text-xs text-slate-400 font-medium flex items-center justify-center gap-1.5">
                  <Bot className="w-3.5 h-3.5 text-cyan-400" /> Gemini AI
                </div>
                <div className="text-lg font-bold text-cyan-300 mt-0.5">3.8 Flash</div>
              </div>
              <div className="glass-panel p-3 rounded-xl text-center col-span-2 sm:col-span-1">
                <div className="text-xs text-slate-400 font-medium flex items-center justify-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-emerald-400" /> Sync State
                </div>
                <div className="text-lg font-bold text-emerald-400 mt-0.5">Live ⚡</div>
              </div>
            </div>
          </div>

          {/* HLAVIČKOVÉ OVLÁDACÍ PRVKY: SEARCH BAR, FILTR KATEGORIÍ A PÁLIVOSTNÍ FILTR */}
          <div className="w-full max-w-5xl mx-auto glass-panel p-5 sm:p-7 rounded-3xl border border-amber-500/25 shadow-2xl backdrop-blur-xl space-y-6 text-left relative z-20">
            {/* Control Panel Title & Reset Button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 text-amber-400 shadow-inner">
                  <SlidersHorizontal className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    <span>Filtrování a vyhledávání</span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> PlaceSchema.safeParse()
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400">
                    Ovládací prvky pro bleskové vyhledávání, výběr kategorií a pálivosti
                  </p>
                </div>
              </div>

              {isAnyFilterActive && (
                <button
                  onClick={handleResetFilters}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-amber-300 hover:text-white bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 transition-all self-start sm:self-center cursor-pointer shadow-sm"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Vymazat filtry</span>
                </button>
              )}
            </div>

            {/* 1. SEARCH BAR (INPUT): Vyhledávání v názvu a popisu místa v reálném čase */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="place-search-input"
                  className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5"
                >
                  <Search className="w-3.5 h-3.5 text-amber-400" />
                  Vyhledávání (název a popis v reálném čase):
                </label>
                {searchQuery && (
                  <span className="text-xs text-amber-400 font-medium">
                    Nalezeno {filteredPlaces.length} ze {places.length}
                  </span>
                )}
              </div>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="place-search-input"
                  type="text"
                  placeholder="Hledat v názvu nebo popisu místa (např. vodopád, káva, trh, chrám, polévka)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl pl-10 pr-10 py-3 text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all shadow-inner"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition-colors"
                    title="Smazat hledání"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* 2. FILTR KATEGORIÍ (SELECT / PILLS): 'Vše', 'Příroda', 'Kavárny', 'Kultura', 'Street Food' */}
            <div className="space-y-2.5 pt-1">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label
                  htmlFor="category-select-dropdown"
                  className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5"
                >
                  <Filter className="w-3.5 h-3.5 text-amber-400" />
                  Filtr kategorií (Pills / Select):
                </label>

                {/* Select Dropdown (přístupný i na mobilu i desktopu) */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 uppercase tracking-wider">Výběr:</span>
                  <select
                    id="category-select-dropdown"
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500 cursor-pointer"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat.id} value={cat.id} className="bg-slate-900 text-slate-200">
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Pills Buttons pro kategorie */}
              <div className="flex items-center gap-2 flex-wrap">
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const isActive = selectedCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 border cursor-pointer ${
                        isActive
                          ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/25 scale-[1.02]'
                          : 'bg-slate-900/80 text-slate-300 border-slate-800 hover:border-slate-700 hover:bg-slate-800/80 hover:text-white'
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${isActive ? 'text-slate-950' : 'text-amber-400'}`} />
                      <span>{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. PÁLIVOSTNÍ FILTR (RANGE / BUTTONS): Možnost vyfiltrovat pouze jídla/místa podle pálivosti */}
            <div className="space-y-3 pt-3 border-t border-slate-800/80">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-rose-400" />
                  Pálivostní filtr (Buttons / Range):
                </label>

                {/* Mód filtrování: Přesná hodnota vs Maximální pálivost (do) */}
                <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 self-start sm:self-auto">
                  <button
                    onClick={() => setSpicinessFilterMode('exact')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                      spicinessFilterMode === 'exact'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Přesná úroveň (=)
                  </button>
                  <button
                    onClick={() => setSpicinessFilterMode('max')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                      spicinessFilterMode === 'max'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Do úrovně (max ≤)
                  </button>
                </div>
              </div>

              {/* Tlačítka pálivosti (Buttons) */}
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                <button
                  onClick={() => setSelectedSpiciness('all')}
                  className={`px-3 py-2.5 rounded-xl text-xs font-semibold transition-all border text-center cursor-pointer ${
                    selectedSpiciness === 'all'
                      ? 'bg-slate-700 text-white border-slate-500 shadow-md'
                      : 'bg-slate-900/70 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  Všechny pálivosti
                </button>

                {SPICINESS_LEVELS.map(({ level, label, chilis }) => {
                  const isActive = selectedSpiciness === level;
                  return (
                    <button
                      key={level}
                      onClick={() => setSelectedSpiciness(level)}
                      className={`flex flex-col items-center justify-center p-2 rounded-xl text-xs font-semibold transition-all border cursor-pointer ${
                        isActive
                          ? level === 5
                            ? 'bg-rose-950/80 border-rose-500 text-rose-200 shadow-lg shadow-rose-950/60 scale-[1.02]'
                            : level >= 3
                            ? 'bg-orange-950/80 border-orange-500 text-orange-200 shadow-lg shadow-orange-950/60 scale-[1.02]'
                            : 'bg-amber-950/80 border-amber-500 text-amber-200 shadow-lg shadow-amber-950/60 scale-[1.02]'
                          : 'bg-slate-900/70 text-slate-300 border-slate-800 hover:bg-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      <span className="text-xs">{chilis}</span>
                      <span className="text-[10px] opacity-80 mt-0.5 font-normal">
                        {level} • {label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Interaktivní posuvník pálivosti (Range Slider) */}
              <div className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Jemné (1 🌶️)</span>
                  <span className="font-semibold text-amber-400">
                    {selectedSpiciness === 'all'
                      ? 'Posuňte pro filtr pálivosti'
                      : spicinessFilterMode === 'exact'
                      ? `Vybrána přesně úroveň: ${selectedSpiciness} 🌶️`
                      : `Filtrováno do úrovně: ${selectedSpiciness} 🌶️`}
                  </span>
                  <span className="text-rose-400">Extra pálivé (5 🌶️🔥)</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  step="1"
                  value={typeof selectedSpiciness === 'number' ? selectedSpiciness : 3}
                  onChange={(e) => setSelectedSpiciness(Number(e.target.value))}
                  className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
                <div className="flex justify-between text-[10px] text-slate-500 px-1">
                  <span>1: Jemné</span>
                  <span>2: Mírné</span>
                  <span>3: Střední</span>
                  <span>4: Pálivé</span>
                  <span>5: Extra 🔥</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT CONTAINER */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* NOTIFICATION BANNER */}
        {notification && (
          <div
            className={`p-4 rounded-xl border flex items-center justify-between text-sm transition-all duration-300 ${
              notification.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-200 shadow-lg shadow-emerald-950/50'
                : notification.type === 'info'
                ? 'bg-amber-950/80 border-amber-500/40 text-amber-200 shadow-lg shadow-amber-950/50'
                : 'bg-rose-950/80 border-rose-500/40 text-rose-200 shadow-lg shadow-rose-950/50'
            }`}
          >
            <div className="flex items-center gap-3">
              {notification.type === 'info' && <Loader2 className="w-5 h-5 animate-spin text-amber-400 shrink-0" />}
              {notification.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
              <span className="font-medium">{notification.message}</span>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="text-xs opacity-75 hover:opacity-100 underline ml-4 shrink-0 cursor-pointer"
            >
              Zavřít
            </button>
          </div>
        )}

        {/* 2. CITY SELECTOR TABS & ACTION BUTTON */}
        <section className="glass-panel p-5 sm:p-6 rounded-2xl space-y-6">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-6">
            {/* City Tabs */}
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 self-start sm:self-center mr-1">
                Vyberte destinaci:
              </span>
              <div className="grid grid-cols-2 gap-2.5 w-full sm:w-auto">
                {CITIES.map((city) => {
                  const isActive = selectedCity === city.id;
                  return (
                    <button
                      key={city.id}
                      onClick={() => {
                        setSelectedCity(city.id);
                        setSelectedCategory('all');
                      }}
                      className={`flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl font-bold text-sm sm:text-base transition-all duration-300 relative overflow-hidden cursor-pointer ${
                        isActive
                          ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-slate-950 shadow-lg shadow-amber-500/25 scale-[1.02]'
                          : 'bg-slate-900/90 text-slate-300 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/80'
                      }`}
                    >
                      <span className="text-lg">{city.flag}</span>
                      <span>{city.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* TLAČÍTKO 'Přidat nové AI doporučení' */}
            <div className="flex items-center gap-3 w-full lg:w-auto">
              <button
                onClick={() => setShowAIModal(true)}
                disabled={generating}
                className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-slate-950 font-bold text-sm sm:text-base hover:brightness-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-xl shadow-amber-500/20 cursor-pointer"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-slate-950" />
                    <span>Generuji s Gemini AI...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 text-slate-950" />
                    <span>Přidat nové AI doporučení</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Active City Tagline */}
          <div className="pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between text-xs sm:text-sm text-slate-400 gap-2">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-amber-500" />
              <span className="text-slate-200 font-medium">{activeCityInfo.name}</span>
              <span className="hidden sm:inline text-slate-500">• {activeCityInfo.tagline}</span>
            </div>
            <span className="text-slate-400 text-xs flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Data validována přes Zod PlaceSchema
            </span>
          </div>
        </section>

        {/* 3. STAV NAČÍTÁNÍ / SKELETON STATE */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 my-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="glass-card p-6 rounded-2xl space-y-4 animate-shimmer">
                <div className="flex justify-between items-center">
                  <div className="h-6 w-2/3 bg-slate-800 rounded-md" />
                  <div className="h-5 w-1/4 bg-slate-800 rounded-full" />
                </div>
                <div className="h-16 w-full bg-slate-800/60 rounded-md" />
                <div className="h-8 w-1/3 bg-slate-800 rounded-md pt-2" />
              </div>
            ))}
          </div>
        ) : filteredPlaces.length === 0 ? (
          /* EMPTY STATE */
          <div className="glass-panel p-12 rounded-2xl text-center flex flex-col items-center justify-center gap-4 my-8">
            <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400">
              <Compass className="w-8 h-8 text-amber-500" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-bold text-white">Nenalezeny žádné výsledky</h3>
              <p className="text-slate-400 text-sm max-w-md">
                {searchQuery
                  ? `Žádné místo pro hledání "${searchQuery}" neodpovídá zvoleným filtrům.`
                  : `Pro město ${selectedCity} a zadané filtry nebyly v databázi nalezeny žádné položky.`}
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              {isAnyFilterActive && (
                <button
                  onClick={handleResetFilters}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition-colors cursor-pointer"
                >
                  Resetovat filtry
                </button>
              )}
              <button
                onClick={() => handleAddAIPlace(selectedCategory !== 'all' ? selectedCategory : undefined)}
                disabled={generating}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 text-sm font-medium hover:bg-amber-500/30 transition-colors shadow-lg shadow-amber-500/10 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Vygenerovat přes Gemini AI</span>
              </button>
            </div>
          </div>
        ) : (
          /* 4. SEZNAM KARET (GRID UI) */
          <section className="space-y-6">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium uppercase tracking-wider px-1">
              <span>
                Zobrazeno {filteredPlaces.length} ze {places.length} doporučení
                {isAnyFilterActive && ' (filtrováno)'}
              </span>
              <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Live Firestore Connection
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredPlaces.map((place) => (
                <article
                  key={place.id || place.title}
                  className="glass-card p-6 rounded-2xl flex flex-col justify-between relative group overflow-hidden"
                >
                  {/* Glowing Top Border Accent */}
                  <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                  <div className="space-y-4">
                    {/* Header + Badge */}
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-xl font-bold text-white group-hover:text-amber-300 transition-colors duration-200 line-clamp-2 leading-snug">
                        {place.title}
                      </h2>
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border shrink-0 shadow-sm ${getCategoryBadgeClass(
                          place.category
                        )}`}
                      >
                        <Tag className="w-3 h-3" />
                        {place.category}
                      </span>
                    </div>

                    {/* Description */}
                    <p className="text-slate-300 text-sm leading-relaxed line-clamp-4 font-normal">
                      {place.description}
                    </p>

                    {/* Parametry místa: Pálivost + Cena */}
                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      {/* Pálivostní štítek */}
                      {getSpicinessBadge(place.spicinessLevel)}

                      {/* Orientační cena (pokud existuje) */}
                      {place.priceCZK !== undefined && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border bg-emerald-950/40 text-emerald-300 border-emerald-500/30">
                          <Banknote className="w-3.5 h-3.5 text-emerald-400" />
                          <span>{place.priceCZK > 0 ? `${place.priceCZK} Kč` : 'Zdarma'}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Footer: Time Badge & Document ID */}
                  <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between gap-2">
                    {getTimeBadge(place.recommendedTimeOfDay)}

                    {place.id && (
                      <button
                        onClick={() => copyToClipboard(place.id!)}
                        title="Kopírovat Firestore ID"
                        className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 transition-colors px-2 py-1 rounded bg-slate-900/60 border border-slate-800 cursor-pointer"
                      >
                        {copiedId === place.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400">Zkopírováno</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3 text-slate-500" />
                            <span>ID: {place.id.slice(0, 6)}...</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* AI GENERATION MODAL DIALOG */}
      {showAIModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="glass-panel max-w-lg w-full p-6 sm:p-8 rounded-3xl space-y-6 border border-amber-500/20 shadow-2xl relative">
            <button
              onClick={() => setShowAIModal(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800/60 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-amber-400 uppercase tracking-wider">
                <Sparkles className="w-4 h-4" /> Gemini AI Generator
              </div>
              <h3 className="text-2xl font-bold text-white">
                Vygenerovat nové místo pro {selectedCity}
              </h3>
              <p className="text-slate-400 text-sm">
                AI navrhne autentické místo nebo pokrm, vytvoří strukturovaná data s pálivostí a cenou a uloží je přímo do Firestore.
              </p>
            </div>

            {/* Quick category select in modal */}
            <div className="space-y-3">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Zvolte požadovanou kategorii:
              </label>
              <div className="grid grid-cols-2 gap-2">
                {['Street Food', 'Kavárny', 'Příroda', 'Kultura'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => handleAddAIPlace(cat)}
                    className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-amber-500/50 hover:bg-slate-800/80 text-left text-xs font-medium text-slate-200 flex items-center justify-between group transition-all cursor-pointer"
                  >
                    <span>{cat}</span>
                    <Sparkles className="w-3.5 h-3.5 text-amber-500/50 group-hover:text-amber-400 transition-colors" />
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between gap-3 border-t border-slate-800">
              <button
                onClick={() => setShowAIModal(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-800 text-slate-400 hover:text-white text-xs font-medium cursor-pointer"
              >
                Zrušit
              </button>
              <button
                onClick={() => handleAddAIPlace()}
                className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-bold text-xs hover:brightness-110 transition-all shadow-lg shadow-amber-500/20 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>Náhodný výběr AI</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
