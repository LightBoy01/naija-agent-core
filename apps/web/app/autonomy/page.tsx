import { getDb } from '@naija-agent/database';
import { cronJobs, users } from '@naija-agent/database';
import { eq, desc } from 'drizzle-orm';
import Link from 'next/link';

export const revalidate = 0; // Disable cache for real-time views

export default async function AutonomyDashboard() {
  const sqlDb = getDb();

  // Fetch all cron jobs, joining with the user table to get the phone number
  const jobs = await sqlDb.select({
    id: cronJobs.id,
    name: cronJobs.name,
    instruction: cronJobs.instruction,
    schedule: cronJobs.schedule,
    status: cronJobs.status,
    sectorPack: cronJobs.sectorPack,
    energyBudget: cronJobs.energyBudget,
    lastRunAt: cronJobs.lastRunAt,
    nextRunAt: cronJobs.nextRunAt,
    lastResult: cronJobs.lastResult,
    userPhone: users.phone
  })
  .from(cronJobs)
  .leftJoin(users, eq(cronJobs.userId, users.phone))
  .orderBy(desc(cronJobs.createdAt));

  return (
    <main className="min-h-screen p-8 bg-zinc-50 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-3xl font-bold text-zinc-900">Sovereign Autonomy</h1>
            <p className="text-zinc-500">Manage long-running Hermes background tasks</p>
          </div>
          <Link href="/dashboard" className="px-4 py-2 bg-white rounded-lg border border-zinc-200 shadow-sm text-sm font-semibold text-zinc-600 hover:text-zinc-900 transition-colors">
            ← Back to Dashboard
          </Link>
        </header>

        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-zinc-200">
            <thead className="bg-zinc-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-zinc-500 uppercase">Task Name</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-zinc-500 uppercase">Schedule</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-zinc-500 uppercase">Status</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-zinc-500 uppercase">Next Run</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-zinc-500 uppercase">Budget</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-zinc-500">
                    No active autonomy tasks found.
                  </td>
                </tr>
              ) : jobs.map((job) => (
                <tr key={job.id} className="hover:bg-zinc-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold text-zinc-900">{job.name}</div>
                    <div className="text-xs text-zinc-400 font-mono mt-1">User: {job.userPhone}</div>
                    <div className="text-xs text-zinc-500 mt-1 truncate max-w-xs" title={job.instruction}>
                      {job.instruction}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-mono text-zinc-700 bg-zinc-100 inline-block px-2 py-1 rounded">
                      {job.schedule}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                      ${job.status === 'active' ? 'bg-green-100 text-green-800' : 
                        job.status === 'paused' ? 'bg-yellow-100 text-yellow-800' : 
                        'bg-red-100 text-red-800'}`}>
                      {job.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-zinc-900">
                      {job.nextRunAt ? new Date(job.nextRunAt).toLocaleString() : '--'}
                    </div>
                    {job.lastRunAt && (
                      <div className="text-xs text-zinc-400 mt-1">
                        Last: {new Date(job.lastRunAt).toLocaleTimeString()}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-zinc-900 font-semibold">{job.energyBudget} ⚡</div>
                    <div className="text-xs text-zinc-400 mt-1">{job.sectorPack}</div>
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