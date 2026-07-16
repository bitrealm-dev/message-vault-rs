"use client";

import type { GroupYearRow } from "@/lib/types";
import {
  collapseGroupYearRows,
  GROUP_DATE_ALLOWED,
  newestYearForConversation,
  SORT_ORDER_ALLOWED,
  type CollapsedGroupConversation,
} from "@/lib/groupChatList";
import { searchGroups } from "@/lib/groupSearch";
import { GROUP_DATE_FORMAT_KEY } from "@/lib/groupDateFormat";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createGroupChatTrashOptions } from "./groupChatTrash";
import { GroupChatsMessagesPane } from "./GroupChatsMessagesPane";
import { ParticipantContactFormOverlay } from "./ParticipantContactFormOverlay";
import { TrashListChrome } from "./TrashListChrome";
import { TrashGroupChatList } from "./TrashGroupChatList";
import {
  type GroupTrashSortBy,
  type SortOrder,
} from "./SortByMenu";
import { YearFilterMenu } from "./YearFilterMenu";
import { useHistory } from "./history";
import { useSourceFilter } from "./SourceFilter";
import { useDismissible } from "./useDismissible";
import { useListSelection } from "./useListSelection";
import { useParticipantContactForm } from "./useParticipantContactForm";
import { usePersistedEnum } from "./usePersistedEnum";
import { PaneSeparator } from "./PaneSeparator";
import { usePanelLayoutStorage } from "./panelLayoutStorage";
import { useThreadMessages } from "./useThreadMessages";
import { useTrashActions } from "./useTrashActions";
import { useVaultReadOnly } from "./useVaultReadOnly";
import { Group, Panel, useDefaultLayout } from "react-resizable-panels";

const GROUP_SIDEBAR_SORT_BY_KEY = "mv-group-sidebar-sort-by";
const GROUP_SIDEBAR_SORT_ORDER_KEY = "mv-group-sidebar-sort-order";
const GROUP_SIDEBAR_SORT_BY_ALLOWED = [
  "start",
  "end",
  "people",
  "messages",
] as const;

function sortTrashGroups(
  items: CollapsedGroupConversation[],
  sortBy: GroupTrashSortBy,
  order: SortOrder,
): CollapsedGroupConversation[] {
  const dir = order === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    let cmp = 0;
    if (sortBy === "start") {
      cmp = a.dateStart.localeCompare(b.dateStart);
    } else if (sortBy === "end") {
      cmp = a.dateEnd.localeCompare(b.dateEnd);
    } else if (sortBy === "people") {
      cmp = a.participantCount - b.participantCount;
    } else {
      cmp = a.messageCount - b.messageCount;
    }
    if (cmp !== 0) return cmp * dir;
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
}

function searchCollapsedGroups(
  items: CollapsedGroupConversation[],
  query: string,
): CollapsedGroupConversation[] {
  if (!query.trim()) return items;
  const asRows: GroupYearRow[] = items.map((c) => ({
    id: c.conversationId,
    year: c.newestYear,
    title: c.title,
    titleFull: c.titleFull || c.title,
    namedTitle: c.namedTitle,
    participantCount: c.participantCount,
    participantNames: c.participantNames,
    participantHandles: c.participantHandles,
    participants: c.participants,
    messageCount: c.messageCount,
    dateStart: c.dateStart,
    dateEnd: c.dateEnd,
    conversationDateStart: c.dateStart,
    conversationDateEnd: c.dateEnd,
    spansMultipleYears: c.dateStart !== c.dateEnd,
  }));
  const hits = searchGroups(asRows, query);
  const byId = new Map(items.map((c) => [c.conversationId, c]));
  const out: CollapsedGroupConversation[] = [];
  const seen = new Set<number>();
  for (const h of hits) {
    if (seen.has(h.id)) continue;
    seen.add(h.id);
    const item = byId.get(h.id);
    if (item) out.push(item);
  }
  return out;
}

