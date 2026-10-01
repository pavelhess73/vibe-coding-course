'use client';

import { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import {
  Compass,
  MapPin,
  Sparkles,
  Clock,
  Tag,
  Plus,
  Loader2,
  CheckCircle2,
  Search,
  Bot,
  Database,
  ExternalLink,
  Flame,
  Sun,
  Sunrise,
  Sunset,
  Moon,
  Zap,
  X,
  Copy,
  Check,
  Building2,
  Trees,
  UtensilsCrossed,
  Palmtree
} from 'lucide-react';

export interface Place {
  id?: string;
  title: string;
  category: string;
  description: string;
  recommendedTimeOfDay: string;
  city: string;
  createdAt?: string;
}

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

const CATEGORIES = [
  { id: 'all', label: 'Všechny kategorie', icon: Compass },
  { id: 'Kultura', label: 'Kultura & Rituály', icon: Flame },
  { id: 'Příroda', label: 'Příroda & Vodopády', icon: Trees },
  { id: 'Chrám', label: 'Chrámy & Památky', icon: Building2 },
  { id: 'Gastronomie', label: 'Gastronomie & Trhy', icon: UtensilsCrossed },
];

export default function TravelDiscoveryPage() {
  const [selectedCity, setSelectedCity] = useState<string>('Luang Prabang');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [generating, setGenerating] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showAIModal, setShowAIModal] = useState<boolean>(false);
  const [customCategoryInput, setCustomCategoryInput] = useState<string>('');
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Načítání z Firebase Firestore v reálném čase
  useEffect(() => {
    setLoading(true);
    const placesRef = collection(db, 'places');
    const q = query(placesRef, where('city', '==', selectedCity));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const loadedPlaces: Place[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          loadedPlaces.push({
            id: doc.id,
            title: data.title || 'Bez názvu',
            category: data.category || 'Všeobecné',
            description: data.description || '',
            recommendedTimeOfDay: data.recommendedTimeOfDay || 'Kdykoliv',
            city: data.city || selectedCity,
            createdAt: data.createdAt,
          });
        });

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

  // Filtrovaná data na klientovi (kategorie + hledání)
  const filteredPlaces = useMemo(() => {
    return places.filter((place) => {
      const matchesCategory =
        selectedCategory === 'all' ||
        place.category.toLowerCase().includes(selectedCategory.toLowerCase()) ||
        selectedCategory.toLowerCase().includes(place.category.toLowerCase());

      const matchesSearch =
        searchQuery.trim() === '' ||
        place.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        place.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        place.category.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesCategory && matchesSearch;
    });
  }, [places, selectedCategory, searchQuery]);

  // Vygenerování nového AI doporučení přes /api/generate
  const handleAddAIPlace = async (requestedCategory?: string) => {
    try {
      setGenerating(true);
      setShowAIModal(false);
      const targetCat = requestedCategory || customCategoryInput || '';

      setNotification({
        message: `🤖 Gemini AI vygenerovává nové doporučení pro ${selectedCity}${targetCat ? ` (${targetCat})` : ''}...`,
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
    if (lower.includes('příroda') || lower.includes('vodopád'))
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 shadow-emerald-500/10';
    if (lower.includes('chrám') || lower.includes('religiózní'))
      return 'bg-purple-500/15 text-purple-300 border-purple-500/30 shadow-purple-500/10';
    if (lower.includes('kultura') || lower.includes('trh'))
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30 shadow-amber-500/10';
    if (lower.includes('gastro') || lower.includes('jídlo'))
      return 'bg-rose-500/15 text-rose-300 border-rose-500/30 shadow-rose-500/10';
    if (lower.includes('vyhlídka') || lower.includes('adrenalin'))
      return 'bg-sky-500/15 text-sky-300 border-sky-500/30 shadow-sky-500/10';
    return 'bg-slate-700/50 text-slate-300 border-slate-600/50';
  };

  const activeCityInfo = CITIES.find((c) => c.id === selectedCity) || CITIES[0];

  return (
    <div className="min-h-screen pb-20 relative">
      {/* 1. HERO HEADER WITH BACKDROP PHOTO & GRADIENT OVERLAY */}
      <header className="relative w-full overflow-hidden border-b border-slate-800/80 mb-10">
        {/* Background Image */}
        <div className="absolute inset-0 z-0 opacity-35 bg-cover bg-center filter saturate-125" style={{ backgroundImage: "url('/hero.jpg')" }} />
        <div className="absolute inset-0 z-0 bg-gradient-to-b from-slate-950/80 via-slate-950/90 to-slate-950" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 relative z-10">
          <div className="flex flex-col items-center text-center space-y-6">
            {/* Top Live Pill */}
            <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs sm:text-sm font-semibold shadow-lg shadow-amber-500/10 backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Vibe Coding Course • Lesson 4 App</span>
            </div>

            {/* Main Title */}
            <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white max-w-4xl leading-tight">
              JV Asie{' '}
              <span className="text-gradient-gold">Travel Discovery</span>
            </h1>

            {/* Subtitle */}
            <p className="text-slate-300 text-base sm:text-lg max-w-2xl font-light leading-relaxed">
              Objevujte nejkrásnější chrámové komplexy, přírodní skvosty a pouliční trhy v jihovýchodní Asii. Propojeno v reálném čase s Firebase Firestore & Gemini 3.8 AI.
            </p>

            {/* Stats Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-6 pt-4 w-full max-w-2xl">
              <div className="glass-panel p-3.5 rounded-xl text-center">
                <div className="text-xs text-slate-400 font-medium flex items-center justify-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-amber-400" /> Firestore DB
                </div>
                <div className="text-lg font-bold text-white mt-0.5">{places.length} Míst</div>
              </div>
              <div className="glass-panel p-3.5 rounded-xl text-center">
                <div className="text-xs text-slate-400 font-medium flex items-center justify-center gap-1.5">
                  <Bot className="w-3.5 h-3.5 text-cyan-400" /> Gemini AI
                </div>
                <div className="text-lg font-bold text-cyan-300 mt-0.5">3.8 & 3.5 Flash</div>
              </div>
              <div className="glass-panel p-3.5 rounded-xl text-center col-span-2 sm:col-span-1">
                <div className="text-xs text-slate-400 font-medium flex items-center justify-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-emerald-400" /> Sync State
                </div>
                <div className="text-lg font-bold text-emerald-400 mt-0.5">Realtime ⚡</div>
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
              className="text-xs opacity-75 hover:opacity-100 underline ml-4 shrink-0"
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
                Vyberte město:
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
                      className={`flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl font-bold text-sm sm:text-base transition-all duration-300 relative overflow-hidden ${
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

            {/* 5. TLAČÍTKO 'Přidat nové AI doporuření' */}
            <div className="flex items-center gap-3 w-full lg:w-auto">
              <button
                onClick={() => setShowAIModal(true)}
                disabled={generating}
                className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-slate-950 font-bold text-sm sm:text-base hover:brightness-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-xl shadow-amber-500/20"
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
          <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs sm:text-sm text-slate-400">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-amber-500" />
              <span className="text-slate-200 font-medium">{activeCityInfo.name}</span>
              <span className="hidden sm:inline text-slate-500">• {activeCityInfo.tagline}</span>
            </div>
            <span className="text-slate-400 text-xs">
              Všechna data načtena přímo z Firestore
            </span>
          </div>
        </section>

        {/* CATEGORY CHIPS & SEARCH FILTER BAR */}
        <section className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          {/* Category Chips */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-none">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isActive = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap transition-all duration-200 border ${
                    isActive
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-500/10'
                      : 'bg-slate-900/60 text-slate-400 border-slate-800/80 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-amber-400' : 'text-slate-500'}`} />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-64">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Vyhledat v klíčových slovech..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900/80 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs sm:text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
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
                  ? `Žádné místo pro "${searchQuery}" neodpovídá hledání.`
                  : `Pro město ${selectedCity} a vybrané kritérium nebyly v DB nalezeny položky.`}
              </p>
            </div>
            <button
              onClick={() => handleAddAIPlace(selectedCategory !== 'all' ? selectedCategory : undefined)}
              disabled={generating}
              className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 text-sm font-medium hover:bg-amber-500/30 transition-colors shadow-lg shadow-amber-500/10"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Vygenerovat přes Gemini AI</span>
            </button>
          </div>
        ) : (
          /* 4. SEZNAM KARET (GRID UI) */
          <section className="space-y-6">
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium uppercase tracking-wider px-1">
              <span>Zobrazeno {filteredPlaces.length} ze {places.length} doporučení</span>
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
                  </div>

                  {/* Card Footer: Time Badge & Document ID */}
                  <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between gap-2">
                    {getTimeBadge(place.recommendedTimeOfDay)}

                    {place.id && (
                      <button
                        onClick={() => copyToClipboard(place.id!)}
                        title="Kopírovat Firestore ID"
                        className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 transition-colors px-2 py-1 rounded bg-slate-900/60 border border-slate-800"
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
              className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800/60 transition-colors"
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
                AI navrhne autentické místo nebo aktivitu, vytvoří strukturovaná data a okamžitě je uloží do databáze Firestore.
              </p>
            </div>

            {/* Quick category select in modal */}
            <div className="space-y-3">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Zvolte požadovanou kategorii:
              </label>
              <div className="grid grid-cols-2 gap-2">
                {['Gastronomie', 'Příroda', 'Chrám', 'Kultura', 'Vyhlídka', 'Adrenalin'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => handleAddAIPlace(cat)}
                    className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-amber-500/50 hover:bg-slate-800/80 text-left text-xs font-medium text-slate-200 flex items-center justify-between group transition-all"
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
                className="px-4 py-2.5 rounded-xl border border-slate-800 text-slate-400 hover:text-white text-xs font-medium"
              >
                Zrušit
              </button>
              <button
                onClick={() => handleAddAIPlace()}
                className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-bold text-xs hover:brightness-110 transition-all shadow-lg shadow-amber-500/20"
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
