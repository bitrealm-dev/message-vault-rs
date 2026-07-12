"use client";

import type { GroupYearRow } from "@/lib/types";
import { searchGroups } from "@/lib/groupSearch";
import { GROUP_DATE_FORMAT_KEY } from "@/lib/groupDateFormat";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { GroupChatsListPane } from "./GroupChatsListPane";
import { GroupChatsMessagesPane } from "./GroupChatsMessagesPane";
import { useSourceFilter } from "./SourceFilter";
import { useDismissible } from "./useDismissible";
import { useListSelection } from "./useListSelection";
import { usePersistedEnum } from "./usePersistedEnum";
import { PaneSeparator } from "./PaneSeparator";
import { useThreadMessages } from "./useThreadMessages";
import { useTrashActions } from "./useTrashActions";
import { Group, Panel, useDefaultLayout } from "react-resizable-panels";

const GROUP_DATE_ALLOWED = ["md", "mon-d", "d-mon"] as const;

/** Newest calendar year for a conversation in the year-row list. */
function newestYearForConversation(
  rows: GroupYearRow[],
  id: number,
): number | null {
  let newest: number | null = null;
  for (const g of rows) {
    if (g.id !== id) continue;
    if (newest == null || g.year > newest) newest = g.year;
  }
  return newest;
}

