import { NextRequest, NextResponse } from 'next/server';
import { getOrgById } from '@naija-agent/firebase';
import { cookies } from 'next/headers';
import { Redis } from 'ioredis';

// --- Redis Setup for Media Caching ---
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
};
const redis = new Redis(redisConfig);

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
    const version = process.env.WHATSAPP_API_VERSION || 'v21.0';

    // --- Performance Optimization: Redis Caching ---
    const cacheKey = `media_proxy:${mediaId}`;
    const cachedData = await redis.get(cacheKey);
    
    let mediaUrl: string;
    let mimeType: string;

    if (cachedData) {
      const parsed = JSON.parse(cachedData);
      mediaUrl = parsed.url;
      mimeType = parsed.mimeType;
      console.log(`⚡ [PROXY] Serving cached URL for ${mediaId}`);
    } else {
      // 1. Get the media URL from Meta
      // implementation note: using dynamic version to match system logic
      const urlResponse = await fetch(`https://graph.facebook.com/${version}/${mediaId}`, {
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
      mediaUrl = mediaData.url;
      mimeType = mediaData.mime_type;

      if (!mediaUrl) {
        return new NextResponse('Media URL not found in Meta response', { status: 404 });
      }

      // Cache the result for 1 hour (Meta links usually last longer, but let's be safe)
      await redis.setex(cacheKey, 3600, JSON.stringify({ url: mediaUrl, mimeType }));
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
