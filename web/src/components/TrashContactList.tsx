"use client";

import type { UnassignedHandle } from "@/lib/types";
import type { MouseEvent, ReactNode, RefObject } from "react";
import { RestoreIcon, TrashIcon } from "./icons";
import {
  TrashSortMenu,
  type SortOrder,
  type TrashSortBy,
} from "./SortByMenu";

export function TrashContactList({
  tabBar,
  selectAllRef,
  allSelected,
  query,
  onQueryChange,
  grouped,
  sortedCount,
  handle,
  selectedHandles,
  saving,
  canDeleteForever,
  sortBy,
  sortOrder,
  onSortChange,
  onToggleSelectAll,
  onSelectColumnClick,
  onRowClick,
  onRestore,
  onDeleteForever,
  onDeleteForeverHeader,
}: {
  tabBar?: ReactNode;
  selectAllRef: RefObject<HTMLInputElement | null>;
  allSelected: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  grouped: [string, UnassignedHandle[]][];
  sortedCount: number;
  handle: string | null;
  selectedHandles: Set<string>;
  saving: boolean;
  canDeleteForever: boolean;
  sortBy: TrashSortBy;
  sortOrder: SortOrder;
  onSortChange: (next: { sortBy: TrashSortBy; order: SortOrder }) => void;
  onToggleSelectAll: () => void;
  onSelectColumnClick: (h: string, e: MouseEvent) => void;
  onRowClick: (h: string, e: MouseEvent) => void;
  onRestore: (h: string) => void;
  onDeleteForever: (h: string) => void;
  onDeleteForeverHeader: () => void;
}) {
  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-sidebar">
      <div className="flex h-[45px] shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <label className="flex min-w-0 items-center gap-2">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={allSelected}
            disabled={sortedCount === 0}
            aria-label="Select all trash"
            onChange={onToggleSelectAll}
            className="checkbox-list"
          />
          <span className="truncate text-[13px] text-muted tabular-nums">
            {selectedHandles.size > 0 ? selectedHandles.size : ""}
          </span>
        </label>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            disabled={saving || !canDeleteForever}
            onClick={onDeleteForeverHeader}
            className="inline-flex h-7 items-center rounded-md bg-elevated px-2.5 text-[12px] leading-none text-muted transition-colors hover:bg-red-500/15 hover:text-red-300 disabled:pointer-events-none disabled:opacity-40"
          >
            Delete forever
          </button>
          <TrashSortMenu
            sortBy={sortBy}
            order={sortOrder}
            onChange={onSortChange}
          />
          <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />
          {tabBar}
        </div>
      </div>
      <div className="flex h-[45px] shrink-0 items-center border-b border-border px-3">
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search by name or phone…"
          className="w-full rounded-md border border-border bg-elevated px-2.5 py-1.5 text-[13px] text-text outline-none placeholder:text-muted focus:border-accent"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {sortedCount === 0 && (
          <p className="px-3 py-4 text-[12px] text-muted">
            {query.trim() ? "No matches" : "Trash is empty"}
          </p>
        )}
        {grouped.map(([letter, items]) => (
          <div key={letter || "all"}>
            {!query.trim() && letter && (
              <div className="sticky top-0 z-10 border-b border-border bg-sidebar px-3 py-1 text-[11px] font-semibold text-muted">
                {letter}
              </div>
            )}
            {items.map((h, i) => {
              const active = h.handle === handle;
              const checked = selectedHandles.has(h.handle);
              const showInsetDivider = i < items.length - 1;
              const selectionActive = selectedHandles.size >= 1;
              const title =
                h.trashKind === "unassigned"
                  ? h.unverified && h.nameHint
                    ? h.nameHint
                    : h.handle
                  : h.displayName;
              return (
                <div
                  key={
                    h.trashKind === "contact" && h.contactId != null
                      ? `c:${h.contactId}`
                      : h.handle
                  }
                  className={`group relative flex w-full items-start gap-1.5 py-2 pr-2 pl-0 select-none ${
                    checked
                      ? "bg-accent/20 hover:bg-accent/25"
                      : active && !selectionActive
                        ? "bg-elevated hover:bg-white/18"
                        : "hover:bg-white/20"
                  }`}
                >
                  {active && !selectionActive && (
                    <span
                      aria-hidden
                      className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-full bg-[#c8c8c8]"
                    />
                  )}
                  {checked && (
                    <span
                      aria-hidden
                      className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-full bg-accent"
                    />
                  )}
                  <button
                    type="button"
                    aria-pressed={checked}
                    aria-label={`Select ${title}`}
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
                    className="flex min-w-0 flex-1 items-start justify-between gap-2 text-left outline-none"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-text">
                        {title}
                        {h.unverified ? (
                          <span className="font-normal text-muted">
                            {" "}
                            (Unverified)
                          </span>
                        ) : null}
                      </span>
                      {h.handle !== title && (
                        <span className="block truncate text-[11px] text-muted">
                          {h.handle}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-muted">
                      {h.messageCount.toLocaleString()}
                    </span>
                  </button>
                  <div className="mr-0.5 flex shrink-0 items-center gap-0.5 self-center">
                    <button
                      type="button"
                      aria-label={`Undelete ${title}`}
                      title="Undelete"
                      disabled={saving}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onRestore(h.handle);
                      }}
                      className={`rounded p-0.5 text-muted outline-none hover:bg-white/10 hover:text-text disabled:opacity-40 ${
                        active || checked
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      <RestoreIcon className="size-5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${title} forever`}
                      title="Delete forever"
                      disabled={saving}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onDeleteForever(h.handle);
                      }}
                      className={`rounded p-0.5 text-muted outline-none hover:bg-red-500/15 hover:text-red-300 disabled:opacity-40 ${
                        active || checked
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      <TrashIcon className="size-5" />
                    </button>
                  </div>
                  {showInsetDivider && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute right-3 bottom-0 left-3 h-px bg-border/60"
                    />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}
