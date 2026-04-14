'use client';

import { useState, useTransition } from 'react';
import { cleanFailedJobs, retryFailedJob, getQueuesStatus } from './actions';
import { formatTimestamp } from '../../../lib/utils';

export interface QueueStatus {
  name: string;
  counts: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };
  recentFailures: {
    id: string;
    name: string;
    failedReason: string;
    timestamp: number;
    data: Record<string, unknown>;
  }[];
}

export default function QueueClient({ initialStatuses }: { initialStatuses: QueueStatus[] }) {
  const [statuses, setStatuses] = useState<QueueStatus[]>(initialStatuses);
  const [isPending, startTransition] = useTransition();

  const handleRefresh = () => {
    startTransition(async () => {
      const refreshed = await getQueuesStatus();
      setStatuses(refreshed);
    });
  };

  const handleClean = (name: string) => {
    const queueName = name.includes('BOS') ? 'BOS' : 'LOS';
    if (!confirm(`Are you sure you want to clean all failed jobs for ${queueName}?`)) return;
    
    startTransition(async () => {
      await cleanFailedJobs(queueName);
      const refreshed = await getQueuesStatus();
      setStatuses(refreshed);
    });
  };

  const handleRetry = (name: string, jobId: string) => {
    const queueName = name.includes('BOS') ? 'BOS' : 'LOS';
    startTransition(async () => {
      await retryFailedJob(queueName, jobId);
      const refreshed = await getQueuesStatus();
      setStatuses(refreshed);
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <button 
          onClick={handleRefresh}
          disabled={isPending}
          className="px-4 py-2 bg-zinc-900 text-white text-sm font-bold rounded-xl shadow-xl shadow-zinc-200 hover:bg-zinc-800 transition-all disabled:opacity-50"
        >
          {isPending ? 'Refreshing...' : 'Refresh Queues'}
        </button>
      </div>

      {statuses.map((status) => (
        <div key={status.name} className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-black text-zinc-900 uppercase tracking-tighter">{status.name}</h2>
            <div className="text-sm font-bold text-zinc-400">
              Total Failed: <span className={status.counts.failed > 0 ? "text-red-500" : ""}>{status.counts.failed}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
             <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100 text-center">
                <span className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Waiting</span>
                <span className="text-2xl font-bold text-zinc-900">{status.counts.waiting}</span>
             </div>
             <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 text-center">
                <span className="block text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Active</span>
                <span className="text-2xl font-bold text-blue-600">{status.counts.active}</span>
             </div>
             <div className="bg-green-50 p-4 rounded-2xl border border-green-100 text-center">
                <span className="block text-[10px] font-black text-green-500 uppercase tracking-widest mb-1">Completed</span>
                <span className="text-2xl font-bold text-green-600">{status.counts.completed}</span>
             </div>
             <div className="bg-yellow-50 p-4 rounded-2xl border border-yellow-100 text-center">
                <span className="block text-[10px] font-black text-yellow-500 uppercase tracking-widest mb-1">Delayed</span>
                <span className="text-2xl font-bold text-yellow-600">{status.counts.delayed}</span>
             </div>
             <div className={`p-4 rounded-2xl border text-center ${status.counts.failed > 0 ? 'bg-red-50 border-red-200' : 'bg-zinc-50 border-zinc-100'}`}>
                <span className={`block text-[10px] font-black uppercase tracking-widest mb-1 ${status.counts.failed > 0 ? 'text-red-400' : 'text-zinc-400'}`}>Failed</span>
                <span className={`text-2xl font-bold ${status.counts.failed > 0 ? 'text-red-600' : 'text-zinc-900'}`}>{status.counts.failed}</span>
             </div>
          </div>

          {/* Recent Failures */}
          <div>
             <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-zinc-900">Recent Failures</h3>
                {status.counts.failed > 0 && (
                  <button 
                    onClick={() => handleClean(status.name)}
                    disabled={isPending}
                    className="text-xs font-bold text-red-500 hover:text-red-700 uppercase tracking-widest transition-colors"
                  >
                    Clean All Failed
                  </button>
                )}
             </div>

             {status.recentFailures.length === 0 ? (
               <div className="text-center py-8 bg-zinc-50 rounded-2xl border border-dashed border-zinc-200">
                  <p className="text-zinc-400 text-sm font-medium">No recent failures.</p>
               </div>
             ) : (
               <div className="space-y-3">
                 {status.recentFailures.map((job) => (
                   <div key={job.id} className="bg-white border border-red-100 p-4 rounded-2xl flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-black uppercase rounded">Job #{job.id}</span>
                          <span className="text-xs text-zinc-500 font-mono">{formatTimestamp(job.timestamp).toLocaleString()}</span>
                        </div>
                        <p className="text-sm font-bold text-zinc-900 mb-1">{job.name}</p>
                        <p className="text-xs text-red-600 font-mono break-all line-clamp-2">{job.failedReason || 'Unknown error'}</p>
                      </div>
                      <button 
                        onClick={() => handleRetry(status.name, job.id)}
                        disabled={isPending}
                        className="px-3 py-1.5 bg-zinc-100 text-zinc-600 text-xs font-bold rounded-lg hover:bg-zinc-200 transition-colors"
                      >
                        Retry Job
                      </button>
                   </div>
                 ))}
               </div>
             )}
          </div>
        </div>
      ))}
    </div>
  );
}
