import { getOrgById, getDb } from '@naija-agent/firebase';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { updateOrgStatus, topUpBalance } from './actions';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function OrgManagePage({ params }: PageProps) {
  const { id: orgId } = await params;
  const org = await getOrgById(orgId);

  if (!org) {
    notFound();
  }

  return (
    <main className="min-h-screen p-8 bg-zinc-50 font-sans">
      <div className="max-w-4xl mx-auto">
        <header className="flex justify-between items-center mb-12">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="p-2 hover:bg-white rounded-full border border-transparent hover:border-zinc-200 transition-all text-zinc-500">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-zinc-900">{org.name}</h1>
              <p className="text-zinc-500 font-mono text-xs">{org.id}</p>
            </div>
          </div>
          <div className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${org.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {org.isActive ? 'Active' : 'Paused'}
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Financials Card */}
          <section className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-8">
            <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-6">Financial Controls</h2>
            <div className="mb-8">
              <p className="text-xs text-zinc-500 mb-1">Current Balance</p>
              <div className="text-4xl font-black text-zinc-900">
                ₦{(org.balance / 100).toLocaleString()}
              </div>
            </div>

            <form action={topUpBalance} className="space-y-4">
              <input type="hidden" name="orgId" value={org.id} />
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-2 uppercase">Manual Top-Up (Naira)</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 font-bold">₦</span>
                    <input 
                      type="number" 
                      name="amount" 
                      placeholder="5000"
                      className="w-full pl-8 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-green-500/20 focus:border-green-500 outline-none transition-all font-mono"
                      required
                    />
                  </div>
                  <button type="submit" className="px-6 py-2 bg-zinc-900 text-white text-sm font-bold rounded-lg hover:bg-zinc-800 transition-all shadow-lg shadow-zinc-200">
                    Add Funds
                  </button>
                </div>
              </div>
            </form>
          </section>

          {/* Status & Config Card */}
          <section className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-8">
            <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-6">Organization Status</h2>
            
            <div className="space-y-6">
              <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                <p className="text-xs text-zinc-500 mb-2 font-medium">Service Availability</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-zinc-900">{org.isActive ? 'Agent is Online' : 'Agent is Offline'}</span>
                  <form action={updateOrgStatus}>
                    <input type="hidden" name="orgId" value={org.id} />
                    <input type="hidden" name="status" value={org.isActive ? 'false' : 'true'} />
                    <button type="submit" className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                      org.isActive 
                        ? 'text-red-600 border-red-200 hover:bg-red-50' 
                        : 'text-green-600 border-green-200 hover:bg-green-50'
                    }`}>
                      {org.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </form>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-zinc-700 mb-2 uppercase">AI Model</p>
                <div className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm font-mono text-zinc-600">
                  {org.config?.model || 'gemini-2.5-flash'}
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-zinc-700 mb-2 uppercase">WhatsApp Phone ID</p>
                <div className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm font-mono text-zinc-600 truncate">
                  {org.whatsappPhoneId}
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* System Prompt View */}
        <section className="mt-8 bg-white rounded-2xl border border-zinc-200 shadow-sm p-8">
          <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-6">Core Intelligence (System Prompt)</h2>
          <div className="p-6 bg-zinc-900 rounded-xl font-mono text-xs text-zinc-300 leading-relaxed overflow-x-auto whitespace-pre-wrap border border-zinc-800 shadow-inner">
            {org.systemPrompt}
          </div>
        </section>
      </div>
    </main>
  );
}
