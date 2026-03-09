'use server';
import { getDb, getOrgById } from '@naija-agent/firebase';
import { uploadMedia } from '@naija-agent/storage';
import { revalidatePath } from 'next/cache';
import { verifySovereignSession } from '../../lib/auth';

export async function archiveMedia(orgId: string, chatId: string, messageId: string, mediaId: string, type: string) {
  try {
    await verifySovereignSession();

    // 1. Fetch Tenant Token (Multi-Tenancy Fix)
    let apiToken = process.env.WHATSAPP_API_TOKEN;
    const org = await getOrgById(orgId);
    if (org?.config?.whatsappToken) {
      console.log(`🛡️ [ARCHIVE] Using custom token for org: ${orgId}`);
      apiToken = org.config.whatsappToken;
    }

    if (!apiToken) throw new Error('WHATSAPP_API_TOKEN missing');

    const version = process.env.WHATSAPP_API_VERSION || 'v21.0';

    // 1. Fetch from Meta
    const urlResponse = await fetch(`https://graph.facebook.com/${version}/${mediaId}`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    const mediaData = await urlResponse.json();
    const mediaUrl = mediaData.url;
    const mimeType = mediaData.mime_type;

    const binaryResponse = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    const buffer = Buffer.from(await binaryResponse.arrayBuffer());

    // 3. Upload to Firebase Storage
    const fileName = `${type}_${messageId}_permanent`;
    const storageUrl = await uploadMedia(orgId, fileName, buffer, mimeType, { 
       archivedBy: 'sovereign', 
       chatId, 
       messageId 
    });

    // 3. Update message document in Firestore
    const db = getDb();
    const msgRef = db.collection('chats').doc(chatId).collection('messages').doc(messageId);
    await msgRef.set({
       metadata: {
         storageUrl,
         archivedAt: new Date().toISOString()
       }
    }, { merge: true });

    revalidatePath('/vault');
    return { success: true, url: storageUrl };
  } catch (error: any) {
    console.error('Archive Error:', error);
    return { success: false, error: error.message };
  }
}
