"use client";

import type {
  GroupChatThread,
  GroupParticipant,
  GroupYearRow,
  MessageRow,
  YearThread,
} from "@/lib/types";
import type { VaultOwner } from "@/lib/vaultOwner";
import { GROUP_DATE_FORMAT_KEY } from "@/lib/groupDateFormat";
import { phoneHandlesOnly } from "@/lib/handleKind";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Group, Panel, useDefaultLayout } from "react-resizable-panels";
import {
  draftHasName,
  emptyContactEditDraft,
  phonesForSave,
  seedContactEditDraft,
  type ContactEditDraft,
} from "./contactEdit";
import {
  BrowseGroupChatsPane,
  collapseContactGroupChats,
  type ContactGroupConversation,
} from "./BrowseGroupChatsPane";
import { BrowseThreadPane } from "./BrowseThreadPane";
import { ContactDetailsCard } from "./ContactDetailsCard";
import {
  ContactFormOverlay,
  contactFormAnchorFromRect,
  type ContactFormAnchor,
} from "./ContactFormOverlay";
import { GroupsMenu, type GroupCheckState } from "./GroupsMenu";
import { MyContactPane } from "./MyContactPane";
import { PaneSeparator } from "./PaneSeparator";
import { usePanelLayoutStorage } from "./panelLayoutStorage";
import {
  type BrowseGroupChatSortBy,
  type SortOrder,
} from "./SortByMenu";
import { useHistory } from "./history";
import { useListSelection } from "./useListSelection";
import { usePersistedEnum } from "./usePersistedEnum";
import { useSourceFilter } from "./SourceFilter";
import { useTrashActions } from "./useTrashActions";
import { useVaultReadOnly } from "./useVaultReadOnly";

const GROUP_CHAT_SORT_KEY = "mv-group-messages-chat-sort";
const GROUP_CHAT_SORT_ORDER_KEY = "mv-group-messages-chat-sort-order";
const GROUP_CHAT_SORT_ALLOWED = ["date", "messages", "people"] as const;
const SORT_ORDER_ALLOWED = ["asc", "desc"] as const;
const GROUP_DATE_ALLOWED = ["md", "mon-d", "d-mon"] as const;

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

function groupYearRowsToThreads(rows: GroupYearRow[]): GroupChatThread[] {
  return rows.map((r) => ({
    conversationId: r.id,
    conversationIds: [r.id],
    title: r.title,
    titleFull: r.titleFull,
    namedTitle: r.namedTitle,
    participantCount: r.participantCount,
    participantNames: r.participantNames,
    participantHandles: r.participantHandles,
    participants: r.participants,
    year: r.year,
    messageCount: r.messageCount,
    dateStart: r.dateStart,
    dateEnd: r.dateEnd,
  }));
}

