"use client";

import { useHistory } from "./HistoryProvider";

/** Fixed bottom-center toast for undo/redo confirmations (10s). */
export function HistoryToast() {
  const { toast } = useHistory();
  if (!toast) return null;
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex justify-center px-4"
    >
      <div className="max-w-md truncate rounded-lg border border-border bg-[#2c2c2e] px-3.5 py-2 text-[12px] text-text shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
        {toast.text}
      </div>
    </div>
  );
}
