import { getNetworkMedia } from '@naija-agent/firebase';
import Link from 'next/link';
import ArchiveButton from './ArchiveButton';

export default async function MediaVault() {
  const media = await getNetworkMedia(24);

  return (
    <main className="min-h-screen p-8 bg-zinc-50 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-3xl font-bold text-zinc-900">Media Vault</h1>
            <p className="text-zinc-500">Archived receipts and voice notes from the network</p>
          </div>
          <Link href="/" className="px-4 py-2 bg-white rounded-lg border border-zinc-200 shadow-sm text-sm font-semibold text-zinc-600 hover:text-zinc-900 transition-colors">
            ← Back to Dashboard
          </Link>
        </header>

        {media.length === 0 ? (
          <div className="text-center py-24 bg-white rounded-2xl border-2 border-dashed border-zinc-200">
            <p className="text-zinc-500 font-medium">No media has been collected yet.</p>
          </div>
        ) : (
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {media.map((item: any) => {
              // Free Tier Pivot: Use Proxy URL if mediaId exists, otherwise fallback to legacy storageUrl
              const currentOrgId = item.orgId || item.chatId?.split('_')[0] || 'default';
              const mediaSrc = item.metadata?.mediaId 
                ? `/api/media/${item.metadata.mediaId}?orgId=${currentOrgId}` 
                : (item.metadata?.storageUrl || item.content);

              return (
                <div key={item.id} className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden group hover:ring-2 hover:ring-blue-500/20 transition-all">
                  {/* Media Content */}
                  <div className="aspect-[4/5] bg-zinc-100 flex items-center justify-center relative">
                    {item.type === 'image' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img 
                        src={mediaSrc} 
                        alt="Receipt" 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="p-4 w-full">
                        <div className="text-4xl mb-4 text-center">🎙️</div>
                        <audio controls className="w-full h-8">
                          <source src={mediaSrc} type="audio/ogg" />
                        </audio>
                      </div>
                    )}
                    
                    {/* Confidence Overlay (Placeholder for Phase 4l) */}
                    {item.type === 'image' && item.metadata?.verificationStatus === 'verified' && (
                      <span className="absolute top-2 right-2 px-2 py-1 bg-green-500 text-white text-[10px] font-bold rounded shadow-sm">
                        VERIFIED
                      </span>
                    )}
                  </div>

                  {/* Info Footer */}
                  <div className="p-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{item.type}</span>
                      <span className="text-[10px] text-zinc-400 font-mono">
                        {item.timestamp ? new Date(item.timestamp.toDate()).toLocaleDateString() : '--'}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-zinc-900 truncate mb-1">
                      Chat: {item.chatId?.substring(0, 12)}...
                    </div>
                    <p className="text-xs text-zinc-500 line-clamp-2">
                      {item.metadata?.caption || 'No caption provided.'}
                    </p>

                    {/* Operational Risk Mitigation: Manual Archive */}
                    {item.metadata?.mediaId && (
                      <ArchiveButton 
                        orgId={currentOrgId} 
                        chatId={item.chatId} 
                        messageId={item.id} 
                        mediaId={item.metadata.mediaId} 
                        type={item.type} 
                        isArchived={!!item.metadata.storageUrl}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
