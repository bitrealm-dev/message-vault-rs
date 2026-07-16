"use client";

import type { CollapsedGroupConversation } from "@/lib/groupChatList";
import type { GroupDateFormat } from "@/lib/groupDateFormat";
import type { MouseEvent } from "react";
import { GroupConversationRowBody } from "./GroupConversationRow";

export function TrashGroupChatList({
  items,
  conversationId,
  selectedIds,
  query,
  groupDateFormat,
  onSelectColumnClick,
  onRowClick,
  onOpenCtxMenu,
  emptyLabel = "No trashed group messages",
}: {
  items: CollapsedGroupConversation[];
  conversationId: number | null;
  selectedIds: Set<number>;
  query: string;
  groupDateFormat: GroupDateFormat;
  onSelectColumnClick: (id: number, e: MouseEvent) => void;
  onRowClick: (g: CollapsedGroupConversation, e: MouseEvent) => void;
  onOpenCtxMenu?: (id: number, x: number, y: number) => void;
  emptyLabel?: string;
}) {
  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-sidebar">
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {items.length === 0 && (
          <p className="px-3 py-4 text-[12px] text-muted">
            {query.trim() ? "No matches" : emptyLabel}
          </p>
        )}
        {items.map((g, i) => {
          const active = g.conversationId === conversationId;
          const checked = selectedIds.has(g.conversationId);
          const selectionActive = selectedIds.size >= 1;
          const showInsetDivider = i < items.length - 1;
          return (
            <div
              key={g.conversationId}
              className={`group relative flex w-full items-start gap-1.5 py-2.5 pr-2 pl-0 select-none ${
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
                aria-label={`Select group ${g.title}`}
                onClick={(e) => onSelectColumnClick(g.conversationId, e)}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  if (e.shiftKey) e.preventDefault();
                }}
                className="flex w-10 shrink-0 cursor-pointer items-center justify-center self-stretch -my-2.5 outline-none"
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
                onClick={(e) => onRowClick(g, e)}
                onMouseDown={(e) => {
                  if (e.shiftKey) e.preventDefault();
                }}
                onContextMenu={
                  onOpenCtxMenu
                    ? (e) => {
                        e.preventDefault();
                        onOpenCtxMenu(g.conversationId, e.clientX, e.clientY);
                      }
                    : undefined
                }
                className="min-w-0 flex-1 text-left outline-none"
              >
                <GroupConversationRowBody
                  conversation={g}
                  groupDateFormat={groupDateFormat}
                  variant="trash"
                />
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
    </aside>
  );
}
