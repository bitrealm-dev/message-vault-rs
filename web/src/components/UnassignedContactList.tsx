"use client";

import type { UnassignedHandle } from "@/lib/types";
import type { MouseEvent, RefObject } from "react";
import { EllipsisIcon } from "./icons";
import {
  UnassignedSortMenu,
  type SortOrder,
  type UnassignedSortBy,
} from "./SortByMenu";

export function UnassignedContactList({
  mode,
  selectAllRef,
  allHandlesSelected,
  sortedHandles,
  handle,
  selectedHandles,
  multiSelected,
  saving,
  sortBy,
  sortOrder,
  onSortChange,
  onToggleSelectAll,
  onSelectColumnClick,
  onRowClick,
  onOpenCtxMenu,
  onOpenTrashMenu,
}: {
  mode: "unassigned" | "trash";
  selectAllRef: RefObject<HTMLInputElement | null>;
  allHandlesSelected: boolean;
  handleCount?: number;
  sortedHandles: UnassignedHandle[];
  handle: string | null;
  selectedHandles: Set<string>;
  multiSelected: boolean;
  saving: boolean;
  sortBy: UnassignedSortBy;
  sortOrder: SortOrder;
  onSortChange: (next: { sortBy: UnassignedSortBy; order: SortOrder }) => void;
  onToggleSelectAll: () => void;
  onSelectColumnClick: (h: string, e: MouseEvent) => void;
  onRowClick: (h: string, e: MouseEvent) => void;
  onOpenCtxMenu: (
    x: number,
    y: number,
    handle: string,
    menuH: number,
  ) => void;
  onOpenTrashMenu: (x: number, y: number, handle: string) => void;
}) {
  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-sidebar">
      <div className="flex h-[45px] shrink-0 items-center justify-between border-b border-border px-3">
        <label className="flex min-w-0 items-center gap-2">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={allHandlesSelected}
            disabled={sortedHandles.length === 0}
            aria-label={
              mode === "trash" ? "Select all trash" : "Select all unassigned"
            }
            onChange={onToggleSelectAll}
            className="checkbox-list"
          />
          <span className="truncate text-[13px] text-muted tabular-nums">
            {selectedHandles.size > 0 ? selectedHandles.size : ""}
          </span>
        </label>
        <UnassignedSortMenu
          sortBy={sortBy}
          order={sortOrder}
          onChange={onSortChange}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {sortedHandles.length === 0 && (
          <p className="px-3 py-4 text-[12px] text-muted">
            {mode === "trash" ? "Trash is empty" : "No unassigned conversations"}
          </p>
        )}
        {sortedHandles.map((h) => {
          const selectionActive = selectedHandles.size >= 1;
          const checked = selectedHandles.has(h.handle);
          const focused = h.handle === handle && !selectionActive;
          const rowActive = selectionActive ? checked : focused;
          return (
            <div
              key={h.handle}
              className={`group relative flex items-start gap-1.5 border-b border-border/60 py-2 pr-2 pl-0 select-none ${
                checked
                  ? "bg-accent/20 hover:bg-accent/25"
                  : focused
                    ? "bg-elevated hover:bg-white/18"
                    : "hover:bg-white/20"
              }`}
            >
              {rowActive && (
                <span
                  aria-hidden
                  className={`absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-full ${
                    checked ? "bg-accent" : "bg-[#c8c8c8]"
                  }`}
                />
              )}
              <button
                type="button"
                aria-pressed={checked}
                aria-label={`Select ${h.displayName}`}
                onClick={(e) => onSelectColumnClick(h.handle, e)}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  if (e.shiftKey) e.preventDefault();
                }}
                className="flex w-10 shrink-0 cursor-pointer items-center justify-center self-stretch -my-2 outline-none"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  readOnly
                  tabIndex={-1}
                  aria-hidden
                  className="checkbox-list pointer-events-none"
                />
              </button>
              <button
                type="button"
                onClick={(e) => onRowClick(h.handle, e)}
                onMouseDown={(e) => {
                  if (e.shiftKey) e.preventDefault();
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (mode === "trash") {
                    onOpenTrashMenu(e.clientX, e.clientY, h.handle);
                  } else {
                    onOpenCtxMenu(
                      e.clientX,
                      e.clientY,
                      h.handle,
                      multiSelected && selectedHandles.has(h.handle) ? 88 : 200,
                    );
                  }
                }}
                className="flex min-w-0 flex-1 items-start justify-between gap-2 text-left outline-none"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] text-text">
                    {h.displayName}
                    {h.nameHint ? (
                      <span className="font-normal text-muted">
                        {" "}
                        (Unverified)
                      </span>
                    ) : null}
                  </span>
                  {h.nameHint && (
                    <span className="block truncate text-[11px] text-muted">
                      {h.handle}
                    </span>
                  )}
                  {h.dateStart && (
                    <span className="block text-[11px] text-muted">
                      {h.dateStart === h.dateEnd || !h.dateEnd
                        ? h.dateStart
                        : `${h.dateStart} — ${h.dateEnd}`}
                    </span>
                  )}
                </span>
                <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-muted">
                  {h.messageCount.toLocaleString()}
                </span>
              </button>
              {mode === "trash" && (
                <button
                  type="button"
                  aria-label={`Trash options for ${h.displayName}`}
                  disabled={saving}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const r = e.currentTarget.getBoundingClientRect();
                    onOpenTrashMenu(r.right - 8, r.bottom + 2, h.handle);
                  }}
                  className={`mr-0.5 shrink-0 self-center rounded p-0.5 text-muted outline-none hover:bg-white/10 hover:text-text disabled:opacity-40 ${
                    rowActive
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100"
                  }`}
                >
                  <EllipsisIcon className="size-5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
