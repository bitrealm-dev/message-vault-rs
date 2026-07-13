"use client";

import type { ContactListItem } from "@/lib/types";
import type { MouseEvent, RefObject } from "react";
import { SortByMenu, type SortMode, type SortOrder } from "./SortByMenu";

export function BrowseContactList({
  sectionLabel,
  selectAllRef,
  allGroupSelected,
  visibleCount,
  sortedCount,
  query,
  onQueryChange,
  onToggleSelectAll,
  onNewContact,
  sort,
  sortOrder,
  onSortChange,
  grouped,
  contactId,
  selectedIds,
  onSelectColumnClick,
  onNamePhoneClick,
  onContextMenu,
}: {
  sectionLabel: string;
  selectAllRef: RefObject<HTMLInputElement | null>;
  allGroupSelected: boolean;
  visibleCount: number;
  sortedCount: number;
  query: string;
  onQueryChange: (q: string) => void;
  onToggleSelectAll: () => void;
  onNewContact: () => void;
  sort: SortMode;
  sortOrder: SortOrder;
  onSortChange: (next: { sort: SortMode; order: SortOrder }) => void;
  grouped: [string, ContactListItem[]][];
  contactId: number | null;
  selectedIds: Set<number>;
  onSelectColumnClick: (id: number, e: MouseEvent) => void;
  onNamePhoneClick: (id: number, e: MouseEvent | { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => void;
  onContextMenu: (id: number, x: number, y: number) => void;
}) {
  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-sidebar">

      <div className="flex h-[45px] shrink-0 items-center justify-between border-b border-border px-3">
        <label className="flex min-w-0 items-center gap-2">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={allGroupSelected}
            disabled={visibleCount === 0}
            aria-label={`Select all ${sectionLabel}`}
            onChange={onToggleSelectAll}
            className="checkbox-list"
          />
          <span className="truncate text-[13px] text-muted">
            {query.trim() ? `${sortedCount}/` : ""}
            {visibleCount}
          </span>
        </label>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            aria-label="New contact"
            title="New contact"
            onClick={onNewContact}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-elevated text-muted hover:text-text"
          >
            <NewContactIcon className="size-5" />
          </button>
          <SortByMenu sort={sort} order={sortOrder} onChange={onSortChange} />
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
          <p className="px-3 py-4 text-[12px] text-muted">No matches</p>
        )}
        {grouped.map(([letter, items]) => (
          <div key={letter || "all"}>
            {!query.trim() && letter && (
              <div className="sticky top-0 z-10 border-b border-border bg-sidebar px-3 py-1 text-[11px] font-semibold text-muted">
                {letter}
              </div>
            )}
            {items.map((c, i) => {
              const active = c.id === contactId;
              const checked = selectedIds.has(c.id);
              const showInsetDivider = i < items.length - 1;
              const selectionActive = selectedIds.size >= 1;
              return (
                <div
                  key={c.id}
                  role={selectionActive ? "button" : undefined}
                  tabIndex={selectionActive ? 0 : undefined}
                  onClick={
                    selectionActive
                      ? (e) => onNamePhoneClick(c.id, e)
                      : undefined
                  }
                  onKeyDown={
                    selectionActive
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onNamePhoneClick(c.id, {
                              shiftKey: e.shiftKey,
                              metaKey: e.metaKey,
                              ctrlKey: e.ctrlKey,
                            });
                          }
                        }
                      : undefined
                  }
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onContextMenu(c.id, e.clientX, e.clientY);
                  }}
                  onMouseDown={(e) => {
                    if (e.shiftKey) e.preventDefault();
                  }}
                  className={`relative flex w-full items-start gap-1.5 py-2 pr-3 pl-0 select-none ${
                    selectionActive ? "cursor-pointer" : ""
                  } ${
                    checked
                      ? "bg-accent/20 hover:bg-accent/25"
                      : active
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
                    aria-label={`Select ${c.displayName}`}
                    onClick={(e) => onSelectColumnClick(c.id, e)}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      if (e.shiftKey) e.preventDefault();
                    }}
                    className="flex w-10 shrink-0 cursor-pointer items-center justify-center self-stretch -my-2"
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
                    onClick={(e) => {
                      e.stopPropagation();
                      onNamePhoneClick(c.id, e);
                    }}
                    onMouseDown={(e) => {
                      if (e.shiftKey) e.preventDefault();
                    }}
                    className="flex min-w-0 flex-1 items-start justify-between gap-2 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-text">
                        {c.displayName}
                      </span>
                      {c.preferredHandle && (
                        <span className="block truncate text-[11px] text-muted">
                          {c.preferredHandle}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-muted">
                      {c.messageCount.toLocaleString()}
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

function NewContactIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="8.5" cy="7.5" r="3" />
      <path d="M2.5 19c.55-2.85 2.6-4.5 6-4.5 1.2 0 2.25.2 3.15.55" />
      <path d="M17.5 10.5v9M13 15h9" strokeWidth="2.25" />
    </svg>
  );
}
