import { formatTimestamp, sanitizeOrgForFrontend, formatCurrency } from '../../lib/utils';
import { getNetworkStats, getNetworkChats } from '@naija-agent/firebase';
import { Chat } from '@naija-agent/types';
import Link from 'next/link';
import { logout } from '../auth/actions';
import ActivationPipeline from './components/ActivationPipeline';

interface Client {
  id: string;
  name: string;
  balance: number;
  isActive: boolean;
  status: string;
  botPhone: string;
  currency?: {
    locale: string;
    code: string;
    symbol: string;
  };
}

interface LifeUser {
  id: string;
  name: string;
  energyCredits: number;
  lastInteraction: string | null;
  isActive: boolean;
  status: string;
}

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const [stats, chats] = await Promise.all([
    getNetworkStats('naija-agent-master'),
    getNetworkChats('naija-agent-master', 10)
  ]);

  const allClients = (stats.clients || []).map((c: { id: string; name: string; balance: number; isActive: boolean; status: string; botPhone: string }) => sanitizeOrgForFrontend(c)) as Client[];
  
  // Separate into Live and Pipeline
  const pendingStatuses = ['TRIAL', 'PENDING_PAYMENT', 'PENDING_META', 'AWAITING_OTP'];
  const pendingClients = allClients.filter(c => pendingStatuses.includes(c.status));
  const liveClients = allClients.filter(c => !pendingStatuses.includes(c.status));

  return (
    <main className="min-h-screen p-8 bg-zinc-50 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-3xl font-bold text-zinc-900">Sovereign Command Center</h1>
            <p className="text-zinc-500">Real-time status of your Naija Agent network</p>
          </div>
          <div className="flex gap-4 items-center">
            <Link href="/dashboard/queues" className="px-4 py-2 bg-white rounded-lg border border-zinc-200 shadow-sm text-sm font-semibold text-zinc-600 hover:text-zinc-900 transition-colors flex items-center gap-2">
              📊 Queues
            </Link>
            <Link href="/vault" className="px-4 py-2 bg-white rounded-lg border border-zinc-200 shadow-sm text-sm font-semibold text-zinc-600 hover:text-zinc-900 transition-colors flex items-center gap-2">
              🖼️ Media Vault
            </Link>
            <div className="px-4 py-2 bg-white rounded-lg border border-zinc-200 shadow-sm">
              <span className="text-sm font-medium text-zinc-500 uppercase tracking-wider">Vault Status</span>
              <div className="text-xl font-bold text-green-600">
                {formatCurrency(stats.totalVaultKobo / 100)}
              </div>
            </div>
            <form action={logout}>
              <button className="p-2 text-zinc-400 hover:text-red-600 transition-colors" title="Logout">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
              </button>
            </form>
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="p-6 bg-white rounded-xl border border-zinc-200 shadow-sm">
            <p className="text-sm font-medium text-zinc-500 mb-1">Active Clients</p>
            <h3 className="text-2xl font-bold text-zinc-900">{liveClients.length}</h3>
          </div>
          <div className="p-6 bg-white rounded-xl border border-zinc-200 shadow-sm">
            <p className="text-sm font-medium text-zinc-500 mb-1">Network Activity</p>
            <h3 className="text-2xl font-bold text-zinc-900 text-blue-600">{chats.length} Active Chats</h3>
          </div>
          <div className="p-6 bg-white rounded-xl border border-zinc-200 shadow-sm">
            <p className="text-sm font-medium text-zinc-500 mb-1">Uptime</p>
            <h3 className="text-2xl font-bold text-zinc-900 text-green-600">100%</h3>
          </div>
        </section>

        {/* --- ACTIVATION PIPELINE (Phase 8.1) --- */}
        <ActivationPipeline clients={pendingClients} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Portfolio List (Preserved) */}
          <section className="lg:col-span-2 space-y-8">
            <div>
              <h2 className="text-xl font-bold text-zinc-900 mb-6">Business Organizations (Zynux)</h2>
              <div className="overflow-hidden bg-white rounded-xl border border-zinc-200 shadow-sm">
                <table className="min-w-full divide-y divide-zinc-200">
                  <thead className="bg-zinc-50">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-zinc-500 uppercase">Organization</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-zinc-500 uppercase">Status</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-zinc-500 uppercase text-right">Balance</th>
                      <th className="px-6 py-4 text-right text-xs font-semibold text-zinc-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {liveClients.map((client: Client) => {
                      return (
                        <tr key={client.id} className="hover:bg-zinc-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="text-sm font-bold text-zinc-900">{client.name}</div>
                            <div className="text-xs text-zinc-500">{client.id}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              client.isActive 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {client.isActive ? 'Active' : 'Paused'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="text-sm font-mono font-semibold text-zinc-900">
                              {formatCurrency(client.balance / 100, client.currency?.locale, client.currency?.code, client.currency?.symbol)}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Link 
                              href={`/dashboard/organizations/${client.id}`}
                              className="text-xs font-bold text-zinc-400 hover:text-zinc-900 uppercase tracking-tighter transition-colors"
                            >
                              Manage →
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Life OS Users */}
            <div>
              <h2 className="text-xl font-bold text-zinc-900 mb-6 flex items-center gap-2">
                🔋 Life OS Users (Aelixxr)
              </h2>
              <div className="overflow-hidden bg-white rounded-xl border border-zinc-200 shadow-sm">
                <table className="min-w-full divide-y divide-zinc-200">
                  <thead className="bg-zinc-50">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-zinc-500 uppercase">User</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-zinc-500 uppercase">Energy Level</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-zinc-500 uppercase text-right">Credits</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {(stats.lifeUsers || []).map((user: LifeUser) => {
                      const maxEnergy = 100;
                      const energyPercent = Math.min(100, Math.max(0, (user.energyCredits / maxEnergy) * 100));
                      let batteryColor = 'bg-green-500';
                      if (energyPercent < 20) batteryColor = 'bg-red-500';
                      else if (energyPercent < 50) batteryColor = 'bg-yellow-500';

                      return (
                        <tr key={user.id} className="hover:bg-zinc-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="text-sm font-bold text-zinc-900">{user.name}</div>
                            <div className="text-xs text-zinc-500">{user.id}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="w-full bg-zinc-200 rounded-full h-2.5 max-w-xs">
                              <div className={`h-2.5 rounded-full ${batteryColor}`} style={{ width: `${energyPercent}%` }}></div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="text-sm font-mono font-bold text-zinc-900">
                              {user.energyCredits} ⚡
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Live Feed Sidebar */}
          <section>
            <h2 className="text-xl font-bold text-zinc-900 mb-6">Live Activity</h2>
            <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-4 h-[500px] overflow-y-auto">
              <div className="space-y-4">
                {chats.length === 0 ? (
                  <p className="text-center text-zinc-500 mt-12">No active conversations yet.</p>
                ) : (
                  chats.map((chat: Chat) => (
                    <Link 
                      key={chat.id} 
                      href={`/chats/${chat.id}`}
                      className="block p-3 bg-zinc-50 rounded-lg border border-zinc-100 hover:border-zinc-300 transition-colors group"
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-sm font-bold text-zinc-900 group-hover:text-blue-600">{chat.userName || 'Unknown'}</span>
                        <span className="text-sm text-zinc-400 font-mono">
                          {chat.lastMessageAt ? formatTimestamp(chat.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-600 line-clamp-2 italic">
                        &quot;{chat.summary || 'No messages yet...'}&quot;
                      </p>
                    </Link>
                  ))
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
