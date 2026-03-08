import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-white font-sans selection:bg-green-100 selection:text-green-900">
      {/* Navigation */}
      <nav className="max-w-7xl mx-auto px-6 py-8 flex justify-between items-center">
        <div className="text-2xl font-black text-zinc-900 tracking-tighter">
          NAIJA<span className="text-green-600">AGENT</span>
        </div>
        <div className="flex gap-8 items-center">
          <Link href="#features" className="text-sm font-semibold text-zinc-500 hover:text-zinc-900 transition-colors">Features</Link>
          <Link href="/dashboard" className="px-5 py-2.5 bg-zinc-900 text-white text-sm font-bold rounded-full hover:bg-zinc-800 transition-all shadow-lg shadow-zinc-200">
            Sovereign Portal
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-6 py-24 text-center">
        <h1 className="text-6xl md:text-8xl font-black text-zinc-900 tracking-tightest leading-none mb-8">
          Your Business, <br />
          <span className="text-green-600 italic">Automated.</span>
        </h1>
        <p className="max-w-2xl mx-auto text-xl text-zinc-500 mb-12 leading-relaxed">
          Not just an AI bot. A 24/7 Nigerian COO that manages your customers, 
          detects fake receipts, and closes deals on WhatsApp while you sleep.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="https://wa.me/your-master-bot-number" className="px-8 py-4 bg-green-600 text-white text-lg font-bold rounded-2xl hover:bg-green-500 transition-all shadow-xl shadow-green-200">
            Get Started on WhatsApp
          </Link>
          <Link href="#demo" className="px-8 py-4 bg-white text-zinc-900 text-lg font-bold rounded-2xl border-2 border-zinc-100 hover:border-zinc-200 transition-all">
            See the Dashboard
          </Link>
        </div>
      </section>

      {/* Feature Grid */}
      <section id="features" className="bg-zinc-50 py-32 border-y border-zinc-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="p-8 bg-white rounded-3xl border border-zinc-100 shadow-sm hover:shadow-xl transition-all duration-500">
              <div className="text-4xl mb-6">🕵️‍♂️</div>
              <h3 className="text-xl font-bold text-zinc-900 mb-4">Fake Alert Buster</h3>
              <p className="text-zinc-500 leading-relaxed">
                Gemini Vision analyzes every receipt screenshot. It detects edits, mismatches, and fraudulent bank alerts in real-time.
              </p>
            </div>
            <div className="p-8 bg-white rounded-3xl border border-zinc-100 shadow-sm hover:shadow-xl transition-all duration-500">
              <div className="text-4xl mb-6">🎙️</div>
              <h3 className="text-xl font-bold text-zinc-900 mb-4">Native Voice Support</h3>
              <p className="text-zinc-500 leading-relaxed">
                Your customers speak, our agent listens. Fully multimodal support for Nigerian accents and local slang via voice notes.
              </p>
            </div>
            <div className="p-8 bg-white rounded-3xl border border-zinc-100 shadow-sm hover:shadow-xl transition-all duration-500">
              <div className="text-4xl mb-6">📊</div>
              <h3 className="text-xl font-bold text-zinc-900 mb-4">Sovereign Control</h3>
              <p className="text-zinc-500 leading-relaxed">
                Manage multiple business locations from one dashboard. Instant onboarding, real-time analytics, and credit-based billing.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-zinc-100">
        <div className="max-w-7xl mx-auto px-6 flex justify-between items-center text-zinc-400 text-sm font-medium">
          <p>© 2026 Naija Agent Core. All rights reserved.</p>
          <div className="flex gap-8">
            <Link href="/terms" className="hover:text-zinc-900">Terms</Link>
            <Link href="/privacy" className="hover:text-zinc-900">Privacy</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
