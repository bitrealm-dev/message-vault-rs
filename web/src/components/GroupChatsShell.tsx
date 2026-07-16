"use client";

import type { GroupParticipant, GroupYearRow } from "@/lib/types";
import { searchGroups } from "@/lib/groupSearch";
import { GROUP_DATE_FORMAT_KEY } from "@/lib/groupDateFormat";
import { phoneHandlesOnly } from "@/lib/handleKind";
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
import {
  draftHasName,
  emptyContactEditDraft,
  phonesForSave,
  seedContactEditDraft,
  type ContactEditDraft,
} from "./contactEdit";
import { ContactDetailsCard } from "./ContactDetailsCard";
import { GroupChatsListPane } from "./GroupChatsListPane";
import { GroupChatsMessagesPane } from "./GroupChatsMessagesPane";
import { GroupsMenu, type GroupCheckState } from "./GroupsMenu";
import { TrashListChrome } from "./TrashListChrome";
import {
  collapseGroupConversations,
  TrashGroupChatList,
  type TrashGroupConversation,
} from "./TrashGroupChatList";
import {
  type GroupTrashSortBy,
  type SortOrder,
} from "./SortByMenu";
import { YearFilterMenu } from "./YearFilterMenu";
import { useHistory, ListHistoryMenu } from "./history";
import { useSourceFilter } from "./SourceFilter";
import { useDismissible } from "./useDismissible";
import { useListSelection } from "./useListSelection";
import { usePersistedEnum } from "./usePersistedEnum";
import { PaneSeparator } from "./PaneSeparator";
import { usePanelLayoutStorage } from "./panelLayoutStorage";
import { useThreadMessages } from "./useThreadMessages";
import { useTrashActions } from "./useTrashActions";
import { useVaultReadOnly } from "./useVaultReadOnly";
import { Group, Panel, useDefaultLayout } from "react-resizable-panels";

const GROUP_DATE_ALLOWED = ["md", "mon-d", "d-mon"] as const;
const GROUP_SIDEBAR_SORT_BY_KEY = "mv-group-sidebar-sort-by";
const GROUP_SIDEBAR_SORT_ORDER_KEY = "mv-group-sidebar-sort-order";
const GROUP_SIDEBAR_SORT_BY_ALLOWED = [
  "start",
  "end",
  "people",
  "messages",
] as const;
const GROUP_SIDEBAR_SORT_ORDER_ALLOWED = ["asc", "desc"] as const;

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

