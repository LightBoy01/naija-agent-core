'use client';

import { useTransition } from 'react';
import { updateActivityStatus } from './actions';

interface StatusButtonProps {
  orgId: string;
  activityId: string;
  type: string;
  currentStatus: string;
  targetStatus: string;
  label: string;
  color: string;
}

export default function StatusButton({ 
  orgId, activityId, type, currentStatus, targetStatus, label, color 
}: StatusButtonProps) {
  const [isPending, startTransition] = useTransition();

  const handleUpdate = () => {
    startTransition(async () => {
      const result = await updateActivityStatus(orgId, activityId, type, targetStatus);
      if (!result.success) {
        alert('Update failed: ' + result.error);
      }
    });
  };

  // Only show the button if it's the logical next step
  const showButton = () => {
    if (targetStatus === 'confirmed' && (currentStatus === 'pending' || currentStatus === 'pending_payment')) return true;
    if (targetStatus === 'ready_for_pickup' && currentStatus === 'confirmed') return true;
    if (targetStatus === 'in_transit' && currentStatus === 'ready_for_pickup') return true;
    if (targetStatus === 'delivered' && currentStatus === 'in_transit') return true;
    return false;
  };

  if (!showButton()) return null;

  return (
    <button
      onClick={handleUpdate}
      disabled={isPending}
      className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${color} disabled:opacity-50`}
    >
      {isPending ? 'Working...' : label}
    </button>
  );
}
