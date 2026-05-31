import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { orgId } = body;

    if (!orgId) {
      return NextResponse.json({ error: 'orgId is required' }, { status: 400 });
    }

    const sidecarUrl = process.env.SOVEREIGN_SIDECAR_URL || 'http://159.195.150.66:8080';
    const apiKey = process.env.ADMIN_API_KEY;

    if (!apiKey) {
      console.error('CRITICAL: ADMIN_API_KEY is not set in Vercel environment variables');
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    // Call the Sovereign Go Sidecar
    const res = await fetch(`${sidecarUrl}/connect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({ orgId }),
      // Important: don't let fetch cache this request
      cache: 'no-store'
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Sidecar error: ${text}` }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Proxy Error:', error);
    return NextResponse.json({ error: 'Failed to connect to Sovereign Sidecar' }, { status: 500 });
  }
}
