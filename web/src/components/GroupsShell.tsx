"use client";

import type { GroupYearRow, MessageRow } from "@/lib/types";
import { searchGroups } from "@/lib/groupSearch";
import {
  readStoredGroupDateFormat,
  writeStoredGroupDateFormat,
  type GroupDateFormat,
} from "@/lib/groupDateFormat";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { GroupsListPane } from "./GroupsListPane";
import { GroupsMessagesPane } from "./GroupsMessagesPane";
import { useSourceFilter } from "./SourceFilter";
import { useResizablePanes } from "./useResizablePanes";

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
    writeStoredGroupDateFormat(next);
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
        <GroupsListPane
          threadsPct={threadsPct}
          mode={mode}
          selectAllRef={selectAllRef}
          allSelected={allSelected}
          uniqueIdsCount={uniqueIds.length}
          query={query}
          onQueryChange={setQuery}
          onToggleSelectAll={toggleSelectAll}
          filteredCount={filtered.length}
          groupsCount={groups.length}
          status={status}
          canAct={canAct}
          years={years}
          listYear={listYear}
          onJumpToYear={jumpToYearSection}
          groupDateFormat={groupDateFormat}
          onGroupDateFormatChange={setGroupDateFormat}
          onMoveToTrash={() => void moveToTrash()}
          onRestore={() => void restoreFromTrash()}
          onPermanentDelete={() => void permanentlyDeleteFromTrash()}
          rowsByYear={rowsByYear}
          activeKey={activeKey}
          selectedIds={selectedIds}
          onSelectColumnClick={onSelectColumnClick}
          onRowClick={onRowClick}
          onOpenCtxMenu={openCtxMenu}
        />

        <div
          role="separator"
          aria-orientation="horizontal"
          onMouseDown={startThreads}
          className="h-1 shrink-0 cursor-row-resize bg-border hover:bg-accent/60"
        />

        <GroupsMessagesPane
          messagesPaneRef={messagesPaneRef}
          multiSelected={multiSelected}
          selectedIds={selectedIds}
          selectedRow={selectedRow}
          focusYear={focusYear}
          loading={loading}
          messages={messages}
        />
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
