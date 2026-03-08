import { getNetworkStats, getNetworkChats } from '@naija-agent/firebase';
import Link from 'next/link';
import { logout } from '../auth/actions';

export default async function Dashboard() {
  const [stats, chats] = await Promise.all([
    getNetworkStats(),
    getNetworkChats(10)
  ]);

  return (
    <main className="min-h-screen p-8 bg-zinc-50 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-3xl font-bold text-zinc-900">Sovereign Command Center</h1>
            <p className="text-zinc-500">Real-time status of your Naija Agent network</p>
          </div>
          <div className="flex gap-4 items-center">
            <Link href="/vault" className="px-4 py-2 bg-white rounded-lg border border-zinc-200 shadow-sm text-sm font-semibold text-zinc-600 hover:text-zinc-900 transition-colors flex items-center gap-2">
              🖼️ Media Vault
            </Link>
            <div className="px-4 py-2 bg-white rounded-lg border border-zinc-200 shadow-sm">
              <span className="text-sm font-medium text-zinc-500 uppercase tracking-wider">Vault Status</span>
              <div className="text-xl font-bold text-green-600">
                ₦{(stats.totalVaultKobo / 100).toLocaleString()}
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
            <h3 className="text-2xl font-bold text-zinc-900">{stats.activeClients}</h3>
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Portfolio List (Preserved) */}
          <section className="lg:col-span-2">
            <h2 className="text-xl font-bold text-zinc-900 mb-6">Network Portfolio</h2>
            <div className="overflow-hidden bg-white rounded-xl border border-zinc-200 shadow-sm">
              <table className="min-w-full divide-y divide-zinc-200">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-zinc-500 uppercase">Organization</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-zinc-500 uppercase">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-zinc-500 uppercase text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {stats.clients.map((client: { id: string; name: string; balance: number }) => (
                    <tr key={client.id} className="hover:bg-zinc-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="text-sm font-bold text-zinc-900">{client.name}</div>
                        <div className="text-xs text-zinc-500">{client.id}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Active
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="text-sm font-mono font-semibold text-zinc-900">
                          ₦{(client.balance / 100).toLocaleString()}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                  chats.map((chat: any) => (
                    <div key={chat.id} className="p-3 bg-zinc-50 rounded-lg border border-zinc-100 hover:border-zinc-300 transition-colors cursor-pointer group">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-sm font-bold text-zinc-900 group-hover:text-blue-600">{chat.userName || 'Unknown'}</span>
                        <span className="text-[10px] text-zinc-400 font-mono">
                          {chat.lastMessageAt ? new Date(chat.lastMessageAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-600 line-clamp-2 italic">
                        "{chat.summary || 'No messages yet...'}"
                      </p>
                    </div>
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