export function GroupMessagesShell({
  owner,
  groupChats: initialGroupChats,
  initialConversationId,
  initialYear,
}: {
  owner: VaultOwner;
  groupChats: GroupYearRow[];
  initialConversationId: number | null;
  initialYear: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const vaultReadOnly = useVaultReadOnly() === true;
  const { push: pushHistory } = useHistory();
  const { sources, source, setSource, sourceQuery } = useSourceFilter();

  const [groupChats, setGroupChats] = useState(initialGroupChats);
  const [conversationId, setConversationId] = useState<number | null>(
    initialConversationId,
  );
  const [focusYear, setFocusYear] = useState<number | null>(initialYear);
  const [status, setStatus] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filterYear, setFilterYear] = useState<number | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [activeThread, setActiveThread] = useState<string | null>(
    initialConversationId != null ? `gfull-${initialConversationId}` : null,
  );

  const [editContactId, setEditContactId] = useState<number | null>(null);
  const [contactCreating, setContactCreating] = useState(false);
  const [editDraft, setEditDraft] = useState<ContactEditDraft | null>(null);
  const [formAnchor, setFormAnchor] = useState<ContactFormAnchor | null>(null);
  const [extraDraftGroups, setExtraDraftGroups] = useState<string[]>([]);
  const [contactSaving, setContactSaving] = useState(false);

  const [groupDateFormat] = usePersistedEnum(
    GROUP_DATE_FORMAT_KEY,
    GROUP_DATE_ALLOWED,
    "md",
  );
  const [groupChatSortBy, setGroupChatSortBy] = usePersistedEnum(
    GROUP_CHAT_SORT_KEY,
    GROUP_CHAT_SORT_ALLOWED,
    "date",
  );
  const [groupChatSortOrder, setGroupChatSortOrder] = usePersistedEnum(
    GROUP_CHAT_SORT_ORDER_KEY,
    SORT_ORDER_ALLOWED,
    "desc",
  );
  const setGroupChatSort = useCallback(
    (next: { sortBy: BrowseGroupChatSortBy; order: SortOrder }) => {
      setGroupChatSortBy(next.sortBy);
      setGroupChatSortOrder(next.order);
    },
    [setGroupChatSortBy, setGroupChatSortOrder],
  );

  const storage = usePanelLayoutStorage();
  const mainLayout = useDefaultLayout({
    id: "mv-group-messages-main",
    panelIds: ["list", "groups", "thread"],
    storage,
  });

  const pendingScrollYearRef = useRef<number | null>(initialYear);

  useEffect(() => {
    setGroupChats(initialGroupChats);
    if (
      conversationId != null &&
      !initialGroupChats.some((g) => g.id === conversationId)
    ) {
      setConversationId(null);
      setFocusYear(null);
      setActiveThread(null);
      setMessages([]);
    }
  }, [initialGroupChats, conversationId]);

  const years = useMemo(() => {
    const set = new Set<number>();
    for (const g of groupChats) set.add(g.year);
    return [...set].sort((a, b) => b - a);
  }, [groupChats]);

  useEffect(() => {
    if (filterYear == null) return;
    if (!years.includes(filterYear)) setFilterYear(null);
  }, [years, filterYear]);

  const panelThreads = useMemo(
    () => groupYearRowsToThreads(groupChats),
    [groupChats],
  );

  const collapsedGroupChats = useMemo(() => {
    const filtered =
      filterYear == null
        ? panelThreads
        : panelThreads.filter((g) => g.year === filterYear);
    let items = collapseContactGroupChats(filtered);
    const q = query.trim().toLowerCase();
    if (q) {
      const qDigits = q.replace(/\D/g, "");
      items = items.filter((g) => {
        if (g.namedTitle && g.namedTitle.toLowerCase().includes(q)) return true;
        if (g.participantNames.some((n) => n.toLowerCase().includes(q))) {
          return true;
        }
        if (g.participantHandles.some((h) => h.toLowerCase().includes(q))) {
          return true;
        }
        if (qDigits.length > 0) {
          return g.participantHandles.some((h) =>
            h.replace(/\D/g, "").includes(qDigits),
          );
        }
        return false;
      });
    }
    items.sort((a, b) => {
      let cmp = 0;
      if (groupChatSortBy === "messages") {
        cmp = a.messageCount - b.messageCount;
      } else if (groupChatSortBy === "people") {
        cmp = a.participantCount - b.participantCount;
      } else {
        cmp = a.dateEnd.localeCompare(b.dateEnd);
      }
      return groupChatSortOrder === "desc" ? -cmp : cmp;
    });
    return items;
  }, [panelThreads, filterYear, query, groupChatSortBy, groupChatSortOrder]);

  const orderedGroupIds = useMemo(
    () => collapsedGroupChats.map((g) => g.conversationId),
    [collapsedGroupChats],
  );
  const collapsedById = useMemo(() => {
    const map = new Map<number, ContactGroupConversation>();
    for (const g of collapsedGroupChats) map.set(g.conversationId, g);
    return map;
  }, [collapsedGroupChats]);

  const selectGroupRef = useRef<(id: number) => void>(() => {});

  const {
    selectedIds,
    setSelectedIds,
    hasSelection: hasGroupSelection,
    allSelected,
    selectAllRef,
    toggleSelectAll,
    onSelectColumnClick,
    onRowClick: onGroupRowClick,
  } = useListSelection<number>({
    orderedIds: orderedGroupIds,
    validIds: orderedGroupIds,
    rangeMode: "selectionSpan",
    multiThreshold: "any",
    focusedId: conversationId,
    rowClickMode: "openWhenEmptyElseToggle",
    checkboxEvents: "preventAndStop",
    escapeToClear: true,
    selectAllSetsAnchor: false,
    onOpen: (id) => selectGroupRef.current(id),
  });

  const loadFullMessages = useCallback(
    (conversationIds: number[], key: string) => {
      setActiveThread(key);
      setLoadingMessages(true);
      const ids = conversationIds.join(",");
      fetch(`/api/messages?conversationIds=${ids}${sourceQuery}`)
        .then((r) => r.json())
        .then((data) => setMessages(data.messages ?? []))
        .finally(() => setLoadingMessages(false));
    },
    [sourceQuery],
  );

  const syncUrl = useCallback(
    (id: number | null, year: number | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id == null) {
        params.delete("g");
        params.delete("y");
      } else {
        params.set("g", String(id));
        if (year != null) params.set("y", String(year));
        else params.delete("y");
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const selectGroupConversation = useCallback(
    (g: ContactGroupConversation) => {
      if (!hasGroupSelection && conversationId === g.conversationId) {
        setConversationId(null);
        setFocusYear(null);
        setActiveThread(null);
        setMessages([]);
        syncUrl(null, null);
        return;
      }
      const year = filterYear ?? g.newestYear;
      setConversationId(g.conversationId);
      setFocusYear(year);
      pendingScrollYearRef.current = year;
      syncUrl(g.conversationId, year);
      const key = `gfull-${g.conversationIds.join("-")}`;
      loadFullMessages(g.conversationIds, key);
    },
    [
      hasGroupSelection,
      conversationId,
      filterYear,
      syncUrl,
      loadFullMessages,
    ],
  );

  const openGroupById = useCallback(
    (id: number) => {
      const g = collapsedById.get(id);
      if (!g) return;
      selectGroupConversation(g);
    },
    [collapsedById, selectGroupConversation],
  );
  selectGroupRef.current = openGroupById;

  // Hydrate initial / corrected focus year from URL.
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
    syncUrl(conversationId, nextYear);
  }, [groupChats, conversationId, focusYear, syncUrl]);

  // Load messages when conversation is set (incl. initial URL).
  useEffect(() => {
    if (conversationId == null || hasGroupSelection) return;
    loadFullMessages([conversationId], `gfull-${conversationId}`);
  }, [conversationId, hasGroupSelection, sourceQuery, loadFullMessages]);

  useEffect(() => {
    if (!hasGroupSelection) return;
    setActiveThread(null);
    setMessages([]);
  }, [hasGroupSelection]);

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
        setActiveThread(null);
        setMessages([]);
        syncUrl(null, null);
      }
    },
    [conversationId, setSelectedIds, syncUrl],
  );

  const conversationSpansMultipleYears = useCallback(
    (id: number) =>
      groupChats.some((g) => g.id === id && g.spansMultipleYears),
    [groupChats],
  );

  const actionTargets = useMemo(() => {
    if (hasGroupSelection) return [...selectedIds];
    if (conversationId != null) return [conversationId];
    return [];
  }, [hasGroupSelection, selectedIds, conversationId]);

  const getTrashTargets = useCallback(
    (forId?: number) => {
      const raw =
        forId != null && !hasGroupSelection ? [forId] : actionTargets;
      return [...new Set(raw)];
    },
    [actionTargets, hasGroupSelection],
  );

  const {
    saving,
    moveToTrash,
    confirmDialog,
  } = useTrashActions<number>({
    endpoint: "/api/group-chats/trash",
    idField: "conversationId",
    getTargets: getTrashTargets,
    canTrash: true,
    canRestoreOrDelete: false,
    confirmTrash: (targets) => {
      const multiYear =
        targets.length === 1 &&
        conversationSpansMultipleYears(targets[0]!);
      if (targets.length === 1) {
        return multiYear
          ? "Move this group message to Trash? It appears under multiple years and will be removed from all of them."
          : "Move this group message to Trash?";
      }
      return `Move ${targets.length} group messages to Trash? Each chat will be removed from every year it appears under.`;
    },
    confirmPermanent: () => "Delete forever?",
    status: {
      trashedOne: "Moved to Trash",
      trashedMany: (n) => `Moved ${n} to Trash`,
      restoredOne: "Undeleted — back in Group Messages",
      restoredMany: (n) => `Undeleted ${n} group messages`,
      deletedOne: "Deleted forever",
      deletedMany: (n) => `Deleted ${n} group messages forever`,
    },
    setStatus,
    onRemoved: clearFocusAfterRemoval,
    afterTrash: () => {
      router.refresh();
    },
    onTrashed: (ids) => {
      pushHistory({
        type: "trashGroupThread",
        conversationIds: ids,
        label:
          ids.length === 1
            ? "Delete group message"
            : `Delete ${ids.length} group messages`,
      });
    },
  });

  const canTrashGroups = actionTargets.length > 0 && !vaultReadOnly;

  const selectedGroup = useMemo(
    () =>
      conversationId != null
        ? (collapsedById.get(conversationId) ?? null)
        : null,
    [collapsedById, conversationId],
  );

  const groupThread = useMemo(() => {
    if (hasGroupSelection || !selectedGroup || !activeThread?.startsWith("gfull-")) {
      return null;
    }
    return {
      participants: [...(selectedGroup.participants ?? [])],
      dateStart: selectedGroup.dateStart,
      dateEnd: selectedGroup.dateEnd,
      messageCount: selectedGroup.messageCount,
    };
  }, [hasGroupSelection, selectedGroup, activeThread]);

  const yearly: YearThread[] = useMemo(() => {
    if (conversationId == null) return [];
    return groupChats
      .filter((g) => g.id === conversationId)
      .map((g) => ({
        year: g.year,
        messageCount: g.messageCount,
        attachmentCount: 0,
        dateStart: g.dateStart,
        dateEnd: g.dateEnd,
        conversationIds: [g.id],
      }))
      .sort((a, b) => a.year - b.year);
  }, [groupChats, conversationId]);

  const messageSources = useMemo(() => {
    const set = new Set<string>();
    for (const m of messages) {
      if (m.source) set.add(m.source);
    }
    return [...set];
  }, [messages]);

  const sourceCounts = useMemo(() => {
    const bySource: Record<string, number> = {};
    for (const m of messages) {
      if (!m.source) continue;
      bySource[m.source] = (bySource[m.source] ?? 0) + 1;
    }
    return { all: messages.length, bySource };
  }, [messages]);

  // Scroll to focus year after messages load (from URL `y`).
  useEffect(() => {
    const year = pendingScrollYearRef.current;
    if (year == null || loadingMessages || messages.length === 0) return;
    const el = document.querySelector(`#year-${year}`);
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ block: "start" });
      });
    }
    pendingScrollYearRef.current = null;
  }, [loadingMessages, messages]);

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
    setFormAnchor(null);
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

  const openEditContact = useCallback(
    async (id: number, anchor: ContactFormAnchor) => {
      setFormAnchor(anchor);
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
        setFormAnchor(null);
        setStatus(err instanceof Error ? err.message : "Failed to load contact");
      } finally {
        setContactSaving(false);
      }
    },
    [],
  );

  const openCreateContactWithHandle = useCallback(
    (handle: string, anchor: ContactFormAnchor) => {
      setFormAnchor(anchor);
      setExtraDraftGroups([]);
      setEditContactId(null);
      setContactCreating(true);
      const draft = emptyContactEditDraft();
      setEditDraft({ ...draft, phones: [handle, ""] });
    },
    [],
  );

  const onParticipantClick = useCallback(
    (participant: GroupParticipant, anchorRect: DOMRect) => {
      if (vaultReadOnly || contactSaving || formOpen) return;
      const anchor = contactFormAnchorFromRect(anchorRect);
      if (participant.contactId != null) {
        void openEditContact(participant.contactId, anchor);
        return;
      }
      openCreateContactWithHandle(participant.handle, anchor);
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

  const onGroupRowClickWrapped = useCallback(
    (
      id: number,
      e: MouseEvent | { shiftKey: boolean; metaKey?: boolean; ctrlKey?: boolean },
    ) => {
      onGroupRowClick(id, e);
    },
    [onGroupRowClick],
  );

  const selectedGroupRows = useMemo(
    () => collapsedGroupChats.filter((g) => selectedIds.has(g.conversationId)),
    [collapsedGroupChats, selectedIds],
  );

  return (
    <>
      <Group
        id="mv-group-messages-main"
        orientation="horizontal"
        className="h-full w-full"
        defaultLayout={mainLayout.defaultLayout}
        onLayoutChanged={mainLayout.onLayoutChanged}
      >
        <Panel
          id="list"
          defaultSize={280}
          minSize={200}
          maxSize={420}
          className="min-h-0"
        >
          <MyContactPane
            owner={owner}
            groupMessageCount={
              new Set(groupChats.map((g) => g.id)).size
            }
          />
        </Panel>

        <PaneSeparator orientation="vertical" />

        <Panel
          id="groups"
          defaultSize={360}
          minSize={180}
          maxSize={520}
          className="min-h-0"
        >
          <BrowseGroupChatsPane
            items={collapsedGroupChats}
            selectedConversationId={conversationId}
            selectedIds={selectedIds}
            selectAllRef={selectAllRef}
            allSelected={allSelected}
            onToggleSelectAll={toggleSelectAll}
            onSelectColumnClick={onSelectColumnClick}
            onRowClick={onGroupRowClickWrapped}
            onTrashMessages={() => void moveToTrash()}
            trashDisabled={!canTrashGroups || saving || contactSaving}
            vaultReadOnly={vaultReadOnly}
            years={years}
            filterYear={filterYear}
            onFilterYearChange={setFilterYear}
            sortBy={groupChatSortBy}
            sortOrder={groupChatSortOrder}
            onSortChange={setGroupChatSort}
            searchQuery={query}
            onSearchQueryChange={setQuery}
            groupDateFormat={groupDateFormat}
            emptyLabel={
              query.trim() ? "No matches" : "No group messages"
            }
          />
        </Panel>

        <PaneSeparator orientation="vertical" />

        <Panel id="thread" minSize="30%" className="min-h-0 min-w-0">
          <div className="flex h-full min-h-0 min-w-0 flex-col">
            <div className="flex h-[45px] shrink-0 items-center gap-2 border-b border-border px-5">
              <div className="flex min-w-0 flex-1 items-center justify-center" />
              {status && (
                <span className="shrink-0 truncate text-[12px] text-muted">
                  {status}
                </span>
              )}
            </div>
            {hasGroupSelection ? (
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-bg px-5 pt-8 pb-5">
                <div className="rounded-xl border border-border bg-[#2c2c2e] p-4">
                  <h2 className="text-[15px] font-semibold text-text">
                    {selectedGroupRows.length} group messages selected
                  </h2>
                  <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-[13px] text-muted">
                    {selectedGroupRows.map((g) => (
                      <li key={g.conversationId} className="truncate">
                        {g.title}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : conversationId == null ? (
              <p className="pt-16 text-center text-[13px] text-muted">
                Choose a group message
              </p>
            ) : (
              <div className="min-h-0 flex-1">
                <BrowseThreadPane
                  detail={null}
                  sources={sources}
                  messageSources={messageSources}
                  sourceCounts={sourceCounts}
                  source={source}
                  onSourceChange={setSource}
                  yearly={yearly}
                  messages={messages}
                  loadingMessages={loadingMessages}
                  threadsReady
                  activeThread={activeThread}
                  groupThread={groupThread}
                  onParticipantClick={
                    vaultReadOnly ? undefined : onParticipantClick
                  }
                />
              </div>
            )}
          </div>
        </Panel>
      </Group>

      {confirmDialog}
      {formOpen && editDraft && (
        <ContactFormOverlay
          anchor={formAnchor}
          titleId="mv-group-messages-contact-form-title"
          title={contactCreating ? "Add new contact" : "Edit contact"}
          busy={contactSaving}
          onDismiss={cancelContactForm}
          footer={
            <>
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
            </>
          }
        >
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
        </ContactFormOverlay>
      )}
    </>
  );
}
