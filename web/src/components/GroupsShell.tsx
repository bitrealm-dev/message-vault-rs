"use client";

import type { GroupYearRow, MessageRow } from "@/lib/types";
import { searchGroups } from "@/lib/groupSearch";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MessageBubble } from "./MessageBubble";
import { useSourceFilter } from "./SourceFilter";
import { useResizablePanes } from "./useResizablePanes";

type GroupDateFormat = "md" | "mon-d" | "d-mon";

const GROUP_DATE_FORMAT_KEY = "mv-group-date-format";
const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function formatGroupDate(isoDate: string, style: GroupDateFormat): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return isoDate;
  const year = m[1];
  const monthNum = Number(m[2]);
  const dayNum = Number(m[3]);
  const mon = MONTH_SHORT[monthNum - 1] ?? m[2];
  // Pad day so every date string is a fixed character width (monospace cell).
  const day = String(dayNum).padStart(2, "0");
  switch (style) {
    case "mon-d":
      // "Sep 30, 2025" = 12 chars
      return `${mon} ${day}, ${year}`;
    case "d-mon":
      // "30 Sep 2025" = 11 chars
      return `${day} ${mon} ${year}`;
    case "md":
    default:
      // "09-30-2025" = 10 chars
      return `${m[2]}-${m[3]}-${year}`;
  }
}

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
  };
  style: GroupDateFormat;
}) {
  const threadStart = formatGroupDate(g.conversationDateStart, style);
  const start = formatGroupDate(g.dateStart, style);
  const end = formatGroupDate(g.dateEnd, style);
  const same = g.dateEnd === g.dateStart;
  const dateCol = dateColClass(style);

  return (
    <span className="inline-flex shrink-0 items-center whitespace-nowrap font-mono text-[11px] leading-none text-muted">
      <span className={`${dateCol} text-left`} title="Thread started">
        {threadStart}
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
      <span className={`${dateCol} text-left`}>Started</span>
      <span className="mx-2 inline-block w-px" aria-hidden />
      <span className={rangeBlockClass(style)}>Range</span>
    </span>
  );
}

function readStoredGroupDateFormat(): GroupDateFormat {
  if (typeof window === "undefined") return "md";
  const v = localStorage.getItem(GROUP_DATE_FORMAT_KEY);
  if (v === "md" || v === "mon-d" || v === "d-mon") return v;
  return "md";
}