function sortTrashGroups(
  items: TrashGroupConversation[],
  sortBy: GroupTrashSortBy,
  order: SortOrder,
): TrashGroupConversation[] {
  const dir = order === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    let cmp = 0;
    if (sortBy === "start") {
      cmp = a.conversationDateStart.localeCompare(b.conversationDateStart);
    } else if (sortBy === "end") {
      cmp = a.conversationDateEnd.localeCompare(b.conversationDateEnd);
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
  items: TrashGroupConversation[],
  query: string,
): TrashGroupConversation[] {
  if (!query.trim()) return items;
  const asRows: GroupYearRow[] = items.map((c) => ({
    id: c.id,
    year: c.newestYear,
    title: c.title,
    titleFull: c.title,
    namedTitle: c.namedTitle,
    participantCount: c.participantCount,
    participantNames: c.participantNames,
    participantHandles: c.participantHandles,
    participants: c.participants,
    messageCount: c.messageCount,
    dateStart: c.conversationDateStart,
    dateEnd: c.conversationDateEnd,
    conversationDateStart: c.conversationDateStart,
    conversationDateEnd: c.conversationDateEnd,
    spansMultipleYears: c.conversationDateStart !== c.conversationDateEnd,
  }));
  const hits = searchGroups(asRows, query);
  const byId = new Map(items.map((c) => [c.id, c]));
  const out: TrashGroupConversation[] = [];
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
  mode = "group-chats",
  trashTabBar = null,
  embedded = false,
  listLayout,
}: {
  groupChats: GroupYearRow[];
  initialConversationId: number | null;
  initialYear: number | null;
  mode?: "group-chats" | "trash";
  trashTabBar?: ReactNode;
  /** @deprecated Prefer listLayout="sidebar". */
  embedded?: boolean;
  /** years = stacked year table; sidebar = collapsed list | messages. */
  listLayout?: "years" | "sidebar";
}) {
  const router = useRouter();

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const vaultReadOnly = useVaultReadOnly();
  const { push: pushHistory, clear: clearHistory } = useHistory();
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
  const [editContactId, setEditContactId] = useState<number | null>(null);
  const [contactCreating, setContactCreating] = useState(false);
  const [editDraft, setEditDraft] = useState<ContactEditDraft | null>(null);
  const [extraDraftGroups, setExtraDraftGroups] = useState<string[]>([]);
  const [contactSaving, setContactSaving] = useState(false);
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
    GROUP_SIDEBAR_SORT_ORDER_ALLOWED,
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
  const threadsLayout = useDefaultLayout({
    id: "mv-group-chats-threads",
    panelIds: ["list", "messages"],
    storage,
  });
  const trashSideLayout = useDefaultLayout({
    id: mode === "trash" ? "mv-trash-groups-side" : "mv-group-chats-2-side",
    panelIds: ["list", "messages"],
    storage,
  });
  const messagesPaneRef = useRef<HTMLElement>(null);
  const pendingScrollYearRef = useRef<number | null>(initialYear);
  const ctxMenuRef = useRef<HTMLDivElement>(null);

  const sidebarLayout =
    listLayout === "sidebar" || (listLayout == null && embedded);

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
    () => collapseGroupConversations(yearScoped),
    [yearScoped],
  );

  const sidebarListItems = useMemo(() => {
    if (!sidebarLayout) return [] as TrashGroupConversation[];
    return sortTrashGroups(
      searchCollapsedGroups(collapsed, query),
      groupSidebarSortBy,
      groupSidebarSortOrder,
    );
  }, [
    sidebarLayout,
    collapsed,
    query,
    groupSidebarSortBy,
    groupSidebarSortOrder,
  ]);

  const filtered = useMemo(
    () => searchGroups(yearScoped, query),
    [yearScoped, query],
  );

  /** Unique conversation ids in filtered list order (first appearance). */
  const uniqueIds = useMemo(() => {
    if (sidebarLayout) return sidebarListItems.map((g) => g.id);
    const ids: number[] = [];
    const seen = new Set<number>();
    for (const g of filtered) {
      if (seen.has(g.id)) continue;
      seen.add(g.id);
      ids.push(g.id);
    }
    return ids;
  }, [sidebarLayout, sidebarListItems, filtered]);

  const validIds = useMemo(() => {
    if (sidebarLayout) return collapsed.map((g) => g.id);
    return groupChats.map((g) => g.id);
  }, [sidebarLayout, collapsed, groupChats]);

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
    rowClickMode: sidebarLayout
      ? "alwaysOpen"
      : "openWhenEmptyElseToggleIfSelected",
    checkboxEvents: "stopOnly",
    escapeToClear: true,
    escapeBlocked: () => ctxMenu != null,
    selectAllSetsAnchor: false,
  });

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

  const {
    saving,
    moveToTrash,
    restoreFromTrash,
    permanentlyDeleteFromTrash,
    confirmDialog,
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
      if (targets.length === 1) return "Delete forever?";
      return `Delete ${targets.length} group chats forever?`;
    },
    status: {
      trashedOne: "Moved to Trash",
      trashedMany: (n) => `Moved ${n} to Trash`,
      restoredOne: "Undeleted — back in Group Chats",
      restoredMany: (n) => `Undeleted ${n} group chats`,
      deletedOne: "Deleted forever",
      deletedMany: (n) => `Deleted ${n} group chats forever`,
    },
    setStatus,
    onRemoved: clearFocusAfterRemoval,
    onDismissMenus: () => setCtxMenu(null),
    afterTrash: () => {
      if (sidebarLayout && mode === "group-chats") {
        router.refresh();
        return;
      }
      router.push("/trash?tab=group-chats");
    },
    onTrashed: (ids) => {
      pushHistory({
        type: "trashGroupThread",
        conversationIds: ids,
        label:
          ids.length === 1
            ? "Delete group chat"
            : `Delete ${ids.length} group chats`,
      });
    },
    afterPermanent: () => {
      clearHistory();
      router.refresh();
    },
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

  const onYearRowClick = useCallback(
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

  const onSidebarListRowClick = useCallback(
    (g: TrashGroupConversation, e: MouseEvent) => {
      if (
        !e.shiftKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        selectedIds.size === 0
      ) {
        const year = filterYear ?? g.newestYear;
        setSelectedIds(new Set());
        selectionAnchorRef.current = g.id;
        setConversationId(g.id);
        setFocusYear(year);
        setMessages([]);
        pendingScrollYearRef.current = year;
        const params = new URLSearchParams(searchParams.toString());
        params.set("g", String(g.id));
        params.set("y", String(year));
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        return;
      }
      onRowClickId(g.id, e);
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

  const activeKey =
    conversationId != null && focusYear != null && !multiSelected
      ? `${conversationId}-${focusYear}`
      : null;

  const formOpen = (editContactId != null || contactCreating) && !!editDraft;
  const canSaveForm =
    !!editDraft &&
    draftHasName(editDraft) &&
    phoneHandlesOnly(phonesForSave(editDraft.phones)).length > 0;

  const draftMenuGroups = useMemo(() => {
    const names = new Set([...extraDraftGroups]);
    for (const g of editDraft?.contactGroups ?? []) names.add(g);
    return [...names].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [extraDraftGroups, editDraft?.contactGroups]);

  const draftGroupChecks = useMemo(() => {
    const result: Record<string, GroupCheckState> = {};
    const groups = editDraft?.contactGroups ?? [];
    for (const name of draftMenuGroups) {
      result[name] = groups.includes(name) ? "on" : "off";
    }
    return result;
  }, [draftMenuGroups, editDraft?.contactGroups]);

  const draftExcludedCheck = useMemo((): GroupCheckState => {
    return editDraft?.exclude ? "on" : "off";
  }, [editDraft?.exclude]);

  const cancelContactForm = useCallback(() => {
    setEditContactId(null);
    setContactCreating(false);
    setEditDraft(null);
    setExtraDraftGroups([]);
  }, []);

  useEffect(() => {
    if (!formOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (!contactSaving) cancelContactForm();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [formOpen, contactSaving, cancelContactForm]);

  const toggleDraftGroup = useCallback((name: string) => {
    setEditDraft((prev) => {
      if (!prev) return prev;
      const has = prev.contactGroups.includes(name);
      const contactGroups = has
        ? prev.contactGroups.filter((g) => g !== name)
        : [...prev.contactGroups, name].sort((a, b) =>
            a.localeCompare(b, undefined, { sensitivity: "base" }),
          );
      return { ...prev, contactGroups };
    });
  }, []);

  const createAndAssignDraftGroup = useCallback((name: string) => {
    setExtraDraftGroups((prev) =>
      prev.includes(name) ? prev : [...prev, name],
    );
    setEditDraft((prev) => {
      if (!prev) return prev;
      if (prev.contactGroups.includes(name)) return prev;
      return {
        ...prev,
        contactGroups: [...prev.contactGroups, name].sort((a, b) =>
          a.localeCompare(b, undefined, { sensitivity: "base" }),
        ),
      };
    });
  }, []);

  const toggleDraftExcluded = useCallback(() => {
    setEditDraft((prev) =>
      prev ? { ...prev, exclude: !prev.exclude } : prev,
    );
  }, []);

  const clearDraftGroups = useCallback(() => {
    setEditDraft((prev) =>
      prev ? { ...prev, contactGroups: [], exclude: false } : prev,
    );
  }, []);

  const openEditContact = useCallback(async (id: number) => {
    setContactSaving(true);
    try {
      const res = await fetch(`/api/contacts/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "load failed");
      setExtraDraftGroups([]);
      setEditDraft(seedContactEditDraft(data.contact));
      setEditContactId(id);
      setContactCreating(false);
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : "Failed to load contact");
    } finally {
      setContactSaving(false);
    }
  }, []);

  const openCreateContactWithHandle = useCallback((handle: string) => {
    setExtraDraftGroups([]);
    setEditContactId(null);
    setContactCreating(true);
    const draft = emptyContactEditDraft();
    setEditDraft({ ...draft, phones: [handle, ""] });
  }, []);

  const onParticipantClick = useCallback(
    (participant: GroupParticipant) => {
      if (vaultReadOnly || contactSaving || formOpen) return;
      if (participant.contactId != null) {
        void openEditContact(participant.contactId);
        return;
      }
      openCreateContactWithHandle(participant.handle);
    },
    [
      vaultReadOnly,
      contactSaving,
      formOpen,
      openEditContact,
      openCreateContactWithHandle,
    ],
  );

  const saveContactEdit = useCallback(async () => {
    if (!editDraft || editContactId == null) return;
    setContactSaving(true);
    try {
      const res = await fetch(`/api/contacts/${editContactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: editDraft.firstName.trim() || null,
          lastName: editDraft.lastName.trim() || null,
          phones: phonesForSave(editDraft.phones),
          exclude: editDraft.exclude,
          contactGroups: editDraft.contactGroups,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "save failed");
      cancelContactForm();
      router.refresh();
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : "Save failed");
    } finally {
      setContactSaving(false);
    }
  }, [editDraft, editContactId, cancelContactForm, router]);

  const saveContactCreate = useCallback(async () => {
    if (!editDraft || !draftHasName(editDraft)) return;
    setContactSaving(true);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: editDraft.firstName.trim() || null,
          lastName: editDraft.lastName.trim() || null,
          phones: phonesForSave(editDraft.phones),
          exclude: editDraft.exclude,
          contactGroups: editDraft.contactGroups,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "create failed");
      cancelContactForm();
      router.refresh();
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : "Create failed");
    } finally {
      setContactSaving(false);
    }
  }, [editDraft, cancelContactForm, router]);

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
      prominentHeader={sidebarLayout}
      onParticipantClick={
        vaultReadOnly ? undefined : onParticipantClick
      }
    />
  );

  return (
    <>
      <div className="flex h-full min-h-0 w-full flex-col bg-bg">
        <div className="min-h-0 flex-1">
          {sidebarLayout ? (
            <Group
              id={
                mode === "trash"
                  ? "mv-trash-groups-side"
                  : "mv-group-chats-2-side"
              }
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
                    variant={mode === "trash" ? "trash" : "active"}
                    tabBar={
                      <>
                        {mode === "trash" ? trashTabBar : null}
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
                    onDeleteForever={() =>
                      void (mode === "trash"
                        ? permanentlyDeleteFromTrash()
                        : moveToTrash())
                    }
                    selectAllLabel={
                      mode === "trash"
                        ? "Select all trashed groups"
                        : "Select all groups"
                    }
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
                    trailing={
                      mode === "group-chats" ? <ListHistoryMenu /> : null
                    }
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
                      onOpenCtxMenu={
                        mode === "trash" ? openCtxMenu : undefined
                      }
                      emptyLabel={
                        mode === "trash"
                          ? "No trashed group chats"
                          : "No group chats"
                      }
                    />
                  </div>
                </div>
              </Panel>

              <PaneSeparator orientation="vertical" />

              <Panel id="messages" minSize="30%" className="min-h-0 min-w-0">
                {messagesPane}
              </Panel>
            </Group>
          ) : (
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
                  trashTabBar={trashTabBar}
                  embedded={false}
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
                  filterYear={filterYear}
                  onFilterYearChange={setFilterYear}
                  groupDateFormat={groupDateFormat}
                  onGroupDateFormatChange={setGroupDateFormat}
                  onMoveToTrash={() => void moveToTrash()}
                  onRestore={() => void restoreFromTrash()}
                  onPermanentDelete={() => void permanentlyDeleteFromTrash()}
                  rowsByYear={rowsByYear}
                  activeKey={activeKey}
                  selectedIds={selectedIds}
                  onSelectColumnClick={onSelectColumnClick}
                  onRowClick={onYearRowClick}
                  onOpenCtxMenu={openCtxMenu}
                />
              </Panel>

              <PaneSeparator orientation="horizontal" />

              <Panel id="messages" minSize="25%" className="min-h-0">
                {messagesPane}
              </Panel>
            </Group>
          )}
        </div>
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
            Delete forever
          </button>
        </div>
      )}
      {confirmDialog}
      {formOpen && editDraft && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 px-4"
          role="presentation"
          onClick={() => {
            if (!contactSaving) cancelContactForm();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="mv-group-contact-form-title"
            className="w-full max-w-lg rounded-xl border border-border bg-[#2c2c2e] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.5)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="mv-group-contact-form-title"
              className="text-[16px] font-semibold text-text"
            >
              {contactCreating ? "Add new contact" : "Edit contact"}
            </h2>
            <div className="mt-4">
              <ContactDetailsCard
                formOpen
                framed={false}
                draft={editDraft}
                onDraftChange={setEditDraft}
                groups={editDraft.contactGroups}
                excluded={editDraft.exclude}
                phonesView={[]}
                groupsEditor={
                  <GroupsMenu
                    labeled
                    allGroups={draftMenuGroups}
                    checks={draftGroupChecks}
                    excludedCheck={draftExcludedCheck}
                    disabled={contactSaving}
                    onToggle={toggleDraftGroup}
                    onToggleExcluded={toggleDraftExcluded}
                    onCreate={createAndAssignDraftGroup}
                    onClearAll={clearDraftGroups}
                  />
                }
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={contactSaving}
                onClick={cancelContactForm}
                className="rounded-md bg-elevated px-3 py-1.5 text-[13px] text-text transition-colors hover:bg-white/14 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  contactSaving || (contactCreating && !canSaveForm)
                }
                onClick={() =>
                  void (contactCreating
                    ? saveContactCreate()
                    : saveContactEdit())
                }
                className="rounded-md bg-accent/25 px-3 py-1.5 text-[13px] font-medium text-text transition-colors hover:bg-accent/35 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
