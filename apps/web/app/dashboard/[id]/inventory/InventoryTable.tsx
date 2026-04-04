'use client';

import { Product } from '@naija-agent/types';
import { useTransition, useState } from 'react';
import { updateProductAction, removeProductAction } from './actions';

import { formatCurrency } from '../../../../lib/utils';

interface InventoryTableProps {
  orgId: string;
  products: Product[];
  currency: { code: string; symbol: string; locale: string };
}

export default function InventoryTable({ orgId, products, currency }: InventoryTableProps) {
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditEditData] = useState({ price: 0, stock: 0 });

  const handleSave = (productId: string) => {
    startTransition(async () => {
      const result = await updateProductAction(orgId, productId, editData);
      if (result.success) {
        setEditingId(null);
      } else {
        alert('Failed to update: ' + result.error);
      }
    });
  };

  const handleDelete = (productId: string, name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}?`)) return;
    startTransition(async () => {
      const result = await removeProductAction(orgId, productId);
      if (!result.success) {
        alert('Failed to delete: ' + result.error);
      }
    });
  };

  return (
    <div className="bg-white rounded-3xl border border-zinc-100 shadow-xl overflow-hidden">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-zinc-50 border-b border-zinc-100">
            <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Product</th>
            <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Price</th>
            <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Stock</th>
            <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-50">
          {products.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-6 py-20 text-center text-sm text-zinc-400 italic">
                No products found. Add them via WhatsApp or the AI!
              </td>
            </tr>
          ) : (
            products.map((p) => (
              <tr key={p.id} className="hover:bg-zinc-50/50 transition-colors group">
                <td className="px-6 py-5">
                  <div className="flex items-center gap-3">
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt={p.name} className="w-10 h-10 rounded-xl object-cover border border-zinc-100" />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center text-xl">📦</div>
                    )}
                    <div>
                      <p className="text-sm font-bold text-zinc-900">{p.name}</p>
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-tight">{p.category || 'Uncategorized'}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-5">
                  {editingId === p.id ? (
                    <input 
                      type="number" 
                      value={editData.price} 
                      onChange={(e) => setEditEditData({ ...editData, price: Number(e.target.value) })}
                      className="w-24 px-2 py-1 bg-zinc-100 border border-zinc-200 rounded-lg text-sm font-bold outline-none focus:border-green-600"
                    />
                  ) : (
                    <span className="text-sm font-black text-zinc-900">{formatCurrency(p.price, currency.locale, currency.code, currency.symbol)}</span>
                  )}
                </td>
                <td className="px-6 py-5">
                  {editingId === p.id ? (
                    <input 
                      type="number" 
                      value={editData.stock} 
                      onChange={(e) => setEditEditData({ ...editData, stock: Number(e.target.value) })}
                      className="w-20 px-2 py-1 bg-zinc-100 border border-zinc-200 rounded-lg text-sm font-bold outline-none focus:border-green-600"
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-black ${p.isLowStock ? 'text-red-600' : 'text-zinc-900'}`}>
                        {p.stock ?? 0}
                      </span>
                      {p.isLowStock && (
                        <span className="text-[8px] font-black bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full uppercase">Low</span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-6 py-5 text-right">
                  <div className="flex justify-end gap-2">
                    {editingId === p.id ? (
                      <>
                        <button 
                          onClick={() => handleSave(p.id)}
                          disabled={isPending}
                          className="px-3 py-1.5 bg-green-600 text-white text-[10px] font-black uppercase rounded-lg hover:bg-green-700 transition-all"
                        >
                          Save
                        </button>
                        <button 
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1.5 bg-zinc-200 text-zinc-600 text-[10px] font-black uppercase rounded-lg hover:bg-zinc-300 transition-all"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button 
                          onClick={() => {
                            setEditingId(p.id);
                            setEditEditData({ price: p.price, stock: p.stock ?? 0 });
                          }}
                          className="p-2 text-zinc-400 hover:text-zinc-900 transition-colors"
                          title="Edit Product"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button 
                          onClick={() => handleDelete(p.id, p.name)}
                          className="p-2 text-zinc-400 hover:text-red-600 transition-colors"
                          title="Delete Product"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 3 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
