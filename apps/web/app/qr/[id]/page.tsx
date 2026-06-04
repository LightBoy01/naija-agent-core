'use client';

import { useParams } from 'next/navigation';
import SovereignQRScanner from '../../../components/SovereignQRScanner';

export default function QRPage() {
  const params = useParams();
  const id = params?.id as string;
  
  return (
    <main className="min-h-screen bg-zinc-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-2xl text-center">
        <h1 className="text-2xl font-black mb-6 text-zinc-900">
          Fast Link: <span className="text-green-600">{id?.toUpperCase()}</span>
        </h1>
        <p className="text-zinc-500 text-sm mb-6">
          Scan this QR code using the dedicated WhatsApp Business app for {id?.toUpperCase()}.
        </p>
        <SovereignQRScanner orgId={id} onSuccess={() => {}} />
      </div>
    </main>
  );
}
