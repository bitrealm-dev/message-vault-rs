"use client";

/** Contact trash confirmation for BrowseShell (preserves browse z-index). */
export function BrowseTrashConfirmDialog({
  title,
  saving = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  saving?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4"
      role="presentation"
      onClick={() => {
        if (!saving) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mv-trash-confirm-title"
        className="w-full max-w-md rounded-xl border border-border bg-[#2c2c2e] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="mv-trash-confirm-title"
          className="text-[16px] font-semibold text-text"
        >
          {title}
        </h2>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={onCancel}
            className="rounded-md bg-elevated px-3 py-1.5 text-[13px] text-text transition-colors hover:bg-white/14 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onConfirm}
            className="rounded-md bg-red-500/25 px-3 py-1.5 text-[13px] font-medium text-red-100 transition-colors hover:bg-red-500/35 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
