'use client';

import { useState } from 'react';
import { toast } from 'sonner';

interface PendingClient {
  id: string;
  name: string;
  status: string;
  botPhone: string;
}

export default function ActivationPipeline({ clients }: { clients: PendingClient[] }) {
  const [selectedClient, setSelectedClient] = useState<PendingClient | null>(null);
  const [loading, setLoading] = useState(false);
  const [phoneId, setPhoneId] = useState('');
  const [token, setToken] = useState('');
  const [wabaId, setWabaId] = useState('');

  const triggerActivation = async () => {
    if (!selectedClient || !phoneId || !token) {
      toast.error('Please fill in Phone ID and Token');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/onboarding/trigger-relay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: selectedClient.id,
          phoneId,
          accessToken: token,
          wabaId
        })
      });

      if (res.ok) {
        toast.success('Activation triggered! Tell Boss to check WhatsApp.');
        setSelectedClient(null);
        setPhoneId('');
        setToken('');
        setWabaId('');
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to trigger');
      }
    } catch (_e) {
      toast.error('Connection error');
    } finally {
      setLoading(false);
    }
  };

  if (clients.length === 0) return null;

  return (
    <section className="mb-12">
      <h2 className="text-xl font-bold text-zinc-900 mb-6 flex items-center gap-2">
        🚩 Activation Pipeline
        <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-xs rounded-full">{clients.length} Pending</span>
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {clients.map(client => (
          <div key={client.id} className="p-6 bg-white rounded-xl border border-zinc-200 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-amber-400"></div>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-bold text-zinc-900">{client.name}</h3>
                <p className="text-xs text-zinc-500 font-mono">{client.id}</p>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-600 bg-amber-50 px-2 py-1 rounded">
                {client.status.replace('_', ' ')}
              </span>
            </div>
            
            <div className="space-y-2 mb-6 text-sm">
              <div className="flex justify-between text-zinc-600">
                <span>Bot SIM:</span>
                <span className="font-mono font-medium">{client.botPhone}</span>
              </div>
            </div>

            <button 
              onClick={() => setSelectedClient(client)}
              className="w-full py-2 bg-zinc-900 text-white rounded-lg text-sm font-semibold hover:bg-zinc-800 transition-all active:scale-95"
            >
              Start Activation
            </button>
          </div>
        ))}
      </div>

      {selectedClient && (
        <div className="fixed inset-0 bg-zinc-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 border border-zinc-200">
            <h3 className="text-xl font-bold text-zinc-900 mb-2">Activate Bot</h3>
            <p className="text-sm text-zinc-500 mb-6">Enter Meta credentials for <span className="font-bold text-zinc-900">{selectedClient.name}</span></p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">WhatsApp Phone ID</label>
                <input 
                  type="text" 
                  value={phoneId}
                  onChange={e => setPhoneId(e.target.value)}
                  placeholder="e.g. 1234567890"
                  className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-zinc-900 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">Access Token (Permanent)</label>
                <textarea 
                  value={token}
                  onChange={e => setToken(e.target.value)}
                  placeholder="Paste EAAB..."
                  rows={3}
                  className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-zinc-900 outline-none transition-all font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase mb-1">WABA ID (Optional)</label>
                <input 
                  type="text" 
                  value={wabaId}
                  onChange={e => setWabaId(e.target.value)}
                  placeholder="e.g. 987654321"
                  className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-zinc-900 outline-none transition-all"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button 
                onClick={() => setSelectedClient(null)}
                className="flex-1 py-3 border border-zinc-200 rounded-xl text-sm font-bold text-zinc-600 hover:bg-zinc-50 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={triggerActivation}
                disabled={loading}
                className="flex-1 py-3 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-green-200"
              >
                {loading ? 'Processing...' : '🚀 Ignite Bot'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
