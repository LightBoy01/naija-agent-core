'use client';

import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';

export default function SovereignQRScanner({
  orgId,
  onSuccess
}: {
  orgId: string;
  onSuccess: (data: { connected: true }) => void;
}) {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('idle'); // idle, scan_required, timeout, connected

  const fetchQRCode = async () => {
    setLoading(true);
    setError(null);
    setQrCode(null);
    setStatus('idle');

    try {
      const res = await fetch('/api/proxy/sidecar/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch QR code');
      }

      const data = await res.json();

      if (data.status === 'scan_required') {
        setQrCode(data.qr);
        setStatus('scan_required');
        
        // Start a 40 second timeout for the QR code
        setTimeout(() => {
          setStatus((prev) => (prev === 'scan_required' ? 'timeout' : prev));
        }, 40000);
      } else if (data.status === 'success' || data.status === 'connected') {
        setStatus('connected');
        onSuccess({ connected: true });
        toast.success('WhatsApp successfully connected!');
      } else {
        setStatus(data.status);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message);
      toast.error('Failed to connect to Sovereign Sidecar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-6 flex flex-col items-center justify-center space-y-4">
      {status === 'idle' && !loading && (
        <button
          type="button"
          onClick={fetchQRCode}
          className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition-colors shadow-sm w-full"
        >
          Generate WhatsApp QR Code
        </button>
      )}

      {loading && (
        <div className="animate-pulse flex flex-col items-center">
          <div className="h-48 w-48 bg-zinc-200 rounded-lg mb-4"></div>
          <p className="text-sm text-zinc-500 font-medium">Communicating with Sovereign Engine...</p>
        </div>
      )}

      {status === 'scan_required' && qrCode && !loading && (
        <div className="flex flex-col items-center space-y-4 animate-in fade-in zoom-in duration-300">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-zinc-200">
            <QRCodeSVG value={qrCode} size={200} level="H" includeMargin={true} />
          </div>
          <p className="text-sm text-zinc-600 font-medium text-center">
            Open WhatsApp on your Bot phone,<br />
            Go to <b>Linked Devices</b>, and scan this code.
          </p>
          <p className="text-xs text-amber-600 font-bold">
            QR Code expires in 40 seconds!
          </p>
        </div>
      )}

      {status === 'timeout' && (
        <div className="flex flex-col items-center space-y-4">
          <div className="h-48 w-48 bg-zinc-200 rounded-lg flex items-center justify-center border-2 border-dashed border-zinc-400">
            <span className="text-zinc-500 font-bold">EXPIRED</span>
          </div>
          <p className="text-sm text-red-600 font-medium">QR Code has expired.</p>
          <button
            type="button"
            onClick={fetchQRCode}
            className="bg-zinc-900 hover:bg-zinc-800 text-white font-bold py-2 px-4 rounded-lg transition-colors shadow-sm"
          >
            Refresh QR Code
          </button>
        </div>
      )}

      {status === 'connected' && (
        <div className="flex flex-col items-center space-y-2 text-green-700 bg-green-50 p-4 rounded-lg w-full border border-green-200">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <p className="font-bold text-lg">Connected!</p>
          <p className="text-xs">Your Sovereign Engine is securely linked.</p>
        </div>
      )}

      {error && (
        <div className="text-red-500 text-xs font-bold text-center">
          {error}
        </div>
      )}
    </div>
  );
}
