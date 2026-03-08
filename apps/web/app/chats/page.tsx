import { getNetworkChats } from '@naija-agent/firebase';
import Link from 'next/link';

export default async function ChatLogs() {
  const chats = await getNetworkChats(50);

  return (
    <main className="min-h-screen p-8 bg-zinc-50 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-3xl font-bold text-zinc-900">Network Chat Logs</h1>
            <p className="text-zinc-500">Audit every conversation in real-time</p>
          </div>
          <Link href="/dashboard" className="px-4 py-2 bg-white rounded-lg border border-zinc-200 shadow-sm text-sm font-semibold text-zinc-600 hover:text-zinc-900 transition-colors">
            ← Back to Dashboard
          </Link>
        </header>

        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-zinc-200">
            <thead className="bg-zinc-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-zinc-500 uppercase">Customer</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-zinc-500 uppercase">Last Message</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-zinc-500 uppercase text-right">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {chats.map((chat: any) => (
                <tr key={chat.id} className="hover:bg-zinc-50 transition-colors cursor-pointer group">
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold text-zinc-900">{chat.userName || 'Unknown'}</div>
                    <div className="text-xs text-zinc-400 font-mono">{chat.whatsappUserId}</div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-zinc-600 truncate max-w-lg">
                      {chat.summary || 'No activity recorded...'}
                    </p>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="text-xs text-zinc-400 font-medium">
                      {chat.lastMessageAt ? new Date(chat.lastMessageAt.toDate()).toLocaleString() : '--'}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
