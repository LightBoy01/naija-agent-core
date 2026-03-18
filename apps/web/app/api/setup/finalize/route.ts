import { NextResponse } from 'next/server';
import { completeHybridOnboarding } from '@naija-agent/firebase';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, name, bankName, accountNumber, accountName, adminPin, metaData } = body;

    if (!id || !metaData?.accessToken) {
      return NextResponse.json({ message: 'Missing required setup data.' }, { status: 400 });
    }

    // Call the firebase module to finalize
    await completeHybridOnboarding(id, {
      name,
      bankName,
      accountNumber,
      accountName,
      adminPin,
      meta: {
        accessToken: metaData.accessToken,
        phoneId: metaData.phoneId,
        wabaId: metaData.wabaId
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    console.error('❌ Setup Finalize Error:', message);
    return NextResponse.json({ message }, { status: 500 });
  }
}
