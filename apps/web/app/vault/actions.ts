'use server';

import { getDb } from '@naija-agent/firebase';
import { uploadMedia } from '@naija-agent/storage';
import { revalidatePath } from 'next/cache';

export async function archiveMedia(orgId: string, chatId: string, messageId: string, mediaId: string, type: string) {
  try {
    const apiToken = process.env.WHATSAPP_API_TOKEN;
    if (!apiToken) throw new Error('WHATSAPP_API_TOKEN missing');

    // 1. Fetch from Meta
    const urlResponse = await fetch(`https://graph.facebook.com/v18.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    const mediaData = await urlResponse.json();
    const mediaUrl = mediaData.url;
    const mimeType = mediaData.mime_type;

    const binaryResponse = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    const buffer = Buffer.from(await binaryResponse.arrayBuffer());

    // 2. Upload to Firebase Storage
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
