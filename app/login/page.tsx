'use client';

import { useState } from 'react';
import {
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  Compass,
  ArrowRight,
  Loader2,
  AlertCircle,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!password.trim()) {
      setError('Prosím zadejte přihlašovací heslo.');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password.trim() }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Nesprávné přihlašovací heslo.');
      }

      // Po úspěšném přihlášení přejdeme na hlavní stránku /
      window.location.href = '/';
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Chyba při přihlašování.';
      setError(errMsg);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Glow background accents */}
      <div className="fixed top-1/4 left-1/3 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none animate-pulse" />
      <div className="fixed bottom-1/4 right-1/3 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl pointer-events-none animate-pulse" />

      <div className="max-w-md w-full glass-panel p-8 sm:p-10 rounded-3xl border border-amber-500/30 shadow-2xl backdrop-blur-xl space-y-8 relative z-10">
        {/* Header Icon & Title */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center p-4 rounded-2xl bg-gradient-to-br from-amber-500/20 via-orange-500/20 to-amber-600/10 border border-amber-500/30 text-amber-400 shadow-xl shadow-amber-500/10">
            <Compass className="w-10 h-10 text-amber-400" />
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Zabezpečená PWA Aplikace</span>
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            Přihlášení do <span className="text-gradient-gold">Travel Discovery</span>
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm">
            Zadejte přístupové heslo pro vstup do cestovatelské PWA aplikace s Gemini AI.
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-950/80 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-3 animate-in fade-in duration-200 shadow-lg shadow-rose-950/40">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2 text-left">
            <label
              htmlFor="login-password"
              className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5"
            >
              <KeyRound className="w-3.5 h-3.5 text-amber-400" />
              Vstupní heslo:
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Zadejte přístupové heslo..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                className="w-full bg-slate-900/90 border border-slate-700/80 rounded-xl pl-10 pr-11 py-3.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all shadow-inner"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1 rounded-lg transition-colors cursor-pointer"
                title={showPassword ? 'Skrýt heslo' : 'Zobrazit heslo'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2.5 px-6 py-4 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-slate-950 font-extrabold text-base hover:brightness-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-xl shadow-amber-500/25 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin text-slate-950" />
                <span>Ověřuji heslo...</span>
              </>
            ) : (
              <>
                <span>Vstoupit do aplikace</span>
                <ArrowRight className="w-5 h-5 text-slate-950" />
              </>
            )}
          </button>
        </form>

        {/* Footer Note */}
        <div className="pt-4 border-t border-slate-800/80 text-center text-xs text-slate-500 space-y-1">
          <p className="flex items-center justify-center gap-1 text-slate-400">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>PWA & Offline Firestore Cache Podpora</span>
          </p>
          <p>Bezpečná autentizace přes Next.js Middleware</p>
        </div>
      </div>
    </div>
  );
}
