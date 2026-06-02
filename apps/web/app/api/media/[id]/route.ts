import { NextRequest, NextResponse } from 'next/server';
import { getOrgById } from '@naija-agent/database';
import { cookies } from 'next/headers';
import { Redis } from 'ioredis';

// --- Redis Setup for Media Caching ---
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
};

let redis: Redis | null = null;
function getRedis() {
  if (!redis) {
    redis = new Redis(redisConfig);
  }
  return redis;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: mediaId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const orgId = searchParams.get('orgId');
  
  const redisClient = getRedis();

  const session = (await cookies()).get('sovereign_session');
  if (!session || session.value !== 'active') {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  let apiToken = process.env.WHATSAPP_API_TOKEN;
  let isSidecar = false;

  if (orgId) {
    const org = await getOrgById(orgId);
    const orgConfig = org?.config as Record<string, unknown> | undefined;
    if (orgConfig?.whatsappToken && typeof orgConfig.whatsappToken === 'string') {
      apiToken = orgConfig.whatsappToken;
    }
    if (org?.whatsappPhoneId?.startsWith('baileys-')) {
      isSidecar = true;
    }
  }

  // Baileys media IDs are usually alphanumeric, Meta IDs are purely numeric
  if (!/^\d+$/.test(mediaId)) {
     isSidecar = true;
  }

  if (!apiToken && !isSidecar) {
    console.error('CRITICAL: WHATSAPP_API_TOKEN is missing for Meta fetch.');
    return new NextResponse('Internal Server Error: Configuration Missing', { status: 500 });
  }

  try {
    if (isSidecar) {
        // --- 1. SOVEREIGN SIDECAR PROXY ---
        // MAJOR OVERSIGHT FIX: The Go Sidecar cannot download media ad-hoc by ID because it lacks the MediaKey.
        // It downloads media instantly upon receipt and saves to local disk, which the worker then 
        // archives to Alibaba OSS.
        // Therefore, if the frontend is trying to proxy a Sidecar media ID, it's doing it wrong.
        // The frontend MUST use `msg.metadata.storageUrl` instead.
        
        console.error(`⚡ [PROXY ERROR] Attempted to proxy Sidecar media ID ${mediaId}. Sidecar media must use storageUrl.`);
        return new NextResponse(`Sovereign Sidecar media cannot be fetched via proxy. Please use the Alibaba OSS storageUrl attached to the message metadata.`, { status: 400 });

    } else {
        // --- 2. META API PROXY ---
        const version = process.env.WHATSAPP_API_VERSION || 'v21.0';
        const cacheKey = `media_proxy:${mediaId}`;
        const cachedData = await redisClient.get(cacheKey);
        
        let mediaUrl: string;
        let mimeType: string;

        if (cachedData) {
          const parsed = JSON.parse(cachedData);
          mediaUrl = parsed.url;
          mimeType = parsed.mimeType;
          console.log(`⚡ [PROXY] Serving cached URL for ${mediaId}`);
        } else {
          const urlResponse = await fetch(`https://graph.facebook.com/${version}/${mediaId}`, {
            headers: { Authorization: `Bearer ${apiToken}` },
          });

          if (!urlResponse.ok) {
            const errorText = await urlResponse.text();
            console.error(`Meta API Error (Get URL) [${urlResponse.status}]:`, errorText);
            return new NextResponse(`Failed to fetch media metadata: ${urlResponse.statusText}`, { status: urlResponse.status });
          }

          const mediaData = await urlResponse.json();
          mediaUrl = mediaData.url;
          mimeType = mediaData.mime_type;

          if (!mediaUrl) return new NextResponse('Media URL not found in Meta response', { status: 404 });

          await redisClient.setex(cacheKey, 3600, JSON.stringify({ url: mediaUrl, mimeType }));
        }

        const binaryResponse = await fetch(mediaUrl, {
          headers: { Authorization: `Bearer ${apiToken}` },
        });

        if (!binaryResponse.ok) {
          console.error(`Meta API Error (Download Binary) [${binaryResponse.status}]:`, await binaryResponse.text());
          return new NextResponse(`Failed to download media binary: ${binaryResponse.statusText}`, { status: binaryResponse.status });
        }

        const headers = new Headers();
        headers.set('Content-Type', mimeType || 'application/octet-stream');
        headers.set('Cache-Control', 'public, max-age=3600'); 

        return new NextResponse(binaryResponse.body, { status: 200, headers });
    }

  } catch (error: unknown) {
    const err = error as Error;
    console.error('Media Proxy Error:', err);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