export function GroupsShell({
  groups: initialGroups,
  initialGroupId,
  initialYear,
  mode = "groups",
}: {
  groups: GroupYearRow[];
  initialGroupId: number | null;
  initialYear: number | null;
  mode?: "groups" | "trash";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { sourceQuery } = useSourceFilter();
  const [groups, setGroups] = useState(initialGroups);
  const [groupId, setGroupId] = useState<number | null>(initialGroupId);
  const [focusYear, setFocusYear] = useState<number | null>(initialYear);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [listYear, setListYear] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [groupDateFormat, setGroupDateFormatState] =
    useState<GroupDateFormat>("md");
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    conversationId: number;
  } | null>(null);
  const { threadsPct, startThreads, shellRef } = useResizablePanes("groups");
  const messagesPaneRef = useRef<HTMLElement>(null);
  const pendingScrollYearRef = useRef<number | null>(initialYear);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const selectionAnchorRef = useRef<number | null>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () => searchGroups(groups, query),
    [groups, query],
  );

  /** Unique conversation ids in filtered list order (first appearance). */
  const uniqueIds = useMemo(() => {
    const ids: number[] = [];
    const seen = new Set<number>();
    for (const g of filtered) {
      if (seen.has(g.id)) continue;
      seen.add(g.id);
      ids.push(g.id);
    }
    return ids;
  }, [filtered]);

  const years = useMemo(() => {
    const source = query.trim() ? filtered : groups;
    const set = new Set<number>();
    for (const g of source) set.add(g.year);
    return [...set].sort((a, b) => b - a);
  }, [groups, filtered, query]);

  // Default to newest year; keep selection if still in the list.
  useEffect(() => {
    if (years.length === 0) {
      setListYear(null);
      return;
    }
    setListYear((prev) =>
      prev != null && years.includes(prev) ? prev : years[0]!,
    );
  }, [years]);

  const rowsByYear = useMemo(() => {
    const map = new Map<number, GroupYearRow[]>();
    for (const g of filtered) {
      const list = map.get(g.year) ?? [];
      list.push(g);
      map.set(g.year, list);
    }
    return [...map.entries()].sort(([a], [b]) => b - a);
  }, [filtered]);

  const selectedRow = useMemo(() => {
    if (groupId == null) return null;
    if (focusYear != null) {
      const match = groups.find(
        (g) => g.id === groupId && g.year === focusYear,
      );
      if (match) return match;
    }
    return groups.find((g) => g.id === groupId) ?? null;
  }, [groups, groupId, focusYear]);

  const multiSelected = selectedIds.size >= 1;
  const allSelected =
    uniqueIds.length > 0 && uniqueIds.every((id) => selectedIds.has(id));
  const someSelected =
    uniqueIds.length > 0 && uniqueIds.some((id) => selectedIds.has(id));

  const actionTargets = useMemo(() => {
    if (multiSelected) return [...selectedIds];
    if (groupId != null) return [groupId];
    return [];
  }, [multiSelected, selectedIds, groupId]);

  const canAct = actionTargets.length > 0 && !saving;

  useEffect(() => {
    setGroupDateFormatState(readStoredGroupDateFormat());
  }, []);

  useEffect(() => {
    setGroups(initialGroups);
    if (groupId != null && !initialGroups.some((g) => g.id === groupId)) {
      setGroupId(null);
      setFocusYear(null);
      setMessages([]);
    }
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<number>();
      for (const id of prev) {
        if (initialGroups.some((g) => g.id === id)) next.add(id);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [initialGroups, groupId]);

  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate = someSelected && !allSelected;
  }, [someSelected, allSelected]);

  useEffect(() => {
    if (!ctxMenu) return;
    const onDown = (e: globalThis.MouseEvent) => {
      if (!ctxMenuRef.current?.contains(e.target as Node)) setCtxMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCtxMenu(null);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [ctxMenu]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    selectionAnchorRef.current = null;
  }, []);

  useEffect(() => {
    if (selectedIds.size === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (ctxMenu) return;
      clearSelection();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedIds.size, ctxMenu, clearSelection]);

  const setGroupDateFormat = useCallback((next: GroupDateFormat) => {
    setGroupDateFormatState(next);
    localStorage.setItem(GROUP_DATE_FORMAT_KEY, next);
  }, []);

  const jumpToYearSection = useCallback((year: number) => {
    setListYear(year);
    const el = document.getElementById(`group-year-${year}`);
    const pane = el?.closest(".overflow-y-auto") as HTMLElement | null;
    if (!el || !pane) return;
    const elTop = el.getBoundingClientRect().top;
    const paneTop = pane.getBoundingClientRect().top;
    pane.scrollTop += elTop - paneTop;
  }, []);

  /** Drop every year row for the given conversation ids (one thread → all years). */
  const clearFocusAfterRemoval = useCallback(
    (removedIds: number[]) => {
      const removed = new Set(removedIds);
      setGroups((prev) => prev.filter((g) => !removed.has(g.id)));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of removed) next.delete(id);
        return next;
      });
      if (groupId != null && removed.has(groupId)) {
        setGroupId(null);
        setFocusYear(null);
        setMessages([]);
        const params = new URLSearchParams(searchParams.toString());
        params.delete("g");
        params.delete("y");
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }
    },
    [groupId, pathname, router, searchParams],
  );

  const conversationSpansMultipleYears = useCallback(
    (conversationId: number) =>
      groups.some((g) => g.id === conversationId && g.spansMultipleYears),
    [groups],
  );

  /** Resolve delete/restore targets to unique conversation ids. */
  const resolveConversationTargets = useCallback(
    (forId?: number) => {
      const raw =
        forId != null && !multiSelected ? [forId] : actionTargets;
      return [...new Set(raw)];
    },
    [actionTargets, multiSelected],
  );

  const selectGroup = useCallback(
    (row: GroupYearRow) => {
      if (groupId === row.id && focusYear === row.year) {
        setSelectedIds(new Set());
        return;
      }
      setSelectedIds(new Set());
      selectionAnchorRef.current = row.id;
      setGroupId(row.id);
      setFocusYear(row.year);
      setMessages([]);
      pendingScrollYearRef.current = row.year;
      const params = new URLSearchParams(searchParams.toString());
      params.set("g", String(row.id));
      params.set("y", String(row.year));
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [focusYear, groupId, pathname, router, searchParams],
  );

  const applyRangeSelect = useCallback(
    (id: number) => {
      const clickIndex = uniqueIds.indexOf(id);
      if (clickIndex < 0) return;
      const anchor =
        selectionAnchorRef.current != null
          ? uniqueIds.indexOf(selectionAnchorRef.current)
          : -1;
      const from = anchor >= 0 ? anchor : clickIndex;
      const lo = Math.min(from, clickIndex);
      const hi = Math.max(from, clickIndex);
      const next = new Set<number>();
      for (let i = lo; i <= hi; i++) next.add(uniqueIds[i]!);
      setSelectedIds(next);
      selectionAnchorRef.current = id;
    },
    [uniqueIds],
  );

  const ctrlToggleSelect = useCallback(
    (id: number) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.size === 0 && groupId != null) next.add(groupId);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      selectionAnchorRef.current = id;
    },
    [groupId],
  );

  const toggleOrRangeSelect = useCallback(
    (id: number, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
      if (e.shiftKey) {
        applyRangeSelect(id);
        return;
      }
      if (e.metaKey || e.ctrlKey) {
        ctrlToggleSelect(id);
        return;
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      selectionAnchorRef.current = id;
    },
    [applyRangeSelect, ctrlToggleSelect],
  );

  const onSelectColumnClick = useCallback(
    (id: number, e: MouseEvent) => {
      e.stopPropagation();
      toggleOrRangeSelect(id, e);
    },
    [toggleOrRangeSelect],
  );

  const onRowClick = useCallback(
    (row: GroupYearRow, e: MouseEvent) => {
      if (e.shiftKey) {
        e.preventDefault();
        applyRangeSelect(row.id);
        return;
      }
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        ctrlToggleSelect(row.id);
        return;
      }
      if (selectedIds.size >= 1) {
        toggleOrRangeSelect(row.id, e);
        return;
      }
      selectGroup(row);
    },
    [
      applyRangeSelect,
      ctrlToggleSelect,
      selectGroup,
      selectedIds.size,
      toggleOrRangeSelect,
    ],
  );

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(uniqueIds));
  }, [allSelected, uniqueIds]);

  const clampMenu = (x: number, y: number, w: number, h: number) => ({
    x: Math.max(8, Math.min(x, window.innerWidth - w - 8)),
    y: Math.max(8, Math.min(y, window.innerHeight - h - 8)),
  });

  const openCtxMenu = useCallback(
    (conversationId: number, clientX: number, clientY: number) => {
      if (!selectedIds.has(conversationId) && selectedIds.size > 0) {
        setSelectedIds(new Set([conversationId]));
      }
      const pos = clampMenu(clientX, clientY, 200, 120);
      setCtxMenu({ x: pos.x, y: pos.y, conversationId });
    },
    [selectedIds],
  );

  const moveToTrash = async (forId?: number) => {
    if (mode !== "groups") return;
    const targets = resolveConversationTargets(forId);
    if (targets.length === 0) return;
    const multiYear =
      targets.length === 1 &&
      conversationSpansMultipleYears(targets[0]!);
    const label =
      targets.length === 1
        ? multiYear
          ? "Move this group chat to Trash? It appears under multiple years and will be removed from all of them."
          : "Move this group chat to Trash?"
        : `Move ${targets.length} group chats to Trash? Each chat will be removed from every year it appears under.`;
    if (!window.confirm(label)) return;
    setSaving(true);
    setCtxMenu(null);
    try {
      for (const conversationId of targets) {
        const res = await fetch("/api/groups/trash", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "delete failed");
      }
      setStatus(
        targets.length === 1
          ? "Moved to Trash"
          : `Moved ${targets.length} to Trash`,
      );
      clearFocusAfterRemoval(targets);
      router.push("/unmatched/trash?tab=groups");
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : "Delete failed");
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const restoreFromTrash = async (forId?: number) => {
    if (mode !== "trash") return;
    const targets = resolveConversationTargets(forId);
    if (targets.length === 0) return;
    setSaving(true);
    setCtxMenu(null);
    try {
      for (const conversationId of targets) {
        const res = await fetch("/api/groups/trash", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "undelete failed");
      }
      setStatus(
        targets.length === 1
          ? "Undeleted — back in Group Chats"
          : `Undeleted ${targets.length} group chats`,
      );
      clearFocusAfterRemoval(targets);
      router.refresh();
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : "Undelete failed");
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const permanentlyDeleteFromTrash = async (forId?: number) => {
    if (mode !== "trash") return;
    const targets = resolveConversationTargets(forId);
    if (targets.length === 0) return;
    const multiYear =
      targets.length === 1 &&
      conversationSpansMultipleYears(targets[0]!);
    const label =
      targets.length === 1
        ? multiYear
          ? "Permanently delete this group chat? It appears under multiple years and will be removed from all of them. This cannot be undone."
          : "Permanently delete this group chat? This cannot be undone."
        : `Permanently delete ${targets.length} group chats? Each chat will be removed from every year it appears under. This cannot be undone.`;
    if (!window.confirm(label)) return;
    setSaving(true);
    setCtxMenu(null);
    try {
      for (const conversationId of targets) {
        const res = await fetch("/api/groups/trash", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId, permanent: true }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "permanent delete failed");
      }
      setStatus(
        targets.length === 1
          ? "Permanently deleted"
          : `Permanently deleted ${targets.length} group chats`,
      );
      clearFocusAfterRemoval(targets);
      router.refresh();
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : "Permanent delete failed");
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (multiSelected || !groupId) {
      if (multiSelected) setMessages([]);
      if (!groupId) setMessages([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/messages?conversationIds=${groupId}${sourceQuery}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setMessages(data.messages ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId, sourceQuery, multiSelected]);

  useEffect(() => {
    const year = pendingScrollYearRef.current;
    if (year == null || loading || messages.length === 0 || multiSelected)
      return;
    const pane = messagesPaneRef.current;
    if (!pane) return;

    const prefix = `${year}-`;
    const matches = pane.querySelectorAll(`[data-timestamp^="${prefix}"]`);
    // DESC order: last match is the earliest message in that year.
    const target = matches[matches.length - 1] as HTMLElement | undefined;
    if (target) {
      requestAnimationFrame(() => {
        // Scroll only the messages pane — scrollIntoView also shifts split parents.
        const delta =
          target.getBoundingClientRect().top - pane.getBoundingClientRect().top;
        pane.scrollTop += delta;
      });
    }
    pendingScrollYearRef.current = null;
  }, [loading, messages, focusYear, multiSelected]);

  const activeKey =
    groupId != null && focusYear != null && !multiSelected
      ? `${groupId}-${focusYear}`
      : null;

  return (
    <div ref={shellRef} className="flex h-full min-h-0 flex-col bg-bg">
      <div id="groups-split" className="flex min-h-0 flex-1 flex-col">
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
                    disabled={uniqueIds.length === 0}
                    aria-label={
                      mode === "trash"
                        ? "Select all trashed groups"
                        : "Select all group chats"
                    }
                    onChange={toggleSelectAll}
                    className="checkbox-people"
                  />
                </label>
                <h2 className="text-[11px] font-semibold tracking-wider text-muted uppercase">
                  {mode === "trash" ? "Trashed groups" : "Group messages"}
                  <span className="ml-2 font-normal normal-case tracking-normal">
                    {query.trim() ? `${filtered.length}/` : ""}
                    {groups.length}
                  </span>
                </h2>
                {status && (
                  <span className="truncate text-[12px] text-muted">
                    {status}
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {mode === "groups" && (
                  <button
                    type="button"
                    disabled={!canAct}
                    onClick={() => void moveToTrash()}
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
                      onClick={() => void restoreFromTrash()}
                      className="inline-flex items-center rounded-md bg-white/8 px-2.5 py-1 text-[12px] text-muted transition-colors hover:bg-white/12 hover:text-text disabled:pointer-events-none disabled:opacity-40"
                    >
                      Undelete
                    </button>
                    <button
                      type="button"
                      disabled={!canAct}
                      onClick={() => void permanentlyDeleteFromTrash()}
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
                      setGroupDateFormat(e.target.value as GroupDateFormat)
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
                    onClick={() => jumpToYearSection(y)}
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
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or phone…"
                className="w-full max-w-md rounded-md border border-border bg-elevated px-2.5 py-1.5 text-[13px] text-text outline-none placeholder:text-muted focus:border-accent"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-bg">
            {groups.length === 0 ? (
              <p className="mt-2 px-5 text-[12px] text-muted">
                {mode === "trash" ? "No trashed group chats" : "No group messages"}
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
                                    openCtxMenu(g.id, e.clientX, e.clientY);
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
                                className="checkbox-people pointer-events-none"
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

        <div
          role="separator"
          aria-orientation="horizontal"
          onMouseDown={startThreads}
          className="h-1 shrink-0 cursor-row-resize bg-border hover:bg-accent/60"
        />

        <section
          ref={messagesPaneRef}
          className="min-h-0 flex-1 overflow-y-auto bg-bg px-4 py-4"
        >
          {multiSelected && (
            <p className="pt-8 text-center text-[13px] text-muted">
              {selectedIds.size} group
              {selectedIds.size === 1 ? "" : "s"} selected
            </p>
          )}
          {!multiSelected && !selectedRow && (
            <p className="pt-8 text-center text-[13px] text-muted">
              Select a group to read messages.
            </p>
          )}
          {!multiSelected && selectedRow && loading && messages.length === 0 && (
            <p className="pt-8 text-center text-[13px] text-muted">
              Loading messages…
            </p>
          )}
          {!multiSelected &&
            selectedRow &&
            !loading &&
            messages.length === 0 && (
              <p className="pt-8 text-center text-[13px] text-muted">
                No messages
              </p>
            )}
          {!multiSelected && selectedRow && messages.length > 0 && (
            <div
              className={`mx-auto flex max-w-2xl flex-col gap-2 ${
                loading ? "opacity-60" : ""
              }`}
            >
              <div className="mb-2 border-b border-border/60 pb-2 text-center">
                <div className="px-2 text-[13px] font-medium break-words text-text whitespace-normal">
                  {selectedRow.participantNames.length > 0
                    ? selectedRow.participantNames.join(" · ")
                    : selectedRow.title}
                </div>
                {selectedRow.namedTitle ? (
                  <div className="mt-0.5 text-[12px] text-muted">
                    {selectedRow.namedTitle}
                  </div>
                ) : null}
                <div className="mt-0.5 text-[12px] text-muted">
                  {selectedRow.spansMultipleYears
                    ? `${selectedRow.conversationDateStart} — ${selectedRow.conversationDateEnd}`
                    : selectedRow.dateStart === selectedRow.dateEnd
                      ? selectedRow.dateStart
                      : `${selectedRow.dateStart} — ${selectedRow.dateEnd}`}
                  {focusYear != null && selectedRow.spansMultipleYears ? (
                    <>
                      <span className="mx-1.5">·</span>
                      starting {focusYear}
                    </>
                  ) : null}
                </div>
              </div>
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
            </div>
          )}
        </section>
      </div>

      {ctxMenu && mode === "trash" && (
        <div
          ref={ctxMenuRef}
          className="fixed z-50 min-w-[180px] rounded-md border border-border bg-elevated py-1 shadow-lg"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-left text-[13px] text-text hover:bg-white/10"
            onClick={() => void restoreFromTrash(ctxMenu.conversationId)}
          >
            Undelete
          </button>
          <button
            type="button"
            className="block w-full px-3 py-1.5 text-left text-[13px] text-text hover:bg-red-500/15 hover:text-red-300 disabled:opacity-50"
            onClick={() =>
              void permanentlyDeleteFromTrash(ctxMenu.conversationId)
            }
          >
            Delete permanently
          </button>
        </div>
      )}
    </div>
  );
}
