import { NextResponse } from 'next/server';
import { getNotificationQueue } from '../../../../lib/queue';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
  try {
    const session = (await cookies()).get('session')?.value;
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { tenantId, phoneId, accessToken, wabaId } = body;

    if (!tenantId || !phoneId || !accessToken) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const queue = getNotificationQueue();
    await queue.add('request-otp', {
      tenantId,
      phoneId,
      accessToken,
      wabaId,
      timestamp: Date.now()
    }, { removeOnComplete: true });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Relay Error:', message);
    return NextResponse.json({ error: 'Failed to queue activation' }, { status: 500 });
  }
}
