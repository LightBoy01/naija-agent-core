'use client';

import { useActionState } from 'react';
import { tenantAuthenticate } from '../auth/actions';

export default function TenantLoginPage() {
  const [state, formAction, isPending] = useActionState(tenantAuthenticate, undefined);

  return (
    <main className="min-h-screen bg-zinc-50 flex items-center justify-center font-sans p-6">
      <div className="w-full max-w-md bg-white rounded-3xl border border-zinc-100 shadow-2xl p-10">
        <div className="text-center mb-10">
          <div className="text-xl font-black text-zinc-900 tracking-tighter mb-2">
            NAIJA<span className="text-green-600">AGENT</span>
          </div>
          <h1 className="text-2xl font-bold text-zinc-900">Merchant Hub</h1>
          <p className="text-sm text-zinc-500">Log in to manage your shop and deliveries</p>
        </div>

        <form action={formAction} className="space-y-6">
          <div>
            <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 px-1">Shop Admin Phone</label>
            <input 
              name="phone"
              type="text" 
              placeholder="2348030000000" 
              required
              className="w-full px-5 py-4 bg-zinc-50 border border-zinc-100 rounded-2xl focus:ring-2 focus:ring-green-500/20 focus:border-green-600 outline-none transition-all font-mono"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 px-1">4-Digit Security PIN</label>
            <input 
              name="pin"
              type="password" 
              maxLength={4} 
              placeholder="••••" 
              required
              className="w-full px-5 py-4 bg-zinc-50 border border-zinc-100 rounded-2xl focus:ring-2 focus:ring-green-500/20 focus:border-green-600 outline-none transition-all text-center text-2xl tracking-widest font-bold"
            />
          </div>

          {state?.error && (
            <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm font-medium text-center animate-in fade-in zoom-in duration-300">
              {state.error}
            </div>
          )}

          <button 
            type="submit"
            disabled={isPending}
            className="w-full py-4 bg-zinc-900 text-white font-bold rounded-2xl hover:bg-zinc-800 transition-all shadow-xl shadow-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Connecting...' : 'Login to Dashboard'}
          </button>
        </form>

        <div className="mt-8 pt-8 border-t border-zinc-50 text-center">
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              Need help or lost your PIN? 
              <br />Ask your bot &quot;How do I reset my PIN?&quot; or message HQ.
            </p>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-zinc-100 rounded-full text-[10px] font-bold text-zinc-500 uppercase tracking-tight">
               🛡️ Secure Merchant Session
            </div>
        </div>
      </div>
    </main>
  );
}
