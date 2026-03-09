import { getChatHistory, getDb } from '@naija-agent/firebase';
import Link from 'next/link';
import { notFound } from 'next/navigation';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ChatDetailPage({ params }: PageProps) {
  const { id: chatId } = await params;
  
  // 1. Fetch Chat Info
  const db = getDb();
  const chatDoc = await db.collection('chats').doc(chatId).get();
  
  if (!chatDoc.exists) {
    notFound();
  }

  const chatInfo = chatDoc.data();
  
  // 2. Fetch Message History
  const messages = await getChatHistory(chatId, 100);

  return (
    <main className="min-h-screen bg-zinc-50 font-sans">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-zinc-200 px-8 py-4 shadow-sm">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/chats" className="p-2 hover:bg-zinc-100 rounded-full transition-colors text-zinc-500">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </Link>
            <div>
              <h1 className="text-lg font-bold text-zinc-900">{chatInfo?.userName || 'Customer'}</h1>
              <p className="text-xs text-zinc-500 font-mono">{chatInfo?.whatsappUserId}</p>
            </div>
          </div>
          <div className="flex gap-2">
             <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${chatInfo?.isOptedOut ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                {chatInfo?.isOptedOut ? 'Opted Out' : 'Active'}
             </span>
          </div>
        </div>
      </header>

      {/* Chat Area */}
      <div className="max-w-4xl mx-auto p-8 space-y-6">
        {messages.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-zinc-400">No messages found in this conversation.</p>
          </div>
        ) : (
          messages.map((msg: any, idx: number) => (
            <div 
              key={idx} 
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div className={`max-w-[80%] rounded-2xl p-4 shadow-sm ${
                msg.role === 'user' 
                  ? 'bg-zinc-900 text-white rounded-tr-none' 
                  : 'bg-white text-zinc-900 border border-zinc-200 rounded-tl-none'
              }`}>
                {/* Media Content */}
                {msg.type === 'image' && (
                  <div className="mb-2 rounded-lg overflow-hidden border border-zinc-700/10">
                    <img 
                      src={msg.metadata?.mediaId ? `/api/media/${msg.metadata.mediaId}?orgId=${chatInfo?.organizationId || 'default'}` : (msg.metadata?.storageUrl || msg.content)} 
                      alt="WhatsApp Image" 
                      className="w-full h-auto max-h-[400px] object-contain"
                    />
                  </div>
                )}
                
                {msg.type === 'audio' && (
                  <div className="mb-2 p-2 bg-zinc-100 rounded-lg">
                    <audio controls className="w-full h-8">
                      <source src={msg.metadata?.mediaId ? `/api/media/${msg.metadata.mediaId}?orgId=${chatInfo?.organizationId || 'default'}` : (msg.metadata?.storageUrl || msg.content)} type="audio/ogg" />
                    </audio>
                  </div>
                )}

                {/* Text Content */}
                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                  {msg.content === '[AUDIO MESSAGE]' || msg.content.startsWith('[IMAGE]') ? null : msg.content}
                  {msg.metadata?.caption && <span className="block mt-2 font-medium italic opacity-80">"{msg.metadata.caption}"</span>}
                </p>

                {/* Timestamp */}
                <div className={`text-[10px] mt-2 font-medium opacity-50 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                  {msg.timestamp ? new Date(msg.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
