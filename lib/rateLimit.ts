/**
 * In-memory sliding window rate limiter pro AI generování.
 * Povoluje maximálně 5 požadavků během 10 minut z jedné IP adresy.
 */

interface RateLimitEntry {
  timestamps: number[];
}

const rateLimitMap = new Map<string, RateLimitEntry>();

// Konfigurace: max 5 požadavků za 10 minut (600 000 ms)
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 5;

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetTime: number; // Počet milisekund do resetu limitu
}

/**
 * Zkontroluje, zda daná IP adresa nepřekročila stanovený sliding window limit.
 */
export function checkRateLimit(ip: string): RateLimitResult {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  // Vyčištění starých neaktivních IP adres z paměti pro úsporu RAM
  for (const [key, entry] of rateLimitMap.entries()) {
    const valid = entry.timestamps.filter((ts) => ts > windowStart);
    if (valid.length === 0) {
      rateLimitMap.delete(key);
    } else {
      entry.timestamps = valid;
    }
  }

  const currentEntry = rateLimitMap.get(ip) || { timestamps: [] };

  // Ponechat pouze časová razítka v aktuálním okně 10 minut
  const activeTimestamps = currentEntry.timestamps.filter((ts) => ts > windowStart);

  if (activeTimestamps.length >= MAX_REQUESTS) {
    // Najít nejstarší časové razítko v okně pro výpočet času resetu
    const oldestTimestamp = activeTimestamps[0];
    const resetTime = Math.max(0, oldestTimestamp + WINDOW_MS - now);

    return {
      success: false,
      remaining: 0,
      resetTime,
    };
  }

  // Zaznamenat nový čas požadavku
  activeTimestamps.push(now);
  rateLimitMap.set(ip, { timestamps: activeTimestamps });

  return {
    success: true,
    remaining: MAX_REQUESTS - activeTimestamps.length,
    resetTime: 0,
  };
}
