'use client';

import { Activity } from '@naija-agent/types';
import { formatTimestamp, formatCurrency } from '../../../../lib/utils';

interface TableProps {
  transactions: Activity[];
  currency: {
    code: string;
    symbol: string;
    locale: string;
  };
}

export default function FinancialsTable({ transactions, currency }: TableProps) {
  if (transactions.length === 0) {
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-zinc-200">
        <p className="text-zinc-400 text-sm">No financial transactions found yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden bg-white rounded-xl border border-zinc-200 shadow-sm">
      <table className="min-w-full divide-y divide-zinc-200">
        <thead className="bg-zinc-50">
          <tr>
            <th className="px-6 py-4 text-left text-[10px] font-black text-zinc-400 uppercase tracking-widest">Date</th>
            <th className="px-6 py-4 text-left text-[10px] font-black text-zinc-400 uppercase tracking-widest">Type</th>
            <th className="px-6 py-4 text-left text-[10px] font-black text-zinc-400 uppercase tracking-widest">Summary</th>
            <th className="px-6 py-4 text-right text-[10px] font-black text-zinc-400 uppercase tracking-widest">Amount</th>
            <th className="px-6 py-4 text-right text-[10px] font-black text-zinc-400 uppercase tracking-widest">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200">
          {transactions.map((tx) => (
            <tr key={tx.id} className="hover:bg-zinc-50 transition-colors">
              <td className="px-6 py-4 whitespace-nowrap text-xs font-bold text-zinc-500 font-mono">
                {formatTimestamp(tx.createdAt).toLocaleDateString()} <br/>
                <span className="text-zinc-300 text-[10px]">
                  {formatTimestamp(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wide ${
                  tx.type === 'order' ? 'bg-blue-50 text-blue-700' : 'bg-zinc-100 text-zinc-600'
                }`}>
                  {tx.type}
                </span>
              </td>
              <td className="px-6 py-4">
                <div className="text-sm font-bold text-zinc-900 line-clamp-1">{tx.summary}</div>
                <div className="text-xs text-zinc-400">{tx.customerPhone}</div>
              </td>
              <td className="px-6 py-4 text-right whitespace-nowrap">
                <div className="text-sm font-bold text-zinc-900 font-mono">
                  {formatCurrency(tx.amount || 0, currency.locale, currency.code, currency.symbol)}
                </div>
              </td>
              <td className="px-6 py-4 text-right whitespace-nowrap">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide ${
                  tx.status === 'confirmed' || tx.status === 'delivered'
                    ? 'bg-green-100 text-green-700' 
                    : tx.status === 'pending_payment' 
                    ? 'bg-orange-100 text-orange-700'
                    : 'bg-zinc-100 text-zinc-500'
                }`}>
                  {tx.status.replace(/_/g, ' ')}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
