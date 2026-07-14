"use client";

import { useRef, useState } from "react";
import { IconHoverTarget } from "../IconHoverLabel";
import { EllipsisIcon, RedoIcon, UndoIcon } from "../icons";
import { useDismissible } from "../useDismissible";
import { useHistory } from "./HistoryProvider";

/** Fastmail-style ⋯ menu with Undo / Redo for list headers. */
export function ListHistoryMenu() {
  const { canUndo, canRedo, busy, undo, redo, undoLabel, redoLabel } =
    useHistory();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useDismissible({
    open,
    onDismiss: () => setOpen(false),
    refs: [rootRef],
  });

  return (
    <div className="relative" ref={rootRef}>
      <IconHoverTarget label="Actions" placement="bottom" hidden={open}>
        <button
          type="button"
          aria-label="Actions"
          aria-expanded={open}
          disabled={busy}
          onClick={() => setOpen((v) => !v)}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-elevated text-muted hover:text-text disabled:opacity-40"
        >
          <EllipsisIcon className="size-5" />
        </button>
      </IconHoverTarget>
      {open && (
        <div className="absolute top-full right-0 z-50 mt-1 min-w-[10.5rem] rounded-xl border border-border bg-[#2c2c2e] py-1 shadow-xl">
          <button
            type="button"
            disabled={!canUndo}
            title={undoLabel ?? undefined}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-text hover:bg-white/20 disabled:opacity-40"
            onClick={() => {
              setOpen(false);
              void undo();
            }}
          >
            <UndoIcon className="size-4 shrink-0 opacity-80" />
            Undo
          </button>
          <button
            type="button"
            disabled={!canRedo}
            title={redoLabel ?? undefined}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-text hover:bg-white/20 disabled:opacity-40"
            onClick={() => {
              setOpen(false);
              void redo();
            }}
          >
            <RedoIcon className="size-4 shrink-0 opacity-80" />
            Redo
          </button>
        </div>
      )}
    </div>
  );
}
