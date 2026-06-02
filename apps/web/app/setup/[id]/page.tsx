'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import SovereignQRScanner from '../../../components/SovereignQRScanner';
import MetaEmbeddedSignup from '../../../components/MetaEmbeddedSignup';

export default function SetupPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();
  const [isFinishing, setIsFinishing] = useState(false);
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [setupMode, setSetupMode] = useState<'sovereign' | 'meta'>('sovereign');
  
  const [formData, setFormData] = useState({
    name: '',
    bankName: '',
    accountNumber: '',
    accountName: '',
    adminPin: '',
    metaData: null as { accessToken: string; wabaId: string; phoneId: string } | null
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleQRSuccess = () => {
    setWhatsappConnected(true);
    toast.success('WhatsApp connected via Sovereign Engine! Now finish the setup.');
  };

  const handleMetaSuccess = (data: { accessToken: string; wabaId: string; phoneId: string }) => {
    setFormData({ ...formData, metaData: data });
    setWhatsappConnected(true);
    toast.success('WhatsApp connected via Meta! Now finish the setup.');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!whatsappConnected && !formData.metaData) {
      toast.error('Please connect your WhatsApp first!');
      return;
    }

    if (formData.adminPin.length !== 4) {
      toast.error('PIN must be exactly 4 digits.');
      return;
    }

    setIsFinishing(true);
    try {
      if (setupMode === 'meta' && formData.metaData) {
        // Submit Meta data to finalize endpoint
        const res = await fetch('/api/setup/finalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...formData })
        });
        if (!res.ok) {
           const err = await res.json();
           throw new Error(err.message || 'Meta Setup failed.');
        }
      } else {
        // Sovereign Sidecar check
        await fetch('/api/proxy/sidecar/connect', {
           method: 'OPTIONS', // dummy check
        });
      }

      toast.success('Setup Complete! Return to WhatsApp to start selling.');
      router.push('/setup/success');
      
    } catch (e: unknown) {
      console.error(e);
      const errMessage = e instanceof Error ? e.message : 'A network error occurred.';
      toast.error(errMessage);
    } finally {
      setIsFinishing(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-50 py-12 px-6 font-sans">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-xl border border-zinc-200 overflow-hidden">
        <div className="p-8 bg-zinc-900 text-white">
          <h1 className="text-2xl font-bold">Naija Agent AI</h1>
          <p className="text-zinc-400 text-sm mt-1">Finalize your Digital Apprentice setup.</p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Business Name</label>
              <input
                required
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g. Bims Gadgets"
                className="w-full px-4 py-3 rounded-lg border border-zinc-200 focus:ring-2 focus:ring-zinc-900 outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Bank Name</label>
                  <input
                    required
                    name="bankName"
                    value={formData.bankName}
                    onChange={handleChange}
                    placeholder="e.g. GTBank"
                    className="w-full px-4 py-3 rounded-lg border border-zinc-200 focus:ring-2 focus:ring-zinc-900 outline-none"
                  />
               </div>
               <div>
                  <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Admin PIN (4-digits)</label>
                  <input
                    required
                    name="adminPin"
                    maxLength={4}
                    value={formData.adminPin}
                    onChange={handleChange}
                    placeholder="****"
                    className="w-full px-4 py-3 rounded-lg border border-zinc-200 focus:ring-2 focus:ring-zinc-900 outline-none"
                  />
               </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Account Number</label>
              <input
                required
                name="accountNumber"
                value={formData.accountNumber}
                onChange={handleChange}
                placeholder="10 Digits"
                className="w-full px-4 py-3 rounded-lg border border-zinc-200 focus:ring-2 focus:ring-zinc-900 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Account Name</label>
              <input
                required
                name="accountName"
                value={formData.accountName}
                onChange={handleChange}
                placeholder="Name on your Bank Account"
                className="w-full px-4 py-3 rounded-lg border border-zinc-200 focus:ring-2 focus:ring-zinc-900 outline-none"
              />
            </div>
          </div>

          <hr className="border-zinc-100" />

          <div className="space-y-4">
            <h2 className="text-sm font-bold text-zinc-900">Connect your WhatsApp</h2>
            
            <div className="flex gap-2 p-1 bg-zinc-100 rounded-lg">
              <button
                type="button"
                onClick={() => setSetupMode('sovereign')}
                className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${setupMode === 'sovereign' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}
              >
                Scan QR (Fast)
              </button>
              <button
                type="button"
                onClick={() => setSetupMode('meta')}
                className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${setupMode === 'meta' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}
              >
                Meta Official
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg text-xs text-amber-800 space-y-2">
              <p className="font-bold flex items-center gap-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                {setupMode === 'sovereign' ? 'SOVEREIGN ENGINE REQUIREMENT' : 'BOT SIM REQUIREMENT'}
              </p>
              <p>
                You need a <b>New WhatsApp Account</b> for your AI Bot.
              </p>
            </div>

            {setupMode === 'sovereign' ? (
              <SovereignQRScanner orgId={id || 'test_org'} onSuccess={handleQRSuccess} />
            ) : (
              <MetaEmbeddedSignup onSuccess={handleMetaSuccess} onError={(err) => toast.error(err)} />
            )}

            {(whatsappConnected || formData.metaData) && (
              <div className="bg-green-50 text-green-700 p-3 rounded-lg text-xs font-medium flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                WhatsApp Account Connected!
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isFinishing || (!whatsappConnected && !formData.metaData)}
            className="w-full bg-zinc-900 text-white font-bold py-4 rounded-xl shadow-lg hover:bg-zinc-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isFinishing ? 'Processing...' : 'Complete Setup & Go Live'}
          </button>
        </form>
      </div>
      
      <p className="text-center text-zinc-400 text-xs mt-8">
        © 2026 Naija Agent Core. Powered by Sovereign AI.
      </p>
    </main>
  );
}
