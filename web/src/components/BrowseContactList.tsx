"use client";

import type { ContactListItem } from "@/lib/types";
import type { MouseEvent, ReactNode, RefObject } from "react";
import { ListHistoryMenu, type ListHistoryMenuItem } from "./history";
import { IconHoverTarget } from "./IconHoverLabel";
import {
  ChatBubbleIcon,
  GroupMessagesOutlineIcon,
  PencilIcon,
  XIcon,
} from "./icons";
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
  vaultReadOnly = false,
  groupsMenu,
  onEdit,
  editDisabled = false,
  onTrashContact,
  deleteDisabled = false,
  sort,
  sortOrder,
  onSortChange,
  grouped,
  contactId,
  contextMenuId = null,
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
  vaultReadOnly?: boolean;
  /** Icon-only GroupsMenu element rendered first in the toolbar cluster. */
  groupsMenu?: ReactNode;
  onEdit?: () => void;
  editDisabled?: boolean;
  onTrashContact?: () => void;
  deleteDisabled?: boolean;
  sort: SortMode;
  sortOrder: SortOrder;
  onSortChange: (next: { sort: SortMode; order: SortOrder }) => void;
  grouped: [string, ContactListItem[]][];
  contactId: number | null;
  /** Right-clicked contact while its context menu is open. */
  contextMenuId?: number | null;
  selectedIds: Set<number>;
  onSelectColumnClick: (id: number, e: MouseEvent) => void;
  onNamePhoneClick: (id: number, e: MouseEvent | { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => void;
  onContextMenu: (id: number, x: number, y: number) => void;
}) {
  const menuItems: ListHistoryMenuItem[] = [
    {
      key: "new-contact",
      label: "New contact",
      icon: <NewContactIcon className="size-5 shrink-0 opacity-80" />,
      onClick: onNewContact,
    },
    ...(onTrashContact
      ? [
          {
            key: "delete",
            label: "Delete contact",
            icon: <XIcon className="size-5 shrink-0 opacity-80" />,
            disabled: deleteDisabled,
            danger: true,
            onClick: onTrashContact,
          } satisfies ListHistoryMenuItem,
        ]
      : []),
  ];

  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-sidebar">

      <div className="flex h-[45px] shrink-0 items-center border-b border-border px-3">
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search by name or phone…"
          className="w-full rounded-md border border-border bg-elevated px-2.5 py-1.5 text-[13px] text-text outline-none placeholder:text-muted focus:border-accent"
        />
      </div>
      <div className="flex h-[45px] shrink-0 items-center justify-between overflow-visible border-b border-border px-3">
        <label className="flex min-w-0 items-center gap-2">
          <IconHoverTarget label="Select all" placement="bottom">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allGroupSelected}
              disabled={visibleCount === 0}
              aria-label={`Select all ${sectionLabel}`}
              onChange={onToggleSelectAll}
              className="checkbox-list"
            />
          </IconHoverTarget>
          <span className="truncate text-[13px] text-muted tabular-nums">
            {selectedIds.size > 0 ? selectedIds.size : ""}
          </span>
        </label>
        <div className="flex shrink-0 items-center gap-1.5 overflow-visible">
          {!vaultReadOnly && groupsMenu}
          {!vaultReadOnly && onEdit && (
            <IconHoverTarget label="Edit contact" placement="bottom">
              <button
                type="button"
                aria-label="Edit contact"
                disabled={editDisabled}
                onClick={onEdit}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-elevated text-muted hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
              >
                <PencilIcon className="size-4" />
              </button>
            </IconHoverTarget>
          )}
          <SortByMenu sort={sort} order={sortOrder} onChange={onSortChange} />
          <ListHistoryMenu items={vaultReadOnly ? [] : menuItems} />
        </div>
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
              const menuTarget = contextMenuId != null && c.id === contextMenuId;
              const active = c.id === contactId || menuTarget;
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
                      ? "bg-accent/40 hover:bg-accent/50"
                      : active
                        ? "bg-accent/20 hover:bg-accent/25"
                        : "hover:bg-white/20"
                  }`}
                >
                  {active && !checked && (
                    <span
                      aria-hidden
                      className="absolute top-1 bottom-1 left-0 w-1 rounded-full bg-accent/80"
                    />
                  )}
                  {checked && (
                    <span
                      aria-hidden
                      className="absolute top-1 bottom-1 left-0 w-1 rounded-full bg-accent"
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
                      {c.preferredHandle &&
                        c.preferredHandle !== c.displayName && (
                          <span className="block truncate text-[12px] text-muted">
                            {c.preferredHandle}
                          </span>
                        )}
                      {c.preferredHandle &&
                        c.preferredHandle === c.displayName && (
                          <span
                            className="block h-[1.5rem] text-[12px]"
                            aria-hidden
                          />
                        )}
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-0.5 pt-0.5 text-[12px] tabular-nums text-muted">
                      {(c.messageCount > 0 || c.groupMessageCount > 0) && (
                        <span className="inline-flex min-h-4 items-center gap-0.5">
                          {c.messageCount > 0 ? (
                            <>
                              {c.messageCount.toLocaleString()}
                              <ChatBubbleIcon className="size-4 opacity-80" />
                            </>
                          ) : null}
                        </span>
                      )}
                      {c.groupMessageCount > 0 && (
                        <span className="inline-flex items-center gap-0.5">
                          {c.groupMessageCount.toLocaleString()}
                          <GroupMessagesOutlineIcon className="size-4 opacity-80" />
                        </span>
                      )}
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

export function NewContactIcon({ className }: { className?: string }) {
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
      <circle cx="7.25" cy="8" r="3" />
      <path d="M2.25 19.25c.65-3 2.85-4.75 5-4.75s4.35 1.75 5 4.75" />
      <path d="M19 9v6M16 12h6" strokeWidth="2" />
    </svg>
  );
}
