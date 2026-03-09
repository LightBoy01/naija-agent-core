import { NextRequest, NextResponse } from 'next/server';
import { getOrgById } from '@naija-agent/firebase';
import { cookies } from 'next/headers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: mediaId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const orgId = searchParams.get('orgId');

  // Security: Basic Sovereign check for proxy access
  const session = (await cookies()).get('sovereign_session');
  if (!session || session.value !== 'active') {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // Multi-Tenancy Token Lookup
  let apiToken = process.env.WHATSAPP_API_TOKEN;
  if (orgId) {
    const org = await getOrgById(orgId);
    if (org?.config?.whatsappToken) {
      apiToken = org.config.whatsappToken;
    }
  }

  if (!apiToken) {
    console.error('CRITICAL: WHATSAPP_API_TOKEN is missing in web environment.');
    return new NextResponse('Internal Server Error: Configuration Missing', { status: 500 });
  }

  try {
    // implementation note: using v18.0 to match existing worker service logic
    const urlResponse = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    });

    if (!urlResponse.ok) {
      const errorText = await urlResponse.text();
      console.error(`Meta API Error (Get URL) [${urlResponse.status}]:`, errorText);
      return new NextResponse(`Failed to fetch media metadata: ${urlResponse.statusText}`, { status: urlResponse.status });
    }

    const mediaData = await urlResponse.json();
    const mediaUrl = mediaData.url;
    const mimeType = mediaData.mime_type;

    if (!mediaUrl) {
      return new NextResponse('Media URL not found in Meta response', { status: 404 });
    }

    // 2. Fetch the binary data using the temporary URL
    // Note: The temporary URL requires the Bearer token for download
    const binaryResponse = await fetch(mediaUrl, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    });

    if (!binaryResponse.ok) {
      console.error(`Meta API Error (Download Binary) [${binaryResponse.status}]:`, await binaryResponse.text());
      return new NextResponse(`Failed to download media binary: ${binaryResponse.statusText}`, { status: binaryResponse.status });
    }

    // 3. Return the stream to the client
    const headers = new Headers();
    headers.set('Content-Type', mimeType || 'application/octet-stream');
    headers.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour to reduce API hits

    return new NextResponse(binaryResponse.body, {
      status: 200,
      headers,
    });

  } catch (error: any) {
    console.error('Media Proxy Error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
