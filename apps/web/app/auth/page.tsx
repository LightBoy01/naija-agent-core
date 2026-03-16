'use client';

import { useActionState } from 'react';
import { authenticate } from './actions';

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(authenticate, undefined);

  return (
    <main className="min-h-screen bg-white flex items-center justify-center font-sans p-6">
      <div className="w-full max-w-md bg-white rounded-3xl border border-zinc-100 shadow-2xl p-12">
        <div className="text-center mb-12">
          <div className="text-2xl font-black text-zinc-900 tracking-tighter mb-4">
            NAIJA<span className="text-green-600">AGENT</span>
          </div>
          <h1 className="text-xl font-bold text-zinc-900">Sovereign Portal</h1>
          <p className="text-sm text-zinc-500">Authenticate your session to manage the network</p>
        </div>

        <form action={formAction} className="space-y-6">
          <div>
            <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">WhatsApp Phone Number</label>
            <input 
              name="phone"
              type="text" 
              placeholder="2348000000000" 
              required
              className="w-full px-5 py-4 bg-zinc-50 border border-zinc-100 rounded-2xl focus:ring-2 focus:ring-green-500/20 focus:border-green-600 outline-none transition-all font-mono"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">4-Digit Security PIN</label>
            <input 
              name="pin"
              type="password" 
              maxLength={4} 
              placeholder="••••" 
              required
              className="w-full px-5 py-4 bg-zinc-50 border border-zinc-100 rounded-2xl focus:ring-2 focus:ring-green-500/20 focus:border-green-600 outline-none transition-all text-center text-xl tracking-widest font-bold"
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
            {isPending ? 'Authenticating...' : 'Login to Command Center'}
          </button>
        </form>

        <p className="mt-8 text-center text-xs text-zinc-400 leading-relaxed">
          Lost your PIN? Message the Master Bot on WhatsApp to reset your security credentials.
        </p>
      </div>
    </main>
  );
}
