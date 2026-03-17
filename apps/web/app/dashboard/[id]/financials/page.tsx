import { verifyTenantSession } from '../../../../lib/auth';
import { getOrgById, getWeeklySummary, getRecentActivities } from '@naija-agent/firebase';
import { formatCurrency } from '../../../../lib/utils';
import SalesChart from './SalesChart';
import FinancialsTable from './FinancialsTable';
import Link from 'next/link';

interface DailySnapshot {
  id: string;
  totalSalesKobo?: number;
  totalExpensesKobo?: number;
}

export default async function FinancialsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  // 1. Verify Session
  await verifyTenantSession(id);
  
  // 2. Fetch Data (Parallel)
  const [org, history, activities] = await Promise.all([
    getOrgById(id),
    getWeeklySummary(id, 30), // Get last 30 days
    getRecentActivities(id, 50) // Get last 50 activities
  ]);

  if (!org) return <div>Organization not found.</div>;

  const currency = org.currency || { code: 'NGN', symbol: '₦', locale: 'en-NG' };

  // 3. Process Data for Chart
  const chartData = (history as DailySnapshot[]).map((day) => ({
    date: day.id.split('-').slice(1).join('/'), // MM/DD
    sales: (day.totalSalesKobo || 0) / 100,
    expenses: (day.totalExpensesKobo || 0) / 100
  }));

  // 4. Calculate KPI Totals (from the 30-day window)
  const totalSales30d = chartData.reduce((acc, curr) => acc + curr.sales, 0);
  const totalExpenses30d = chartData.reduce((acc, curr) => acc + curr.expenses, 0);
  const netProfit30d = totalSales30d - totalExpenses30d;

  // 5. Filter Transactions for Table
  const financialActivities = activities.filter(a => 
    a.type === 'order' || (a.amount && a.amount > 0)
  );

  return (
    <main className="min-h-screen bg-zinc-50 font-sans p-6">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center gap-4 mb-8">
          <Link 
            href={`/dashboard/${id}`}
            className="p-3 bg-white rounded-2xl border border-zinc-100 shadow-sm text-zinc-400 hover:text-zinc-900 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
          </Link>
          <div>
            <h1 className="text-2xl font-black text-zinc-900 uppercase tracking-tighter">
              Visual <span className="text-green-600">Ledger</span>
            </h1>
            <p className="text-zinc-500 text-sm">30-Day Financial Performance</p>
          </div>
        </header>

        {/* --- KPI CARDS --- */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm">
             <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Total Sales (30d)</p>
             <h3 className="text-3xl font-black text-zinc-900">
               {formatCurrency(totalSales30d, currency.locale, currency.code, currency.symbol)}
             </h3>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm">
             <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Bot Costs (30d)</p>
             <h3 className="text-3xl font-black text-red-600">
               {formatCurrency(totalExpenses30d, currency.locale, currency.code, currency.symbol)}
             </h3>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm">
             <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Net Profit (30d)</p>
             <h3 className={`text-3xl font-black ${netProfit30d >= 0 ? 'text-green-600' : 'text-orange-600'}`}>
               {formatCurrency(netProfit30d, currency.locale, currency.code, currency.symbol)}
             </h3>
          </div>
        </section>

        {/* --- CHART --- */}
        <section className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm mb-8">
           <h2 className="text-lg font-bold text-zinc-900 mb-6">Revenue vs Costs</h2>
           <SalesChart data={chartData} symbol={currency.symbol} />
        </section>

        {/* --- TRANSACTIONS --- */}
        <section>
          <h2 className="text-lg font-bold text-zinc-900 mb-6">Recent Transactions</h2>
          <FinancialsTable transactions={financialActivities} currency={currency} />
        </section>
      </div>
    </main>
  );
}
