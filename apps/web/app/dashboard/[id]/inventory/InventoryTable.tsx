'use client';

import { useTransition, useState } from 'react';
import { updateProductAction, removeProductAction } from './actions';
import { formatCurrency, resolveMediaUrl } from '../../../../lib/utils';
import { EntityDefinition } from '@naija-agent/types';

interface InventoryTableProps {
  orgId: string;
  products: (Record<string, string | number | boolean | undefined | null> & { id: string })[];
  currency: { code: string; symbol: string; locale: string };
  entityDef: EntityDefinition;
}

export default function InventoryTable({ orgId, products, currency, entityDef }: InventoryTableProps) {
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Record<string, string | number>>({});

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
    <div className="bg-white rounded-3xl border border-zinc-100 shadow-xl overflow-hidden overflow-x-auto">
      <table className="w-full text-left whitespace-nowrap">
        <thead>
          <tr className="bg-zinc-50 border-b border-zinc-100">
            {entityDef.fields.map(field => (
              <th key={field.key} className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                {field.label}
              </th>
            ))}
            <th className="px-6 py-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-50">
          {products.length === 0 ? (
            <tr>
              <td colSpan={entityDef.fields.length + 1} className="px-6 py-20 text-center text-sm text-zinc-400 italic">
                No {entityDef.plural.toLowerCase()} found. Add them via WhatsApp or the AI!
              </td>
            </tr>
          ) : (
            products.map((p) => (
              <tr key={p.id} className="hover:bg-zinc-50/50 transition-colors group">
                {entityDef.fields.map(field => {
                  const isEditing = editingId === p.id && !['name', 'title', 'image'].includes(field.key);
                  const val = p[field.key];

                  return (
                    <td key={field.key} className="px-6 py-5">
                      {isEditing ? (
                        <input 
                          type={field.type === 'number' ? 'number' : 'text'} 
                          value={editData[field.key] ?? ''} 
                          onChange={(e) => setEditData({ 
                            ...editData, 
                            [field.key]: field.type === 'number' ? Number(e.target.value) : e.target.value 
                          })}
                          className="w-full min-w-[80px] px-2 py-1 bg-zinc-100 border border-zinc-200 rounded-lg text-sm font-bold outline-none focus:border-green-600"
                        />
                      ) : (
                        <div className="flex items-center gap-3">
                          {field.type === 'image' && (
                            val ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={resolveMediaUrl(val as string)} alt={String(p.name || p.title || 'Item')} className="w-10 h-10 rounded-xl object-cover border border-zinc-100" />
                            ) : (
                              <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center text-xl">📦</div>
                            )
                          )}
                          <div>
                            {field.type === 'image' ? null : field.key === 'price' ? (
                              <span className="text-sm font-black text-zinc-900">{formatCurrency(Number(val ?? 0), currency.locale, currency.code, currency.symbol)}</span>
                            ) : (
                              <span className={`text-sm ${['name', 'title'].includes(field.key) ? 'font-bold text-zinc-900' : 'font-medium text-zinc-600'}`}>
                                {val !== undefined && val !== null ? String(val) : '-'}
                              </span>
                            )}
                            {field.key === 'stock' && p.isLowStock && !isEditing && (
                              <span className="ml-2 text-[8px] font-black bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full uppercase">Low</span>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                  );
                })}
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
                            // Pre-fill editable fields
                            const initialData: Record<string, string | number> = {};
                            entityDef.fields.forEach(f => {
                              if (!['name', 'title', 'image'].includes(f.key)) {
                                initialData[f.key] = (p[f.key] as string | number) ?? (f.type === 'number' ? 0 : '');
                              }
                            });
                            setEditData(initialData);
                          }}
                          className="p-2 text-zinc-400 hover:text-zinc-900 transition-colors"
                          title="Edit"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <button 
                          onClick={() => handleDelete(p.id, String(p.name || p.title || 'Item'))}
                          className="p-2 text-zinc-400 hover:text-red-600 transition-colors"
                          title="Delete"
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