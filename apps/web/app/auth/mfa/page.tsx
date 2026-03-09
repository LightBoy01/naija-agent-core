'use client';

import { useActionState } from 'react';
import { verifyMfa } from '../actions';
import Link from 'next/link';

export default function MfaPage() {
  const [state, formAction, isPending] = useActionState(verifyMfa, undefined);

  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-50 font-sans p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-zinc-900 text-white text-3xl mb-4 shadow-xl">
            🛡️
          </div>
          <h1 className="text-2xl font-black text-zinc-900 tracking-tight">Sovereign MFA</h1>
          <p className="text-zinc-500 text-sm mt-2">
            Ask the Master Bot for your 6-digit access code on WhatsApp.
          </p>
        </div>

        <div className="bg-white rounded-3xl border border-zinc-200 shadow-2xl shadow-zinc-200/50 p-8">
          <form action={formAction} className="space-y-6">
            <div>
              <label htmlFor="code" className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2 px-1">
                Enter 6-Digit Code
              </label>
              <input
                id="code"
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                placeholder="000000"
                required
                className="w-full px-4 py-4 bg-zinc-50 border border-zinc-200 rounded-2xl focus:ring-4 focus:ring-zinc-900/5 focus:border-zinc-900 outline-none transition-all font-mono text-center text-2xl tracking-[0.5em] placeholder:tracking-normal placeholder:text-zinc-300"
              />
            </div>

            {state?.error && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-xs font-medium animate-in fade-in slide-in-from-top-1">
                {state.error}
              </div>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="w-full py-4 bg-zinc-900 text-white rounded-2xl font-bold hover:bg-zinc-800 focus:ring-4 focus:ring-zinc-900/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-zinc-900/20"
            >
              {isPending ? 'Verifying...' : 'Authorize Access →'}
            </button>
          </form>

          <div className="mt-8 pt-8 border-t border-zinc-100 text-center text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
            <Link href="/auth" className="hover:text-zinc-900 transition-colors">
              ← Back to Login
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
