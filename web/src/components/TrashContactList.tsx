"use client";

import type { UnassignedHandle } from "@/lib/types";
import type { MouseEvent, ReactNode, RefObject } from "react";
import type { SortOrder, TrashSortBy } from "./SortByMenu";
import { TrashListChrome } from "./TrashListChrome";

export function TrashContactList({
  tabBar,
  hideChrome = false,
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
  onDeleteForeverHeader,
  onOpenCtxMenu,
}: {
  tabBar?: ReactNode;
  /** Parent owns toolbar + search (TrashShell shared chrome). */
  hideChrome?: boolean;
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
  onDeleteForeverHeader: () => void;
  onOpenCtxMenu: (
    x: number,
    y: number,
    handle: string,
    menuH: number,
  ) => void;
}) {
  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-sidebar">
      {!hideChrome && (
        <TrashListChrome
          tabBar={tabBar}
          selectAllRef={selectAllRef}
          allSelected={allSelected}
          selectedCount={selectedHandles.size}
          itemCount={sortedCount}
          query={query}
          onQueryChange={onQueryChange}
          saving={saving}
          canDeleteForever={canDeleteForever}
          onToggleSelectAll={onToggleSelectAll}
          onDeleteForever={onDeleteForeverHeader}
          sort={{ sortBy, order: sortOrder, onChange: onSortChange }}
        />
      )}
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
                    onContextMenu={(e) => {
                      e.preventDefault();
                      onOpenCtxMenu(e.clientX, e.clientY, h.handle, 88);
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
