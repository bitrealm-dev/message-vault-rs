"use client";

import type { GroupYearRow } from "@/lib/types";
import {
  formatGroupDateTable,
  type GroupDateFormat,
} from "@/lib/groupDateFormat";
import type { RefObject, MouseEvent } from "react";

function dateColClass(style: GroupDateFormat): string {
  switch (style) {
    case "mon-d":
      return "inline-block w-[13ch] whitespace-nowrap";
    case "d-mon":
      return "inline-block w-[12ch] whitespace-nowrap";
    case "md":
    default:
      return "inline-block w-[11ch] whitespace-nowrap";
  }
}

/** Width of year range block: start + dash gap + end (matches full range rows). */
function rangeBlockClass(style: GroupDateFormat): string {
  switch (style) {
    case "mon-d":
      return "inline-flex w-[calc(13ch+0.5rem+13ch)] flex-nowrap items-center justify-center whitespace-nowrap";
    case "d-mon":
      return "inline-flex w-[calc(12ch+0.5rem+12ch)] flex-nowrap items-center justify-center whitespace-nowrap";
    case "md":
    default:
      return "inline-flex w-[calc(11ch+0.5rem+11ch)] flex-nowrap items-center justify-center whitespace-nowrap";
  }
}

function GroupDateCell({
  g,
  style,
}: {
  g: {
    dateStart: string;
    dateEnd: string;
    conversationDateStart: string;
    spansMultipleYears: boolean;
  };
  style: GroupDateFormat;
}) {
  const origin = g.spansMultipleYears
    ? formatGroupDateTable(g.conversationDateStart, style)
    : null;
  const start = formatGroupDateTable(g.dateStart, style);
  const end = formatGroupDateTable(g.dateEnd, style);
  const same = g.dateEnd === g.dateStart;
  const dateCol = dateColClass(style);

  return (
    <span className="inline-flex shrink-0 items-center whitespace-nowrap font-mono text-[11px] leading-none text-muted">
      <span
        className={`${dateCol} text-left`}
        title={origin ? "Conversation origin" : undefined}
      >
        {origin ?? "\u00a0"}
      </span>
      <span className="mx-2 inline-block w-px self-stretch bg-border/80" aria-hidden />
      <span className={rangeBlockClass(style)}>
        <span className={dateCol}>{start}</span>
        {same ? (
          <>
            <span className="mx-1 invisible" aria-hidden>
              –
            </span>
            <span className={`${dateCol} invisible`} aria-hidden>
              {start}
            </span>
          </>
        ) : (
          <>
            <span className="mx-1 inline-block" aria-hidden>
              –
            </span>
            <span className={dateCol}>{end}</span>
          </>
        )}
      </span>
    </span>
  );
}

function GroupDateHeadings({ style }: { style: GroupDateFormat }) {
  const dateCol = dateColClass(style);
  return (
    <span className="inline-flex shrink-0 items-center font-mono text-[10px] leading-none tracking-wide text-muted uppercase">
      <span className={`${dateCol} text-left`}>Origin</span>
      <span className="mx-2 inline-block w-px" aria-hidden />
      <span className={rangeBlockClass(style)}>Range</span>
    </span>
  );
}

