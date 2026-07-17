"use client";

import {
  formatTrashedAt,
  TRASH_CATEGORY_LABEL,
  type TrashCategory,
  type TrashListItem,
} from "@/lib/trashList";
import type { MouseEvent, RefObject } from "react";
import { CountBadge } from "./CountBadge";
import { TrashListChrome } from "./TrashListChrome";

export function TrashUnifiedList({
  selectAllRef,
  allSelected,
  query,
  onQueryChange,
  sections,
  itemCount,
  focusedKey,
  selectedKeys,
  saving,
  canDeleteForever,
  onToggleSelectAll,
  onSelectColumnClick,
  onRowClick,
  onDeleteForeverHeader,
  onOpenCtxMenu,
}: {
  selectAllRef: RefObject<HTMLInputElement | null>;
  allSelected: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  sections: Array<[TrashCategory, TrashListItem[]]>;
  itemCount: number;
  focusedKey: string | null;
  selectedKeys: Set<string>;
  saving: boolean;
  canDeleteForever: boolean;
  onToggleSelectAll: () => void;
  onSelectColumnClick: (key: string, e: MouseEvent) => void;
  onRowClick: (key: string, e: MouseEvent) => void;
  onDeleteForeverHeader: () => void;
  onOpenCtxMenu: (x: number, y: number, key: string, menuH: number) => void;
}) {
  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-sidebar">
      <TrashListChrome
        selectAllRef={selectAllRef}
        allSelected={allSelected}
        selectedCount={selectedKeys.size}
        itemCount={itemCount}
        query={query}
        onQueryChange={onQueryChange}
        saving={saving}
        canDeleteForever={canDeleteForever}
        onToggleSelectAll={onToggleSelectAll}
        onDeleteForever={onDeleteForeverHeader}
        selectAllLabel="Select all trash"
      />
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {itemCount === 0 && (
          <p className="px-3 py-4 text-[12px] text-muted">
            {query.trim() ? "No matches" : "Trash is empty"}
          </p>
        )}
        {sections.map(([category, items]) => (
          <div key={category}>
            <div className="sticky top-0 z-10 border-b border-border bg-sidebar px-3 py-1 text-[11px] font-semibold text-muted">
              {TRASH_CATEGORY_LABEL[category]}
            </div>
            {items.map((item) => {
              const active = item.key === focusedKey;
              const checked = selectedKeys.has(item.key);
              return (
                <div
                  key={item.key}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onOpenCtxMenu(e.clientX, e.clientY, item.key, 96);
                  }}
                  className={`flex items-stretch border-b border-border/60 ${
                    active ? "bg-accent/20" : "hover:bg-white/5"
                  }`}
                >
                  <div
                    className="flex shrink-0 items-center px-2"
                    onClick={(e) => onSelectColumnClick(item.key, e)}
                    onDoubleClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      aria-label={`Select ${item.displayName}`}
                      onChange={() => {}}
                      className="checkbox-list"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={(e) => onRowClick(item.key, e)}
                    className="flex min-w-0 flex-1 items-start gap-2 px-1 py-2 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-text">
                        {item.displayName}
                        {item.category === "messages" &&
                        item.trashKind === "unassigned" &&
                        item.unverified ? (
                          <span className="font-normal text-muted">
                            {" "}
                            (Unverified)
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-muted tabular-nums">
                        {item.trashedAt
                          ? formatTrashedAt(item.trashedAt)
                          : "—"}
                      </span>
                    </span>
                    {item.messageCount > 0 && (
                      <span className="shrink-0 pt-0.5">
                        <CountBadge
                          count={item.messageCount}
                          title="Messages"
                        />
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </aside>
  );
}
