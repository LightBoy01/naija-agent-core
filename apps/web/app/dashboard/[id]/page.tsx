import { verifyTenantSession } from '../../../lib/auth';
import { getOrgById, getRecentActivities } from '@naija-agent/firebase';
import { formatTimestamp, formatCurrency } from '../../../lib/utils';
import { Activity } from '@naija-agent/types';
import { logoutTenant } from '../../auth/actions';
import Link from 'next/link';
import StatusButton from './StatusButton';
import RefreshControl from './RefreshControl';

export default async function TenantDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  // 1. Verify Session matches the requested Org ID
  const session = await verifyTenantSession(id);
  
  // 2. Fetch Data
  const [org, activities] = await Promise.all([
    getOrgById(id),
    getRecentActivities(id, 20)
  ]);

  if (!org) return <div>Organization not found.</div>;

  const currency = org.currency || { code: 'NGN', symbol: '₦', locale: 'en-NG' };
  const balanceNaira = (org.balance || 0) / 100;

  return (
    <main className="min-h-screen bg-zinc-50 font-sans p-6">
      <div className="max-w-6xl mx-auto">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-black text-zinc-900 uppercase tracking-tighter">
              {org.name} <span className="text-green-600">Hub</span>
            </h1>
            <p className="text-zinc-500 text-sm">Welcome back, Boss {session.phone}</p>
          </div>
          <div className="flex items-center gap-3">
             <Link 
                href={`/dashboard/${id}/inventory`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-2xl border border-zinc-800 shadow-xl shadow-zinc-200 text-sm font-bold hover:bg-zinc-800 transition-all"
             >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path><polyline points="3.29 7 12 12 20.71 7"></polyline><line x1="12" y1="22" x2="12" y2="12"></line></svg>
                Inventory
             </Link>
             <Link 
                href={`/dashboard/${id}/financials`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white text-zinc-900 rounded-2xl border border-zinc-200 shadow-sm text-sm font-bold hover:bg-zinc-50 transition-all"
             >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                Ledger
             </Link>
             <div className="bg-white px-4 py-2 rounded-2xl border border-zinc-100 shadow-sm">
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Bot Balance</span>
                <span className="text-lg font-bold text-zinc-900">{formatCurrency(balanceNaira, currency.locale, currency.code, currency.symbol)}</span>
             </div>
             <form action={logoutTenant}>
                <button className="p-3 bg-white rounded-2xl border border-zinc-100 shadow-sm text-zinc-400 hover:text-red-600 transition-colors">
                   <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                </button>
             </form>
          </div>
        </header>

        {/* --- STATS GRID --- */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
           {[
             { label: 'Pending Orders', value: activities.filter(a => a.status === 'pending' || a.status === 'pending_payment').length, color: 'text-orange-600' },
             { label: 'Confirmed', value: activities.filter(a => a.status === 'confirmed').length, color: 'text-blue-600' },
             { label: 'In Transit', value: activities.filter(a => a.status === 'in_transit' || a.status === 'picked_up').length, color: 'text-purple-600' },
             { label: 'Delivered', value: activities.filter(a => a.status === 'delivered').length, color: 'text-green-600' },
           ].map((stat, i) => (
             <div key={i} className="bg-white p-4 rounded-2xl border border-zinc-100 shadow-sm">
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">{stat.label}</p>
                <h3 className={`text-2xl font-black ${stat.color}`}>{stat.value}</h3>
             </div>
           ))}
        </section>

        {/* --- LIVE ACTIVITY FEED --- */}
        <section>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-zinc-900">Live Dispatch Board</h2>
            <div className="flex items-center gap-4">
               <RefreshControl />
               <div className="flex items-center gap-2 px-3 py-1 bg-green-50 rounded-full border border-green-100">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-[10px] font-bold text-green-700 uppercase tracking-tight">Live Feed</span>
               </div>
            </div>
          </div>

          <div className="space-y-4">
             {activities.length === 0 ? (
               <div className="text-center py-20 bg-white rounded-3xl border border-zinc-100 italic text-zinc-400">
                  No orders or activities found. Time to make some sales!
               </div>
             ) : (
               activities.map((activity: Activity) => (
                 <div key={activity.id} className="bg-white p-5 rounded-3xl border border-zinc-100 shadow-sm hover:border-zinc-300 transition-all group">
                    <div className="flex flex-col md:flex-row justify-between gap-4">
                       <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                             <span className="text-[10px] font-black bg-zinc-900 text-white px-2 py-0.5 rounded-md uppercase tracking-tighter">
                                {activity.id}
                             </span>
                             <span className={`text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-tighter ${
                                activity.status === 'confirmed' ? 'bg-blue-100 text-blue-800' :
                                activity.status === 'delivered' ? 'bg-green-100 text-green-800' :
                                activity.status === 'pending_payment' ? 'bg-orange-100 text-orange-800' :
                                'bg-zinc-100 text-zinc-600'
                             }`}>
                                {activity.status.replace(/_/g, ' ')}
                             </span>
                             <span className="text-[10px] font-bold text-zinc-400 uppercase">
                                {formatTimestamp(activity.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                             </span>
                          </div>
                          <h4 className="text-sm font-bold text-zinc-900 mb-1">{activity.summary}</h4>
                          <div className="flex items-center gap-4 text-[10px] font-bold text-zinc-400">
                             <span className="flex items-center gap-1">
                                📞 {activity.customerPhone || 'N/A'}
                             </span>
                             {activity.amount && (
                               <span className="text-zinc-900">
                                  💰 {formatCurrency(activity.amount, currency.locale, currency.code, currency.symbol)}
                               </span>
                             )}
                          </div>
                       </div>
                       
                       <div className="flex items-center gap-2">
                          <StatusButton 
                            orgId={id} 
                            activityId={activity.id} 
                            type={activity.type} 
                            currentStatus={activity.status} 
                            targetStatus="confirmed" 
                            label="✅ Confirm Payment"
                            color="bg-green-600 text-white hover:bg-green-700 shadow-lg shadow-green-200"
                          />
                          <StatusButton 
                            orgId={id} 
                            activityId={activity.id} 
                            type={activity.type} 
                            currentStatus={activity.status} 
                            targetStatus="ready_for_pickup" 
                            label="📦 Packed"
                            color="bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200"
                          />
                          <StatusButton 
                            orgId={id} 
                            activityId={activity.id} 
                            type={activity.type} 
                            currentStatus={activity.status} 
                            targetStatus="in_transit" 
                            label="🏍️ Out for Delivery"
                            color="bg-purple-600 text-white hover:bg-purple-700 shadow-lg shadow-purple-200"
                          />
                          <StatusButton 
                            orgId={id} 
                            activityId={activity.id} 
                            type={activity.type} 
                            currentStatus={activity.status} 
                            targetStatus="delivered" 
                            label="🏁 Delivered"
                            color="bg-zinc-900 text-white hover:bg-black shadow-lg shadow-zinc-200"
                          />
                          <button className="px-4 py-2 bg-zinc-50 border border-zinc-100 rounded-xl text-[10px] font-black text-zinc-600 uppercase tracking-widest hover:bg-zinc-200 transition-all">
                             View Details
                          </button>
                       </div>
                    </div>
                 </div>
               ))
             )}
          </div>
        </section>
      </div>
    </main>
  );
}