export function GroupChatsShell({
  groupChats: initialGroupChats,
  initialConversationId,
  initialYear,
  trashTabBar = null,
}: {
  groupChats: GroupYearRow[];
  initialConversationId: number | null;
  initialYear: number | null;
  trashTabBar?: ReactNode;
}) {
  const router = useRouter();

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const vaultReadOnly = useVaultReadOnly();
  const { clear: clearHistory } = useHistory();
  const { sourceQuery } = useSourceFilter();
  const [groupChats, setGroupChats] = useState(initialGroupChats);
  const [conversationId, setConversationId] = useState<number | null>(
    initialConversationId,
  );
  const [focusYear, setFocusYear] = useState<number | null>(initialYear);
  const [status, setStatus] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  /** null = All years */
  const [filterYear, setFilterYear] = useState<number | null>(null);
  const [groupDateFormat, setGroupDateFormat] = usePersistedEnum(
    GROUP_DATE_FORMAT_KEY,
    GROUP_DATE_ALLOWED,
    "md",
  );
  const [groupSidebarSortBy, setGroupSidebarSortBy] = usePersistedEnum(
    GROUP_SIDEBAR_SORT_BY_KEY,
    GROUP_SIDEBAR_SORT_BY_ALLOWED,
    "end",
  );
  const [groupSidebarSortOrder, setGroupSidebarSortOrder] = usePersistedEnum(
    GROUP_SIDEBAR_SORT_ORDER_KEY,
    SORT_ORDER_ALLOWED,
    "desc",
  );
  const setGroupSidebarSort = useCallback(
    (next: { sortBy: GroupTrashSortBy; order: SortOrder }) => {
      setGroupSidebarSortBy(next.sortBy);
      setGroupSidebarSortOrder(next.order);
    },
    [setGroupSidebarSortBy, setGroupSidebarSortOrder],
  );
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    conversationId: number;
  } | null>(null);
  const storage = usePanelLayoutStorage();
  const trashSideLayout = useDefaultLayout({
    id: "mv-trash-groups-side",
    panelIds: ["list", "messages"],
    storage,
  });
  const messagesPaneRef = useRef<HTMLElement>(null);
  const pendingScrollYearRef = useRef<number | null>(initialYear);
  const ctxMenuRef = useRef<HTMLDivElement>(null);

  const years = useMemo(() => {
    const set = new Set<number>();
    for (const g of groupChats) set.add(g.year);
    return [...set].sort((a, b) => b - a);
  }, [groupChats]);

  useEffect(() => {
    if (filterYear == null) return;
    if (!years.includes(filterYear)) setFilterYear(null);
  }, [years, filterYear]);

  const yearScoped = useMemo(
    () =>
      filterYear == null
        ? groupChats
        : groupChats.filter((g) => g.year === filterYear),
    [groupChats, filterYear],
  );

  const collapsed = useMemo(
    () => collapseGroupYearRows(yearScoped),
    [yearScoped],
  );

  const sidebarListItems = useMemo(
    () =>
      sortTrashGroups(
        searchCollapsedGroups(collapsed, query),
        groupSidebarSortBy,
        groupSidebarSortOrder,
      ),
    [collapsed, query, groupSidebarSortBy, groupSidebarSortOrder],
  );

  const uniqueIds = useMemo(
    () => sidebarListItems.map((g) => g.conversationId),
    [sidebarListItems],
  );

  const validIds = useMemo(
    () => collapsed.map((g) => g.conversationId),
    [collapsed],
  );

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
    rowClickMode: "alwaysOpen",
    checkboxEvents: "stopOnly",
    escapeToClear: true,
    escapeBlocked: () => ctxMenu != null,
    selectAllSetsAnchor: false,
  });


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

  const { messages, loading, setMessages } = useThreadMessages({
    conversationIds: conversationId != null ? [conversationId] : null,
    year: focusYear,
    sourceQuery,
    enabled: !multiSelected,
  });

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
    dismissOnPointerLeave: 0,
  });

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
    [conversationId, pathname, router, searchParams, setMessages, setSelectedIds],
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

  const groupTrash = useMemo(
    () =>
      createGroupChatTrashOptions({
        conversationSpansMultipleYears,
      }),
    [conversationSpansMultipleYears],
  );

  const {
    saving,
    restoreFromTrash,
    permanentlyDeleteFromTrash,
    confirmDialog,
  } = useTrashActions<number>({
    endpoint: groupTrash.endpoint,
    idField: groupTrash.idField,
    getTargets: getTrashTargets,
    canTrash: false,
    canRestoreOrDelete: true,
    confirmTrash: groupTrash.confirmTrash,
    confirmPermanent: groupTrash.confirmPermanent,
    status: groupTrash.status,
    setStatus,
    onRemoved: clearFocusAfterRemoval,
    onDismissMenus: () => setCtxMenu(null),
    afterPermanent: () => {
      clearHistory();
      router.refresh();
    },
  });

  const onSidebarListRowClick = useCallback(
    (g: CollapsedGroupConversation, e: MouseEvent) => {
      if (
        !e.shiftKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        selectedIds.size === 0
      ) {
        const year = filterYear ?? g.newestYear;
        setSelectedIds(new Set());
        selectionAnchorRef.current = g.conversationId;
        setConversationId(g.conversationId);
        setFocusYear(year);
        setMessages([]);
        pendingScrollYearRef.current = year;
        const params = new URLSearchParams(searchParams.toString());
        params.set("g", String(g.conversationId));
        params.set("y", String(year));
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        return;
      }
      onRowClickId(g.conversationId, e);
    },
    [
      filterYear,
      onRowClickId,
      pathname,
      router,
      searchParams,
      selectedIds.size,
      selectionAnchorRef,
      setMessages,
      setSelectedIds,
    ],
  );

  const yearFilterMenu = (
    <YearFilterMenu
      years={years}
      value={filterYear}
      onChange={setFilterYear}
    />
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
    const target = matches[matches.length - 1] as HTMLElement | undefined;
    if (target) {
      requestAnimationFrame(() => {
        const delta =
          target.getBoundingClientRect().top - pane.getBoundingClientRect().top;
        pane.scrollTop += delta;
      });
    }
    pendingScrollYearRef.current = null;
  }, [loading, messages, focusYear, multiSelected]);

  const participantForm = useParticipantContactForm({
    vaultReadOnly: !!vaultReadOnly,
    setStatus,
  });

  const messagesPane = (
    <GroupChatsMessagesPane
      messagesPaneRef={messagesPaneRef}
      multiSelected={multiSelected}
      selectedIds={selectedIds}
      selectedRow={selectedRow}
      focusYear={focusYear}
      loading={loading}
      messages={messages}
      conversationSelected={conversationId != null}
      prominentHeader
      onParticipantClick={
        vaultReadOnly ? undefined : participantForm.onParticipantClick
      }
    />
  );

  return (
    <>
      <div className="flex h-full min-h-0 w-full flex-col bg-bg">
        <div className="min-h-0 flex-1">
          <Group
            id="mv-trash-groups-side"
            orientation="horizontal"
            className="h-full w-full"
            defaultLayout={trashSideLayout.defaultLayout}
            onLayoutChanged={trashSideLayout.onLayoutChanged}
          >
            <Panel
              id="list"
              defaultSize={320}
              minSize={200}
              maxSize="70%"
              className="min-h-0"
            >
              <div className="flex h-full min-h-0 w-full flex-col bg-sidebar">
                <TrashListChrome
                  variant="trash"
                  tabBar={
                    <>
                      {trashTabBar}
                      {yearFilterMenu}
                    </>
                  }
                  selectAllRef={selectAllRef}
                  allSelected={allSelected}
                  selectedCount={selectedIds.size}
                  itemCount={sidebarListItems.length}
                  query={query}
                  onQueryChange={setQuery}
                  saving={saving}
                  canDeleteForever={actionTargets.length > 0}
                  onToggleSelectAll={toggleSelectAll}
                  onDeleteForever={() => void permanentlyDeleteFromTrash()}
                  selectAllLabel="Select all trashed groups"
                  sort={{
                    kind: "groups",
                    sortBy: groupSidebarSortBy,
                    order: groupSidebarSortOrder,
                    onChange: (next) =>
                      setGroupSidebarSort({
                        sortBy: next.sortBy as GroupTrashSortBy,
                        order: next.order,
                      }),
                  }}
                />
                <div className="min-h-0 flex-1">
                  <TrashGroupChatList
                    items={sidebarListItems}
                    conversationId={conversationId}
                    selectedIds={selectedIds}
                    query={query}
                    groupDateFormat={groupDateFormat}
                    onSelectColumnClick={onSelectColumnClick}
                    onRowClick={onSidebarListRowClick}
                    onOpenCtxMenu={openCtxMenu}
                    emptyLabel="No trashed group messages"
                  />
                </div>
              </div>
            </Panel>

            <PaneSeparator orientation="vertical" />

            <Panel id="messages" minSize="30%" className="min-h-0 min-w-0">
              {messagesPane}
            </Panel>
          </Group>
        </div>
      </div>

      {ctxMenu && (
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
            Delete forever
          </button>
        </div>
      )}
      {confirmDialog}
      <ParticipantContactFormOverlay
        form={participantForm}
        titleId="mv-group-contact-form-title"
      />
    </>
  );
}
