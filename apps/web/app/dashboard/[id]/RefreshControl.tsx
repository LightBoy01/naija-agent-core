'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useTransition, useState, useCallback } from 'react';

export default function RefreshControl() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const handleRefresh = useCallback(() => {
    startTransition(() => {
      router.refresh();
      setLastUpdated(new Date());
    });
  }, [router]);

  useEffect(() => {
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      handleRefresh();
    }, 30000);

    return () => clearInterval(interval);
  }, [handleRefresh]);

  return (
    <div className="flex items-center gap-4">
      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-tight">
        Last Sync: {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
      <button 
        onClick={handleRefresh}
        disabled={isPending}
        className="p-2 bg-white rounded-xl border border-zinc-100 shadow-sm text-zinc-400 hover:text-zinc-900 transition-all disabled:opacity-50"
        title="Refresh Board"
      >
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          width="16" height="16" 
          viewBox="0 0 24 24" 
          fill="none" stroke="currentColor" 
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className={isPending ? 'animate-spin' : ''}
        >
          <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path>
          <polyline points="21 3 21 8 16 8"></polyline>
        </svg>
      </button>
    </div>
  );
}
