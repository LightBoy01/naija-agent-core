import Link from 'next/link';

export default function Settings() {
  return (
    <main className="min-h-screen p-8 bg-zinc-50 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-3xl font-bold text-zinc-900">Network Settings</h1>
            <p className="text-zinc-500">Configure your bots and payment providers</p>
          </div>
          <Link href="/dashboard" className="px-4 py-2 bg-white rounded-lg border border-zinc-200 shadow-sm text-sm font-semibold text-zinc-600 hover:text-zinc-900 transition-colors">
            ← Back to Dashboard
          </Link>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="p-8 bg-white rounded-2xl border border-zinc-200 shadow-sm">
            <h3 className="text-lg font-bold text-zinc-900 mb-6">Payment Configuration</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase mb-2">Paystack Secret Key</label>
                <input type="password" value="sk_test_••••••••••••" readOnly className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl font-mono text-sm" />
              </div>
              <p className="text-xs text-zinc-400">Settings are currently locked for security. Use the Master Bot on WhatsApp to change keys.</p>
            </div>
          </div>

          <div className="p-8 bg-white rounded-2xl border border-zinc-200 shadow-sm">
            <h3 className="text-lg font-bold text-zinc-900 mb-6">Master Intelligence</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase mb-2">Default Model</label>
                <select className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl font-medium text-sm">
                  <option>gemini-2.5-flash</option>
                  <option>gemini-2.0-pro</option>
                </select>
              </div>
              <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 text-blue-700 rounded-xl border border-blue-100">
                <span className="text-sm font-bold">Pro Tip:</span>
                <span className="text-xs">Flash is optimized for Nigerian network speeds.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
