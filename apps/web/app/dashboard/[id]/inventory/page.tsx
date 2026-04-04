import { verifyTenantSession } from '../../../../lib/auth';
import { getOrgById, getProducts } from '@naija-agent/firebase';
import Link from 'next/link';
import InventoryTable from './InventoryTable';
import NewProductForm from './NewProductForm';

export default async function InventoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  // 1. Verify Session
  await verifyTenantSession(id);
  
  // 2. Fetch Data
  const [org, products] = await Promise.all([
    getOrgById(id),
    getProducts(id)
  ]);

  if (!org) return <div>Organization not found.</div>;

  const currency = org.currency || { code: 'NGN', symbol: '₦', locale: 'en-NG' };

  return (
    <main className="min-h-screen bg-zinc-50 font-sans p-6">
      <div className="max-w-6xl mx-auto">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div className="flex items-center gap-4">
            <Link 
              href={`/dashboard/${id}`}
              className="p-3 bg-white rounded-2xl border border-zinc-100 shadow-sm text-zinc-400 hover:text-zinc-900 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            </Link>
            <div>
              <h1 className="text-2xl font-black text-zinc-900 uppercase tracking-tighter">
                Inventory <span className="text-green-600">Manager</span>
              </h1>
              <p className="text-zinc-500 text-sm">{org.name} Catalog</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
             <NewProductForm orgId={id} symbol={currency.symbol} />
             <div className="bg-white px-4 py-2 rounded-2xl border border-zinc-100 shadow-sm">
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Total Products</span>
                <span className="text-lg font-bold text-zinc-900">{products.length}</span>
             </div>
             <div className="bg-white px-4 py-2 rounded-2xl border border-zinc-100 shadow-sm">
                <span className="text-[10px] font-black text-red-400 uppercase tracking-widest block">Low Stock</span>
                <span className="text-lg font-bold text-red-600">{products.filter(p => p.isLowStock).length}</span>
             </div>
          </div>
        </header>

        {/* --- INVENTORY LIST --- */}
        <section>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-zinc-900">Product Catalog</h2>
            <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
               Click the <span className="text-zinc-900">pencil icon</span> to update price or stock
            </div>
          </div>

          <InventoryTable orgId={id} products={products} currency={currency} />
        </section>

        <footer className="mt-12 text-center">
           <p className="text-xs text-zinc-400">
             Oga, you fit still tell the bot &quot;Add 10 units to Bread&quot; on WhatsApp. <br />
             The Dashboard and the AI work together sharp-sharp!
           </p>
        </footer>
      </div>
    </main>
  );
}
