'use client';

import { useTransition, useState } from 'react';
import { createProductAction } from './actions';

export default function NewProductForm({ orgId }: { orgId: string }) {
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    stock: '',
    category: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await createProductAction(orgId, {
        name: formData.name,
        price: Number(formData.price),
        stock: Number(formData.stock),
        category: formData.category
      });

      if (result.success) {
        setIsOpen(false);
        setFormData({ name: '', price: '', stock: '', category: '' });
      } else {
        alert('Failed to create: ' + result.error);
      }
    });
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-900 text-white rounded-2xl border border-zinc-800 shadow-xl shadow-zinc-200 text-sm font-bold hover:bg-zinc-800 transition-all"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        Add New Product
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-zinc-100 p-8 animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-black text-zinc-900 uppercase tracking-tighter">New Product</h2>
          <button onClick={() => setIsOpen(false)} className="text-zinc-400 hover:text-zinc-900 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1 px-1">Product Name</label>
            <input 
              type="text" 
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Premium Bread"
              className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:ring-2 focus:ring-green-500/20 focus:border-green-600 outline-none transition-all font-bold"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1 px-1">Price (₦)</label>
              <input 
                type="number" 
                required
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                placeholder="1500"
                className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:ring-2 focus:ring-green-500/20 focus:border-green-600 outline-none transition-all font-mono font-bold"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1 px-1">Initial Stock</label>
              <input 
                type="number" 
                required
                value={formData.stock}
                onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                placeholder="50"
                className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:ring-2 focus:ring-green-500/20 focus:border-green-600 outline-none transition-all font-mono font-bold"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1 px-1">Category (Optional)</label>
            <input 
              type="text" 
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              placeholder="e.g. Bakery"
              className="w-full px-4 py-3 bg-zinc-50 border border-zinc-100 rounded-xl focus:ring-2 focus:ring-green-500/20 focus:border-green-600 outline-none transition-all font-bold"
            />
          </div>

          <button 
            type="submit"
            disabled={isPending}
            className="w-full py-4 bg-zinc-900 text-white font-bold rounded-2xl hover:bg-zinc-800 transition-all shadow-xl shadow-zinc-200 disabled:opacity-50 mt-4"
          >
            {isPending ? 'Saving...' : 'Create Product'}
          </button>
        </form>
      </div>
    </div>
  );
}
