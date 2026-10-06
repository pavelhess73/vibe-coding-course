'use client';

import { useState, useCallback } from 'react';
import {
  Tag,
  Flame,
  Banknote,
  Clock,
  Sun,
  Sunrise,
  Sunset,
  Moon,
  Copy,
  Check,
  Heart,
  ImageOff,
} from 'lucide-react';
import type { Place } from '../app/page';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getTimeBadge(timeOfDay: string) {
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
}

function getCategoryBadgeClass(category: string) {
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
}

function getSpicinessBadge(level: number = 1) {
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
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${colorClasses[safeLvl] || colorClasses[1]}`}
      title={`Úroveň pálivosti: ${safeLvl}/5 (${labels[safeLvl]})`}
    >
      <Flame className="w-3.5 h-3.5 text-rose-400" />
      <span>{chilis}</span>
      <span className="opacity-90 font-medium text-[11px]">{labels[safeLvl]}</span>
    </span>
  );
}

// ─── Fallback images by category ────────────────────────────────────────────

const CATEGORY_FALLBACKS: Record<string, string> = {
  příroda: 'https://images.unsplash.com/photo-1501854140801-50d01698950b?auto=format&fit=crop&w=800&q=70',
  kavárny: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=800&q=70',
  kultura: 'https://images.unsplash.com/photo-1528181304800-259b08848526?auto=format&fit=crop&w=800&q=70',
  'street food': 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=70',
  default: 'https://images.unsplash.com/photo-1500835556837-99ac94a94552?auto=format&fit=crop&w=800&q=70',
};

function getFallbackImage(category: string): string {
  const lower = category.toLowerCase();
  for (const [key, url] of Object.entries(CATEGORY_FALLBACKS)) {
    if (key !== 'default' && lower.includes(key)) return url;
  }
  return CATEGORY_FALLBACKS.default;
}

// ─── PlaceCard Props ─────────────────────────────────────────────────────────

interface PlaceCardProps {
  place: Place;
  copiedId: string | null;
  onCopy: (id: string) => void;
  isFavoriteUpdating: boolean;
  onToggleFavorite: (place: Place) => void;
}

// ─── PlaceCard Component ─────────────────────────────────────────────────────

export default function PlaceCard({
  place,
  copiedId,
  onCopy,
  isFavoriteUpdating,
  onToggleFavorite,
}: PlaceCardProps) {
  const fallbackSrc = getFallbackImage(place.category);
  const [currentSrc, setCurrentSrc] = useState(place.imageUrl || fallbackSrc);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [hasFailedFallback, setHasFailedFallback] = useState(false);

  const handleError = useCallback(() => {
    if (currentSrc !== fallbackSrc) {
      setCurrentSrc(fallbackSrc);
      setImgLoaded(false);
    } else {
      setHasFailedFallback(true);
      setImgLoaded(true);
    }
  }, [currentSrc, fallbackSrc]);

  const handleLoad = useCallback(() => {
    setImgLoaded(true);
  }, []);

  return (
    <article className="glass-card rounded-2xl flex flex-col justify-between relative group overflow-hidden">
      {/* ── Glowing top accent bar ── */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10" />

      {/* ── Hero Image ── */}
      <div className="relative w-full h-48 overflow-hidden bg-slate-900 shrink-0">
        {/* Skeleton loader — visible until image loads */}
        {!imgLoaded && (
          <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800" />
        )}

        {/* Error state overlay if even fallback fails */}
        {hasFailedFallback && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-slate-600">
            <ImageOff className="w-7 h-7" />
            <span className="text-[10px] font-medium uppercase tracking-wider">Náhledový obrázek nedostupný</span>
          </div>
        )}

        {/* The actual image (always rendered so onLoad/onError fire) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={currentSrc}
          alt={place.title}
          className={`w-full h-full object-cover transition-all duration-500 group-hover:scale-105 ${
            imgLoaded && !hasFailedFallback ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={handleLoad}
          onError={handleError}
          loading="lazy"
          decoding="async"
        />

        {/* Gradient overlay for readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent pointer-events-none" />

        {/* Favorite button — overlaid on image, top-right corner */}
        {place.id && (
          <button
            id={`favorite-btn-${place.id}`}
            onClick={() => onToggleFavorite(place)}
            disabled={isFavoriteUpdating}
            title={place.isFavorite ? 'Odebrat z oblíbených' : 'Přidat do oblíbených'}
            className={`absolute top-3 right-3 p-2 rounded-xl backdrop-blur-sm transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-wait z-10 ${
              place.isFavorite
                ? 'bg-rose-500/80 border border-rose-400/60 shadow-lg shadow-rose-900/40'
                : 'bg-slate-900/70 border border-slate-700/60 hover:bg-rose-950/70 hover:border-rose-500/50'
            }`}
          >
            <Heart
              className={`w-4 h-4 transition-all duration-200 ${
                isFavoriteUpdating ? 'animate-pulse' : ''
              } ${place.isFavorite ? 'fill-white text-white' : 'text-slate-300 hover:text-rose-300'}`}
            />
          </button>
        )}
      </div>

      {/* ── Card Body ── */}
      <div className="p-5 flex flex-col gap-4 flex-1">
        <div className="space-y-3">
          {/* Header: title + category badge */}
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-bold text-white group-hover:text-amber-300 transition-colors duration-200 line-clamp-2 leading-snug flex-1">
              {place.title}
            </h2>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border shrink-0 shadow-sm ${getCategoryBadgeClass(
                place.category
              )}`}
            >
              <Tag className="w-3 h-3" />
              {place.category}
            </span>
          </div>

          {/* Description */}
          <p className="text-slate-300 text-sm leading-relaxed line-clamp-3 font-normal">
            {place.description}
          </p>

          {/* Badges: spiciness + price */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {getSpicinessBadge(place.spicinessLevel)}
            {place.priceCZK !== undefined && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border bg-emerald-950/40 text-emerald-300 border-emerald-500/30">
                <Banknote className="w-3.5 h-3.5 text-emerald-400" />
                <span>{place.priceCZK > 0 ? `${place.priceCZK} Kč` : 'Zdarma'}</span>
              </span>
            )}
          </div>
        </div>

        {/* Footer: time badge + copy ID */}
        <div className="mt-auto pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
          {getTimeBadge(place.recommendedTimeOfDay)}

          {place.id && (
            <button
              onClick={() => onCopy(place.id!)}
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
      </div>
    </article>
  );
}
