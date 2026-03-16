'use client';

import { useState } from 'react';
import { archiveMedia } from './actions';

interface ArchiveButtonProps {
  orgId: string;
  chatId: string;
  messageId: string;
  mediaId: string;
  type: string;
  isArchived: boolean;
}

export default function ArchiveButton({ orgId, chatId, messageId, mediaId, type, isArchived }: ArchiveButtonProps) {
  const [loading, setLoading] = useState(false);
  const [archived, setArchived] = useState(isArchived);

  const handleArchive = async () => {
    if (loading || archived) return;
    setLoading(true);
    const result = await archiveMedia(orgId, chatId, messageId, mediaId, type);
    if (result.success) {
      setArchived(true);
    } else {
      alert(`Archive failed: ${result.error}`);
    }
    setLoading(false);
  };

  return (
    <button
      onClick={handleArchive}
      disabled={loading || archived}
      className={`mt-2 w-full px-3 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all ${
        archived 
          ? 'bg-zinc-100 text-zinc-400 border-zinc-200 cursor-not-allowed'
          : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-900 hover:text-zinc-900 shadow-sm'
      }`}
    >
      {loading ? 'Archiving...' : archived ? '💾 Permanently Saved' : '💾 Save Forever'}
    </button>
  );
}