export function GroupChatsShell({
  groupChats: initialGroupChats,
  initialConversationId,
  initialYear,
  mode = "group-chats",
}: {
  groupChats: GroupYearRow[];
  initialConversationId: number | null;
  initialYear: number | null;
  mode?: "group-chats" | "trash";
}) {
  const router = useRouter();

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { sourceQuery } = useSourceFilter();
  const [groupChats, setGroupChats] = useState(initialGroupChats);
  const [conversationId, setConversationId] = useState<number | null>(
    initialConversationId,
  );
  const [focusYear, setFocusYear] = useState<number | null>(initialYear);
  const [status, setStatus] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [listYear, setListYear] = useState<number | null>(null);
  const [groupDateFormat, setGroupDateFormat] = usePersistedEnum(
    GROUP_DATE_FORMAT_KEY,
    GROUP_DATE_ALLOWED,
    "md",
  );
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    conversationId: number;
  } | null>(null);
  const threadsLayout = useDefaultLayout({
    id: "mv-group-chats-threads",
    panelIds: ["list", "messages"],
    storage: typeof window !== "undefined" ? localStorage : undefined,
  });
  const messagesPaneRef = useRef<HTMLElement>(null);
  const pendingScrollYearRef = useRef<number | null>(initialYear);
  const ctxMenuRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () => searchGroups(groupChats, query),
    [groupChats, query],
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

  const validIds = useMemo(() => groupChats.map((g) => g.id), [groupChats]);

  const {
    selectedIds,
    setSelectedIds,
    selectionAnchorRef,
    multiSelected,
    allSelected,
    selectAllRef,
    toggleSelectAll,
    onSelectColumnClick,
    onRowClick: onRowClickId,
  } = useListSelection<number>({
    orderedIds: uniqueIds,
    validIds,
    rangeMode: "anchor",
    rangeUpdatesAnchor: true,
    multiThreshold: "any",
    focusedId: conversationId,
    ctrlSeedSkipsTarget: false,
    rowClickMode: "openWhenEmptyElseToggleIfSelected",
    checkboxEvents: "stopOnly",
    escapeToClear: true,
    escapeBlocked: () => ctxMenu != null,
    selectAllSetsAnchor: false,
  });

  const years = useMemo(() => {
    const source = query.trim() ? filtered : groupChats;
    const set = new Set<number>();
    for (const g of source) set.add(g.year);
    return [...set].sort((a, b) => b - a);
  }, [groupChats, filtered, query]);

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
    if (conversationId == null || focusYear == null) return null;
    return (
      groupChats.find(
        (g) => g.id === conversationId && g.year === focusYear,
      ) ?? null
    );
  }, [groupChats, conversationId, focusYear]);

  const actionTargets = useMemo(() => {
    if (multiSelected) return [...selectedIds];
    if (conversationId != null) return [conversationId];
    return [];
  }, [multiSelected, selectedIds, conversationId]);

  const {
    messages,
    loading,
    setMessages,
  } = useThreadMessages({
    conversationIds: conversationId != null ? [conversationId] : null,
    year: focusYear,
    sourceQuery,
    enabled: !multiSelected,
  });

  // Deep link / refresh: require a valid year for the selected conversation.
  useEffect(() => {
    if (conversationId == null) return;
    if (!groupChats.some((g) => g.id === conversationId)) return;

    const yearOk =
      focusYear != null &&
      groupChats.some((g) => g.id === conversationId && g.year === focusYear);
    if (yearOk) return;

    const nextYear = newestYearForConversation(groupChats, conversationId);
    if (nextYear == null) return;
    setFocusYear(nextYear);
    pendingScrollYearRef.current = nextYear;
    const params = new URLSearchParams(searchParams.toString());
    params.set("g", String(conversationId));
    params.set("y", String(nextYear));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [groupChats, conversationId, focusYear, pathname, router, searchParams]);

  useEffect(() => {
    setGroupChats(initialGroupChats);
    if (
      conversationId != null &&
      !initialGroupChats.some((g) => g.id === conversationId)
    ) {
      setConversationId(null);
      setFocusYear(null);
      setMessages([]);
    }
  }, [initialGroupChats, conversationId, setMessages]);

  useDismissible({
    open: ctxMenu != null,
    onDismiss: () => setCtxMenu(null),
    refs: [ctxMenuRef],
    eventTarget: typeof window !== "undefined" ? window : undefined,
  });

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
      setGroupChats((prev) => prev.filter((g) => !removed.has(g.id)));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of removed) next.delete(id);
        return next;
      });
      if (conversationId != null && removed.has(conversationId)) {
        setConversationId(null);
        setFocusYear(null);
        setMessages([]);
        const params = new URLSearchParams(searchParams.toString());
        params.delete("g");
        params.delete("y");
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }
    },
    [conversationId, pathname, router, searchParams, setMessages],
  );

  const conversationSpansMultipleYears = useCallback(
    (id: number) =>
      groupChats.some((g) => g.id === id && g.spansMultipleYears),
    [groupChats],
  );

  const getTrashTargets = useCallback(
    (forId?: number) => {
      const raw =
        forId != null && !multiSelected ? [forId] : actionTargets;
      return [...new Set(raw)];
    },
    [actionTargets, multiSelected],
  );

  const {
    saving,
    moveToTrash,
    restoreFromTrash,
    permanentlyDeleteFromTrash,
  } = useTrashActions<number>({
    endpoint: "/api/group-chats/trash",
    idField: "conversationId",
    getTargets: getTrashTargets,
    canTrash: mode === "group-chats",
    canRestoreOrDelete: mode === "trash",
    confirmTrash: (targets) => {
      const multiYear =
        targets.length === 1 &&
        conversationSpansMultipleYears(targets[0]!);
      if (targets.length === 1) {
        return multiYear
          ? "Move this group chat to Trash? It appears under multiple years and will be removed from all of them."
          : "Move this group chat to Trash?";
      }
      return `Move ${targets.length} group chats to Trash? Each chat will be removed from every year it appears under.`;
    },
    confirmPermanent: (targets) => {
      const multiYear =
        targets.length === 1 &&
        conversationSpansMultipleYears(targets[0]!);
      if (targets.length === 1) {
        return multiYear
          ? "Permanently delete this group chat? It appears under multiple years and will be removed from all of them. This cannot be undone."
          : "Permanently delete this group chat? This cannot be undone.";
      }
      return `Permanently delete ${targets.length} group chats? Each chat will be removed from every year it appears under. This cannot be undone.`;
    },
    status: {
      trashedOne: "Moved to Trash",
      trashedMany: (n) => `Moved ${n} to Trash`,
      restoredOne: "Undeleted — back in Group Chats",
      restoredMany: (n) => `Undeleted ${n} group chats`,
      deletedOne: "Permanently deleted",
      deletedMany: (n) => `Permanently deleted ${n} group chats`,
    },
    setStatus,
    onRemoved: clearFocusAfterRemoval,
    onDismissMenus: () => setCtxMenu(null),
    afterTrash: () => router.push("/trash?tab=group-chats"),
  });

  const canAct = actionTargets.length > 0 && !saving;

  const selectGroup = useCallback(
    (row: GroupYearRow) => {
      if (conversationId === row.id && focusYear === row.year) {
        setSelectedIds(new Set());
        return;
      }
      setSelectedIds(new Set());
      selectionAnchorRef.current = row.id;
      setConversationId(row.id);
      setFocusYear(row.year);
      setMessages([]);
      pendingScrollYearRef.current = row.year;
      const params = new URLSearchParams(searchParams.toString());
      params.set("g", String(row.id));
      params.set("y", String(row.year));
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [
      focusYear,
      conversationId,
      pathname,
      router,
      searchParams,
      setMessages,
      setSelectedIds,
      selectionAnchorRef,
    ],
  );

  const onRowClick = useCallback(
    (row: GroupYearRow, e: MouseEvent) => {
      if (
        !e.shiftKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        selectedIds.size === 0
      ) {
        selectGroup(row);
        return;
      }
      onRowClickId(row.id, e);
    },
    [onRowClickId, selectGroup, selectedIds.size],
  );

  const clampMenu = (x: number, y: number, w: number, h: number) => ({
    x: Math.max(8, Math.min(x, window.innerWidth - w - 8)),
    y: Math.max(8, Math.min(y, window.innerHeight - h - 8)),
  });

  const openCtxMenu = useCallback(
    (id: number, clientX: number, clientY: number) => {
      if (!selectedIds.has(id) && selectedIds.size > 0) {
        setSelectedIds(new Set([id]));
      }
      const pos = clampMenu(clientX, clientY, 200, 120);
      setCtxMenu({ x: pos.x, y: pos.y, conversationId: id });
    },
    [selectedIds, setSelectedIds],
  );

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
    conversationId != null && focusYear != null && !multiSelected
      ? `${conversationId}-${focusYear}`
      : null;

  return (
    <>
    <Group
      id="mv-group-chats-threads"
      orientation="vertical"
      className="h-full w-full bg-bg"
      defaultLayout={threadsLayout.defaultLayout}
      onLayoutChanged={threadsLayout.onLayoutChanged}
    >
      <Panel
        id="list"
        defaultSize="40%"
        minSize="25%"
        maxSize="75%"
        className="min-h-0"
      >
        <GroupChatsListPane
          mode={mode}
          selectAllRef={selectAllRef}
          allSelected={allSelected}
          uniqueIdsCount={uniqueIds.length}
          query={query}
          onQueryChange={setQuery}
          onToggleSelectAll={toggleSelectAll}
          filteredCount={filtered.length}
          groupsCount={groupChats.length}
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
      </Panel>

      <PaneSeparator orientation="horizontal" />

      <Panel id="messages" minSize="25%" className="min-h-0">
        <GroupChatsMessagesPane
          messagesPaneRef={messagesPaneRef}
          multiSelected={multiSelected}
          selectedIds={selectedIds}
          selectedRow={selectedRow}
          focusYear={focusYear}
          loading={loading}
          messages={messages}
          conversationSelected={conversationId != null}
        />
      </Panel>
    </Group>

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
    </>
  );
}