export function GroupChatsListPane({
  threadsPct,
  mode,
  selectAllRef,
  allSelected,
  uniqueIdsCount,
  query,
  onQueryChange,
  onToggleSelectAll,
  filteredCount,
  groupsCount,
  status,
  canAct,
  years,
  listYear,
  onJumpToYear,
  groupDateFormat,
  onGroupDateFormatChange,
  onMoveToTrash,
  onRestore,
  onPermanentDelete,
  rowsByYear,
  activeKey,
  selectedIds,
  onSelectColumnClick,
  onRowClick,
  onOpenCtxMenu,
}: {
  threadsPct: number;
  mode: "group-chats" | "trash";
  selectAllRef: RefObject<HTMLInputElement | null>;
  allSelected: boolean;
  uniqueIdsCount: number;
  query: string;
  onQueryChange: (q: string) => void;
  onToggleSelectAll: () => void;
  filteredCount: number;
  groupsCount: number;
  status: string | null;
  canAct: boolean;
  years: number[];
  listYear: number | null;
  onJumpToYear: (y: number) => void;
  groupDateFormat: GroupDateFormat;
  onGroupDateFormatChange: (next: GroupDateFormat) => void;
  onMoveToTrash: () => void;
  onRestore: () => void;
  onPermanentDelete: () => void;
  rowsByYear: [number, GroupYearRow[]][];
  activeKey: string | null;
  selectedIds: Set<number>;
  onSelectColumnClick: (id: number, e: MouseEvent) => void;
  onRowClick: (g: GroupYearRow, e: MouseEvent) => void;
  onOpenCtxMenu: (id: number, x: number, y: number) => void;
}) {
  return (
        <section
          className="min-h-0 flex flex-col overflow-hidden bg-bg"
          style={{ height: `${threadsPct}%` }}
        >
          <div className="shrink-0 border-b border-border/60 bg-bg px-5 pt-4 pb-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <label className="flex shrink-0 items-center gap-2">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allSelected}
                    disabled={uniqueIdsCount === 0}
                    aria-label={
                      mode === "trash"
                        ? "Select all trashed groups"
                        : "Select all group chats"
                    }
                    onChange={onToggleSelectAll}
                    className="checkbox-list"
                  />
                </label>
                <h2 className="text-[11px] font-semibold tracking-wider text-muted uppercase">
                  {mode === "trash" ? "Trashed groups" : "Group chats"}
                  <span className="ml-2 font-normal normal-case tracking-normal">
                    {query.trim() ? `${filteredCount}/` : ""}
                    {groupsCount}
                  </span>
                </h2>
                {status && (
                  <span className="truncate text-[12px] text-muted">
                    {status}
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {mode === "group-chats" && (
                  <button
                    type="button"
                    disabled={!canAct}
                    onClick={onMoveToTrash}
                    className="inline-flex items-center rounded-md bg-white/8 px-2.5 py-1 text-[12px] text-muted transition-colors hover:bg-red-500/15 hover:text-red-300 disabled:pointer-events-none disabled:opacity-40"
                  >
                    Delete
                  </button>
                )}
                {mode === "trash" && (
                  <>
                    <button
                      type="button"
                      disabled={!canAct}
                      onClick={onRestore}
                      className="inline-flex items-center rounded-md bg-white/8 px-2.5 py-1 text-[12px] text-muted transition-colors hover:bg-white/12 hover:text-text disabled:pointer-events-none disabled:opacity-40"
                    >
                      Undelete
                    </button>
                    <button
                      type="button"
                      disabled={!canAct}
                      onClick={onPermanentDelete}
                      className="inline-flex items-center rounded-md bg-white/8 px-2.5 py-1 text-[12px] text-muted transition-colors hover:bg-red-500/15 hover:text-red-300 disabled:pointer-events-none disabled:opacity-40"
                    >
                      Delete permanently
                    </button>
                  </>
                )}
                <label className="flex items-center gap-1.5 text-[11px] text-muted">
                  <span className="sr-only">Date format</span>
                  <select
                    value={groupDateFormat}
                    onChange={(e) =>
                      onGroupDateFormatChange(e.target.value as GroupDateFormat)
                    }
                    className="rounded border border-border bg-elevated px-1.5 py-0.5 text-[11px] text-text outline-none"
                  >
                    <option value="md">01-31-2025</option>
                    <option value="mon-d">Jan 31, 2025</option>
                    <option value="d-mon">31 Jan 2025</option>
                  </select>
                </label>
              </div>
            </div>

            {years.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1">
                {years.map((y) => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => onJumpToYear(y)}
                    className={`text-[13px] font-medium ${
                      listYear === y
                        ? "text-accent"
                        : "text-text hover:text-accent"
                    }`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            )}

            <div>
              <input
                type="search"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="Search by name or phone…"
                className="w-full max-w-md rounded-md border border-border bg-elevated px-2.5 py-1.5 text-[13px] text-text outline-none placeholder:text-muted focus:border-accent"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-bg">
            {groupsCount === 0 ? (
              <p className="mt-2 px-5 text-[12px] text-muted">
                {mode === "trash" ? "No trashed group chats" : "No group chats"}
              </p>
            ) : rowsByYear.length === 0 ? (
              <p className="mt-2 px-5 text-[12px] text-muted">
                No matching groups
              </p>
            ) : (
              rowsByYear.map(([year, items]) => (
                <div key={year} id={`group-year-${year}`} className="pb-6">
                  <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-bg py-1.5 pr-5 pl-5">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <div className="text-[13px] font-semibold text-text">
                        {year}
                      </div>
                      <span className="text-[11px] text-muted">
                        {items.length} group{items.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <GroupDateHeadings style={groupDateFormat} />
                  </div>
                  <ul className="divide-y divide-border/50 border-b border-border/50">
                    {items.map((g) => {
                      const key = `${g.id}-${g.year}`;
                      const checked = selectedIds.has(g.id);
                      const focused = activeKey === key;
                      const selectionActive = selectedIds.size >= 1;
                      return (
                        <li key={key}>
                          <div
                            className={`group relative flex items-start gap-1.5 py-2 pr-5 pl-0 select-none ${
                              checked
                                ? "bg-accent/20 hover:bg-accent/25"
                                : focused
                                  ? "bg-elevated hover:bg-white/18"
                                  : "hover:bg-white/20"
                            }`}
                            onContextMenu={
                              mode === "trash"
                                ? (e) => {
                                    e.preventDefault();
                                    onOpenCtxMenu(g.id, e.clientX, e.clientY);
                                  }
                                : undefined
                            }
                          >
                            {(checked || (focused && !selectionActive)) && (
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
                              aria-label={`Select ${g.title}`}
                              onClick={(e) => onSelectColumnClick(g.id, e)}
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
                              title={g.titleFull}
                              onClick={(e) => onRowClick(g, e)}
                              onMouseDown={(e) => {
                                if (e.shiftKey) e.preventDefault();
                              }}
                              className={`flex min-w-0 flex-1 items-start justify-between gap-4 text-left text-[13px] ${
                                focused && !selectionActive
                                  ? "text-accent"
                                  : "text-text"
                              }`}
                            >
                              <span className="min-w-0">
                                <span className="line-clamp-2 font-medium leading-snug">
                                  {g.title}
                                </span>
                                <span className="mt-0.5 block truncate text-[11px] text-muted">
                                  {g.participantCount} people
                                  <span className="mx-1.5">·</span>
                                  {g.messageCount} msgs
                                </span>
                              </span>
                              <GroupDateCell g={g} style={groupDateFormat} />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </div>
        </section>
  );
}
