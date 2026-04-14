import { getQueuesStatus } from './actions';
import Link from 'next/link';
import QueueClient from './QueueClient';

export const dynamic = 'force-dynamic';

export default async function QueuesDashboard() {
  const statuses = await getQueuesStatus();

  return (
    <main className="min-h-screen p-8 bg-zinc-50 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-3xl font-bold text-zinc-900">Queue & Observability</h1>
            <p className="text-zinc-500">Monitor active jobs, failures, and worker health across BOS and LOS engines</p>
          </div>
          <Link href="/dashboard" className="px-4 py-2 bg-white rounded-lg border border-zinc-200 shadow-sm text-sm font-semibold text-zinc-600 hover:text-zinc-900 transition-colors">
            ← Back to Dashboard
          </Link>
        </header>

        <QueueClient initialStatuses={statuses} />
      </div>
    </main>
  );
}
