"use client";

import type {
  ContactDetail,
  ContactListItem,
  ContactSection,
  GroupChatThread,
  GroupParticipant,
  YearThread,
} from "@/lib/types";
import {
  GROUP_CHAT_SORT_ALLOWED,
  GROUP_CHAT_SORT_KEY,
  GROUP_CHAT_SORT_ORDER_KEY,
  GROUP_DATE_ALLOWED,
  SORT_ORDER_ALLOWED,
} from "@/lib/groupChatList";
import { GROUP_DATE_FORMAT_KEY } from "@/lib/groupDateFormat";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVaultReadOnly } from "./useVaultReadOnly";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { seedContactEditDraft } from "./contactEdit";
import {
  BrowseContactCtxMenu,
  BrowseMergeIntoPanel,
} from "./BrowseContactCtxMenu";
import { BrowseContactList } from "./BrowseContactList";
import type { CollapsedGroupConversation } from "@/lib/groupChatList";
import { BrowseGroupChatsPane } from "./BrowseGroupChatsPane";
import { BrowseThreadColumn } from "./BrowseThreadColumn";
import {
  contactFormAnchorFromRect,
  type ContactFormAnchor,
} from "./ContactFormOverlay";
import {
  createGroupChatTrashOptions,
  groupChatToastTitle,
} from "./groupChatTrash";
import { LabelsMenu, type LabelCheckState } from "./LabelsMenu";
import { useHistory } from "./history";
import { trashContactsLabel } from "./history/historyTypes";
import { ParticipantContactFormOverlay } from "./ParticipantContactFormOverlay";
import {
  type BrowseGroupChatSortBy,
  type SortMode,
  type SortOrder,
} from "./SortByMenu";
import { useSourceFilter } from "./SourceFilter";
import {
  useBrowseContactListBase,
  useBrowseContactListView,
} from "./useBrowseContactList";
import { useCollapsedGroupChatList } from "./useCollapsedGroupChatList";
import { useListSelection } from "./useListSelection";
import { useParticipantContactForm } from "./useParticipantContactForm";
import { useTrashActions } from "./useTrashActions";
import { useThreadMessages } from "./useThreadMessages";
import { useDismissible } from "./useDismissible";
import { usePersistedEnum } from "./usePersistedEnum";
import { PaneSeparator } from "./PaneSeparator";
import { usePanelLayoutStorage } from "./panelLayoutStorage";
import { Group, Panel, useDefaultLayout } from "react-resizable-panels";

const SORT_MODE_KEY = "mv-contact-sort";
const SORT_ORDER_KEY = "mv-contact-sort-order";
const SORT_MODE_ALLOWED = ["first", "last", "messages", "phone"] as const;

export function BrowseShell({
  paneStorageKey,
  sectionLabel,
  contactSection,
  contacts,
  allLabels = [],
  initialContactId,
}: {
  paneStorageKey: string;
  sectionLabel: string;
  contactSection: ContactSection;
  contacts: ContactListItem[];
  allLabels?: string[];
  initialContactId: number | null;
}) {
  const vaultReadOnly = useVaultReadOnly() === true;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { push: pushHistory, revision: historyRevision } = useHistory();
  const { sources, source, setSource, sourceQuery } = useSourceFilter();
  const [sortMode, setSortMode] = usePersistedEnum(
    SORT_MODE_KEY,
    SORT_MODE_ALLOWED,
    "last",
  );
  const [sortOrder, setSortOrder] = usePersistedEnum(
    SORT_ORDER_KEY,
    SORT_ORDER_ALLOWED,
    "asc",
  );
  const setSort = useCallback(
    (next: { sort: SortMode; order: SortOrder }) => {
      setSortMode(next.sort);
      setSortOrder(next.order);
    },
    [setSortMode, setSortOrder],
  );
  const sort = sortMode;
  const [query, setQuery] = useState("");
  const [contactId, setContactId] = useState<number | null>(initialContactId);
  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [yearly, setYearly] = useState<YearThread[]>([]);
  const [groupChats, setGroupChats] = useState<GroupChatThread[]>([]);
  const [messageSources, setMessageSources] = useState<string[]>([]);
  const [sourceCounts, setSourceCounts] = useState<{
    all: number;
    bySource: Record<string, number>;
  }>({ all: 0, bySource: {} });
  const [groupDateFormat] = usePersistedEnum(
    GROUP_DATE_FORMAT_KEY,
    GROUP_DATE_ALLOWED,
    "md",
  );
  const [threadConversationIds, setThreadConversationIds] = useState<
    number[] | null
  >(null);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const loadedContactIdRef = useRef<number | null>(null);
  /** State mirror of loadedContactIdRef so the thread pane can tell "empty" from "still loading". */
  const [threadsLoadedFor, setThreadsLoadedFor] = useState<number | null>(null);
  const activeThreadRef = useRef<string | null>(null);
  activeThreadRef.current = activeThread;
  /** False after URL/hydration restore so Panel 4 stays empty until a click. */
  const allowAutoOpenThreadRef = useRef(initialContactId == null);
  const activeSourceRef = useRef<string | null>(null);
  activeSourceRef.current = source;
  const cancelContactFormRef = useRef<() => void>(() => {});

  const [saving, setSaving] = useState(false);
  const [groupOverrides, setGroupOverrides] = useState<Map<number, string[]>>(
    () => new Map(),
  );
  const [excludeOverrides, setExcludeOverrides] = useState<Map<number, boolean>>(
    () => new Map(),
  );
  const groupOverridesRef = useRef(groupOverrides);
  groupOverridesRef.current = groupOverrides;
  const excludeOverridesRef = useRef(excludeOverrides);
  excludeOverridesRef.current = excludeOverrides;
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [threadsEpoch, setThreadsEpoch] = useState(0);
  const [ctxMenu, setCtxMenu] = useState<{
    id: number;
    x: number;
    y: number;
  } | null>(null);
  const [mergeFromId, setMergeFromId] = useState<number | null>(null);
  const [mergeQuery, setMergeQuery] = useState("");
  const [mergePos, setMergePos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const ctxMenuRef = useRef<HTMLDivElement>(null);
  const mergePanelRef = useRef<HTMLDivElement>(null);
  const groupsPanelWrapRef = useRef<HTMLDivElement>(null);
  const groupsCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  /** Keep the groups flyout open while the create form is showing. */
  const groupsCreatePinnedRef = useRef(false);
  const pendingEditIdRef = useRef<number | null>(null);
  const [groupTargetOverrideIds, setGroupTargetOverrideIds] = useState<
    number[] | null
  >(null);
  const [groupsPanelPos, setGroupsPanelPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const selectionDirtyRef = useRef(false);
  const statusShowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storage = usePanelLayoutStorage();
  const mainLayout = useDefaultLayout({
    id: "mv-browse-main-v2",
    panelIds: ["list", "groups", "thread"],
    storage,
  });
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
  const [groupChatFilterYear, setGroupChatFilterYear] = useState<number | null>(
    null,
  );
  const [groupChatQuery, setGroupChatQuery] = useState("");
  const [selectedGroupConversationId, setSelectedGroupConversationId] =
    useState<number | null>(null);
  const [selectionGroupChats, setSelectionGroupChats] = useState<
    GroupChatThread[]
  >([]);
  const [loadingSelectionGroups, setLoadingSelectionGroups] = useState(false);

  const saveContactPatch = useCallback(
    async (
      patch: {
        exclude?: boolean;
        labels?: string[];
        firstName?: string | null;
        lastName?: string | null;
        phones?: string[];
      },
      id?: number,
    ): Promise<boolean> => {
      const targetId = id ?? contactId;
      if (targetId == null) return false;
      setSaving(true);
      try {
        const res = await fetch(`/api/contacts/${targetId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "save failed");
        if (data.contact && targetId === contactId) setDetail(data.contact);
        return true;
      } catch (err) {
        console.error(err);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [contactId],
  );

  const isContactExcluded = useCallback(
    (c: { id: number; exclude: boolean }) =>
      excludeOverrides.get(c.id) ?? c.exclude,
    [excludeOverrides],
  );

  const {
    visibleContacts,
    sortedRaw,
    selectAllIds,
    compareContacts,
  } = useBrowseContactListBase({
    contacts,
    contactSection,
    isContactExcluded,
    sort,
    sortOrder,
    query,
  });

  const selectContactRef = useRef<(id: number) => void>(() => {});

  const validIds = useMemo(() => contacts.map((c) => c.id), [contacts]);
  const [listOrderIds, setListOrderIds] = useState<number[]>([]);

  const {
    selectedIds,
    setSelectedIds,
    hasSelection,
    allSelected: allGroupSelected,
    selectAllRef,
    clearSelection: clearSelectionBase,
    toggleSelectAll: toggleSelectAllInGroup,
    onSelectColumnClick,
    onRowClick: onNamePhoneClick,
  } = useListSelection<number>({
    orderedIds:
      listOrderIds.length > 0 ? listOrderIds : sortedRaw.map((c) => c.id),
    selectAllIds,
    validIds,
    rangeMode: "selectionSpan",
    multiThreshold: "any",
    focusedId: contactId,
    rowClickMode: "openWhenEmptyElseToggle",
    checkboxEvents: "preventAndStop",
    escapeToClear: false,
    selectAllSetsAnchor: false,
    onOpen: (id) => selectContactRef.current(id),
  });

  const { sorted, grouped } = useBrowseContactListView({
    sortedRaw,
    visibleContacts,
    compareContacts,
    query,
    selectedIds,
    sort,
  });

  useLayoutEffect(() => {
    const next = sorted.map((c) => c.id);
    setListOrderIds((prev) => {
      if (
        prev.length === next.length &&
        prev.every((id, i) => id === next[i])
      ) {
        return prev;
      }
      return next;
    });
  }, [sorted]);

  const selectContact = useCallback(
    (id: number) => {
      allowAutoOpenThreadRef.current = true;
      setSelectedGroupConversationId(null);
      setGroupChatFilterYear(null);
      setGroupChatQuery("");
      cancelContactFormRef.current();
      if (id === contactId) {
        const dmIds = [
          ...new Set(yearly.flatMap((y) => y.conversationIds)),
        ];
        setActiveThread("dm");
        setThreadConversationIds(dmIds.length > 0 ? dmIds : null);
        setThreadsEpoch((e) => e + 1);
        return;
      }
      setContactId(id);
      setThreadConversationIds(null);
      setActiveThread(null);
      const params = new URLSearchParams(searchParams.toString());
      params.set("c", String(id));
      params.delete("h");
      params.delete("y");
      params.delete("conv");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [contactId, pathname, router, searchParams, yearly],
  );
  selectContactRef.current = selectContact;

  const clearContactFocus = useCallback(() => {
    allowAutoOpenThreadRef.current = false;
    setContactId(null);
    setThreadConversationIds(null);
    setActiveThread(null);
    setSelectedGroupConversationId(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("c");
    params.delete("h");
    params.delete("y");
    params.delete("conv");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if (selectedIds.size === 0 || contactId == null) return;
    if (selectedIds.has(contactId)) return;
    clearContactFocus();
  }, [selectedIds, contactId, clearContactFocus]);

  useEffect(() => {
    setSelectedIds(new Set());
    setGroupOverrides(new Map());
    setExcludeOverrides(new Map());
    selectionDirtyRef.current = false;
    cancelContactFormRef.current();
    setGroupChatQuery("");
  }, [paneStorageKey, setSelectedIds]);

  useEffect(() => {
    return () => {
      if (statusShowTimerRef.current) clearTimeout(statusShowTimerRef.current);
      if (statusClearTimerRef.current) clearTimeout(statusClearTimerRef.current);
    };
  }, []);

  const queueStatusMessage = useCallback((message: string) => {
    if (statusShowTimerRef.current) clearTimeout(statusShowTimerRef.current);
    if (statusClearTimerRef.current) clearTimeout(statusClearTimerRef.current);
    statusShowTimerRef.current = setTimeout(() => {
      setStatusMsg(message);
      statusClearTimerRef.current = setTimeout(() => {
        setStatusMsg(null);
        statusClearTimerRef.current = null;
      }, 5000);
      statusShowTimerRef.current = null;
    }, 300);
  }, []);

  useEffect(() => {
    if (!contactId) {
      loadedContactIdRef.current = null;
      allowAutoOpenThreadRef.current = false;
      setThreadsLoadedFor(null);
      setDetail(null);
      setYearly([]);
      setGroupChats([]);
      setMessageSources([]);
      setSourceCounts({ all: 0, bySource: {} });
      setThreadConversationIds(null);
      setActiveThread(null);
      setSelectedGroupConversationId(null);
      return;
    }
    let cancelled = false;
    // Keep the existing cards mounted while the next contact loads (swap data in place).
    // Only show a blank "Loading…" state when there is nothing to display yet.
    const switchingContact = loadedContactIdRef.current !== contactId;
    // URL/hydration restore: load contact metadata for Panel 2/3, but leave Panel 4
    // empty until the user clicks the contact or a group.
    const hydrateOnly =
      !allowAutoOpenThreadRef.current && activeThreadRef.current == null;
    if (switchingContact && loadedContactIdRef.current == null) {
      setLoadingThreads(true);
    }
    fetch(
      `/api/contacts/${contactId}/threads${
        sourceQuery ? `?${sourceQuery.slice(1)}` : ""
      }`,
    )
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          if (switchingContact) {
            setDetail(null);
            setYearly([]);
            setGroupChats([]);
            setMessageSources([]);
            setSourceCounts({ all: 0, bySource: {} });
            setThreadConversationIds(null);
            setActiveThread(null);
          }
          return;
        }
        // Contact fields don't depend on source — only replace detail when the person changes
        // so the top card shell/content don't flash on source filter updates.
        if (switchingContact) {
          const contact = data.contact as ContactDetail;
          const ov = groupOverridesRef.current.get(contact.id);
          setDetail(ov ? { ...contact, labels: ov } : contact);
        }
        const nextYearly: YearThread[] = data.yearly ?? [];
        const nextGroupChats: GroupChatThread[] = data.groupChats ?? [];
        setYearly(nextYearly);
        setGroupChats(nextGroupChats);
        setMessageSources(data.messageSources ?? []);
        setSourceCounts(
          data.sourceCounts ?? { all: 0, bySource: {} },
        );
        loadedContactIdRef.current = contactId;
        setThreadsLoadedFor(contactId);

        const available: string[] = data.messageSources ?? [];
        const selected = activeSourceRef.current;
        if (selected && !available.includes(selected)) {
          setSource(null);
        }

        if (hydrateOnly) {
          setThreadConversationIds(null);
          setActiveThread(null);
          setSelectedGroupConversationId(null);
          return;
        }

        setActiveThread((prev) => {
          if (prev === "dm") return prev;
          if (prev?.startsWith("gfull-")) {
            const stillThere = nextGroupChats.some((t) => {
              const ids =
                t.conversationIds?.length > 0
                  ? t.conversationIds
                  : [t.conversationId];
              return `gfull-${ids.join("-")}` === prev;
            });
            return stillThere ? prev : null;
          }
          return null;
        });

        // Prefer an already-open group thread; otherwise load full 1:1 history.
        let key = activeThreadRef.current;
        if (key?.startsWith("gfull-")) {
          const stillThere = nextGroupChats.some((t) => {
            const ids =
              t.conversationIds?.length > 0
                ? t.conversationIds
                : [t.conversationId];
            return `gfull-${ids.join("-")}` === key;
          });
          if (!stillThere) key = null;
        } else if (key !== "dm") {
          key = null;
        }

        const dmIds = [
          ...new Set(nextYearly.flatMap((y) => y.conversationIds)),
        ];

        if (!key || key === "dm" || switchingContact) {
          if (dmIds.length === 0) {
            if (switchingContact) {
              setThreadConversationIds(null);
              setActiveThread(null);
              setSelectedGroupConversationId(null);
            }
            return;
          }
          key = "dm";
          setActiveThread("dm");
          if (switchingContact) setSelectedGroupConversationId(null);
        }

        let convIds: number[] | null = null;
        if (key === "dm") {
          convIds = dmIds;
        } else if (key.startsWith("gfull-")) {
          const g = nextGroupChats.find((t) => {
            const ids =
              t.conversationIds?.length > 0
                ? t.conversationIds
                : [t.conversationId];
            return `gfull-${ids.join("-")}` === key;
          });
          if (g) {
            convIds =
              g.conversationIds?.length > 0
                ? g.conversationIds
                : [g.conversationId];
          }
        }
        if (!convIds?.length) {
          setThreadConversationIds(null);
          return;
        }
        setThreadConversationIds(convIds);
      })
      .finally(() => {
        if (!cancelled) setLoadingThreads(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contactId, sourceQuery, setSource, threadsEpoch]);

  const openThread = useCallback((conversationIds: number[], key: string) => {
    allowAutoOpenThreadRef.current = true;
    setActiveThread(key);
    setThreadConversationIds(conversationIds);
  }, []);

  const selectedContacts = useMemo(() => {
    const selected = new Set(selectedIds);
    const fromSorted = sorted.filter((c) => selected.has(c.id));
    if (fromSorted.length === selectedIds.size) return fromSorted;
    // Keep contacts that left the visible list (e.g. Excluded while on All).
    const have = new Set(fromSorted.map((c) => c.id));
    const byId = new Map(contacts.map((c) => [c.id, c]));
    const extras: ContactListItem[] = [];
    for (const id of selectedIds) {
      if (have.has(id)) continue;
      const c = byId.get(id);
      if (c) extras.push(c);
    }
    return [...fromSorted, ...extras];
  }, [sorted, selectedIds, contacts]);

  const selectionIdsKey = useMemo(
    () =>
      [...selectedIds]
        .sort((a, b) => a - b)
        .join(","),
    [selectedIds],
  );

  useEffect(() => {
    if (!selectionIdsKey) {
      setSelectionGroupChats([]);
      setLoadingSelectionGroups(false);
      return;
    }
    let cancelled = false;
    setLoadingSelectionGroups(true);
    const params = new URLSearchParams({ ids: selectionIdsKey });
    if (source) params.set("source", source);
    fetch(`/api/contacts/shared-group-chats?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const next: GroupChatThread[] = data.groupChats ?? [];
        setSelectionGroupChats(next);
        const prev = activeThreadRef.current;
        if (prev?.startsWith("gfull-")) {
          const stillThere = next.some((t) => {
            const ids =
              t.conversationIds?.length > 0
                ? t.conversationIds
                : [t.conversationId];
            return `gfull-${ids.join("-")}` === prev;
          });
          if (!stillThere) {
            setActiveThread(null);
            setSelectedGroupConversationId(null);
            setThreadConversationIds(null);
          }
        }
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setSelectionGroupChats([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSelectionGroups(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectionIdsKey, source, threadsEpoch]);

  // Undo/redo restores server state but Panel 3 uses client-fetched lists.
  useEffect(() => {
    if (historyRevision === 0) return;
    setThreadsEpoch((n) => n + 1);
  }, [historyRevision]);

  const panelGroupChats = hasSelection ? selectionGroupChats : groupChats;

  const groupChatYears = useMemo(() => {
    const years = new Set<number>();
    for (const g of panelGroupChats) years.add(g.year);
    return [...years].sort((a, b) => b - a);
  }, [panelGroupChats]);

  useEffect(() => {
    if (
      groupChatFilterYear != null &&
      !groupChatYears.includes(groupChatFilterYear)
    ) {
      setGroupChatFilterYear(null);
    }
  }, [groupChatFilterYear, groupChatYears]);

  const { collapsedGroupChats, orderedGroupIds, collapsedById } =
    useCollapsedGroupChatList({
      groupChats: panelGroupChats,
      filterYear: groupChatFilterYear,
      query: groupChatQuery,
      sortBy: groupChatSortBy,
      sortOrder: groupChatSortOrder,
    });
  const selectGroupRef = useRef<(id: number) => void>(() => {});

  const {
    selectedIds: selectedGroupIds,
    setSelectedIds: setSelectedGroupIds,
    hasSelection: hasGroupSelection,
    allSelected: allGroupsSelected,
    selectAllRef: groupSelectAllRef,
    clearSelection: clearGroupSelection,
    toggleSelectAll: toggleSelectAllGroups,
    onSelectColumnClick: onGroupSelectColumnClick,
    onRowClick: onGroupRowClick,
  } = useListSelection<number>({
    orderedIds: orderedGroupIds,
    validIds: orderedGroupIds,
    rangeMode: "selectionSpan",
    multiThreshold: "any",
    focusedId: selectedGroupConversationId,
    rowClickMode: "openWhenEmptyElseToggle",
    checkboxEvents: "preventAndStop",
    escapeToClear: true,
    selectAllSetsAnchor: false,
    onOpen: (id) => selectGroupRef.current(id),
  });

  const selectGroupConversation = useCallback(
    (g: CollapsedGroupConversation) => {
      if (
        !hasGroupSelection &&
        hasSelection &&
        selectedGroupConversationId === g.conversationId
      ) {
        setSelectedGroupConversationId(null);
        setActiveThread(null);
        setThreadConversationIds(null);
        return;
      }
      setSelectedGroupConversationId(g.conversationId);
      const key = `gfull-${g.conversationIds.join("-")}`;
      openThread(g.conversationIds, key);
    },
    [
      hasGroupSelection,
      hasSelection,
      selectedGroupConversationId,
      openThread,
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

  useEffect(() => {
    if (!hasGroupSelection) return;
    setActiveThread(null);
    setThreadConversationIds(null);
    setSelectedGroupConversationId(null);
  }, [hasGroupSelection]);

  useEffect(() => {
    clearGroupSelection();
    setSelectedGroupConversationId(null);
  }, [selectionIdsKey, contactId, paneStorageKey, clearGroupSelection]);

  const { messages, loading: loadingMessages } = useThreadMessages({
    conversationIds: threadConversationIds,
    sourceQuery,
    fullConversation: true,
    enabled: !hasGroupSelection,
    reloadToken: threadsEpoch,
  });

  const createDefaults = useMemo(() => {
    if (typeof contactSection === "object") {
      return { labels: [contactSection.label], exclude: false };
    }
    if (contactSection === "excluded") {
      return { labels: [] as string[], exclude: true };
    }
    // all, no-group
    return { labels: [] as string[], exclude: false };
  }, [contactSection]);

  const participantForm = useParticipantContactForm({
    vaultReadOnly,
    knownGroups: allLabels,
    createDefaults,
    setStatus: setStatusMsg,
    shouldIgnoreEscape: () => ctxMenu != null || groupsPanelPos != null,
    onSaved: (result) => {
      if (result.kind === "edit") {
        if (result.contact && result.contactId === contactId) {
          setDetail(result.contact);
        }
        setThreadsEpoch((e) => e + 1);
        router.refresh();
        return;
      }
      if (result.contact) {
        const name = result.contact.displayName ?? "contact";
        pushHistory({
          type: "createContact",
          contactId: result.contact.id,
          name,
          label: `Create contact ${name}`,
        });
        if (contactId == null) {
          setDetail(result.contact);
          selectContact(result.contact.id);
        } else {
          setThreadsEpoch((e) => e + 1);
        }
      }
      router.refresh();
    },
  });
  cancelContactFormRef.current = participantForm.cancelContactForm;

  const {
    formOpen,
    contactCreating,
    editContactId,
    contactSaving,
  } = participantForm;
  const contactEditing = editContactId != null;

  const canEditGroups =
    !formOpen && (hasSelection || !!detail);

  const clearSelection = useCallback(() => {
    clearSelectionBase();
    if (selectionDirtyRef.current) {
      selectionDirtyRef.current = false;
      setGroupOverrides(new Map());
      setExcludeOverrides(new Map());
      router.refresh();
    } else {
      setGroupOverrides(new Map());
      setExcludeOverrides(new Map());
    }
  }, [clearSelectionBase, router]);

  useEffect(() => {
    if (!hasSelection) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (ctxMenu != null || groupsPanelPos != null) return;
      e.preventDefault();
      clearSelection();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [hasSelection, clearSelection, ctxMenu, groupsPanelPos]);

  useEffect(() => {
    if (!hasSelection) return;
    participantForm.cancelContactForm();
    setGroupChatQuery("");
  }, [hasSelection, participantForm.cancelContactForm]);

  const beginContactEdit = useCallback(
    (anchor?: ContactFormAnchor | null) => {
      if (!detail || hasSelection || contactCreating) return;
      participantForm.openEditFromDraft(
        detail.id,
        seedContactEditDraft({
          ...detail,
          labels:
            groupOverrides.get(detail.id) ?? detail.labels,
          exclude: excludeOverrides.get(detail.id) ?? detail.exclude,
        }),
        anchor ?? null,
      );
    },
    [
      detail,
      hasSelection,
      contactCreating,
      groupOverrides,
      excludeOverrides,
      participantForm.openEditFromDraft,
    ],
  );

  const onContactNameClick = useCallback(
    (anchorRect: DOMRect) => {
      if (vaultReadOnly || saving || contactSaving || formOpen) return;
      beginContactEdit(contactFormAnchorFromRect(anchorRect));
    },
    [
      vaultReadOnly,
      saving,
      contactSaving,
      formOpen,
      beginContactEdit,
    ],
  );

  // Finish Edit from context menu once the contact detail has loaded.
  useEffect(() => {
    const pending = pendingEditIdRef.current;
    if (pending == null || !detail || detail.id !== pending) return;
    if (hasSelection || contactCreating) return;
    pendingEditIdRef.current = null;
    participantForm.openEditFromDraft(
      detail.id,
      seedContactEditDraft({
        ...detail,
        labels:
          groupOverrides.get(detail.id) ?? detail.labels,
        exclude: excludeOverrides.get(detail.id) ?? detail.exclude,
      }),
      null,
    );
  }, [
    detail,
    hasSelection,
    contactCreating,
    groupOverrides,
    excludeOverrides,
    participantForm.openEditFromDraft,
  ]);

  const openCreateContactInPlace = useCallback(
    (handle: string, anchor: ContactFormAnchor) => {
      if (vaultReadOnly) return;
      participantForm.openCreateContactWithHandle(handle, anchor);
    },
    [vaultReadOnly, participantForm.openCreateContactWithHandle],
  );

  const canDelete =
    !contactCreating && (hasSelection || contactId != null);

  const deleteTargetIds = useCallback((): number[] => {
    if (hasSelection) return selectedContacts.map((c) => c.id);
    if (contactId != null) return [contactId];
    return [];
  }, [hasSelection, selectedContacts, contactId]);

  const executeTrash = useCallback(
    async (idsOverride?: number[]) => {
      const ids = idsOverride ?? deleteTargetIds();
      if (ids.length === 0) return;
      setCtxMenu(null);
      setSaving(true);
      try {
        const res = await fetch("/api/contacts/trash", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, mode: "contact_and_messages" }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "delete failed");

        const byId = new Map(contacts.map((c) => [c.id, c]));
        const names = ids.map((id) => {
          const c =
            byId.get(id) ??
            selectedContacts.find((x) => x.id === id) ??
            (detail?.id === id ? detail : null);
          return c?.displayName?.trim() || "contact";
        });
        pushHistory({
          type: "trashContacts",
          contactIds: ids,
          mode: "contact_and_messages",
          names,
          label: trashContactsLabel(names),
        });

        setSelectedIds(new Set());
        setSelectedGroupIds(new Set());
        setGroupOverrides(new Map());
        setExcludeOverrides(new Map());
        selectionDirtyRef.current = false;
        cancelContactFormRef.current();

        setDetail(null);
        setYearly([]);
        setGroupChats([]);
        setMessageSources([]);
        setSourceCounts({ all: 0, bySource: {} });
        setThreadConversationIds(null);
        setActiveThread(null);
        setContactId(null);
        setGroupChatFilterYear(null);
        setGroupChatQuery("");
        setSelectedGroupConversationId(null);
        loadedContactIdRef.current = null;
        setThreadsLoadedFor(null);
        queueStatusMessage(
          ids.length === 1
            ? "Moved contact & messages to Trash"
            : `Moved ${ids.length} contacts to Trash`,
        );
        const params = new URLSearchParams(searchParams.toString());
        params.delete("c");
        params.delete("h");
        params.delete("y");
        params.delete("conv");
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        router.refresh();
      } catch (err) {
        console.error(err);
        queueStatusMessage(
          err instanceof Error ? err.message : "delete failed",
        );
        router.refresh();
      } finally {
        setSaving(false);
      }
    },
    [
      deleteTargetIds,
      contacts,
      selectedContacts,
      detail,
      queueStatusMessage,
      router,
      setSelectedIds,
      setSelectedGroupIds,
      pathname,
      searchParams,
      pushHistory,
    ],
  );

  const trashIdsForContext = useCallback(
    (ctxId: number): number[] => {
      if (hasSelection && selectedIds.has(ctxId)) {
        return selectedContacts.map((c) => c.id);
      }
      return [ctxId];
    },
    [hasSelection, selectedIds, selectedContacts],
  );

  const openContactCtxMenu = useCallback(
    (id: number, x: number, y: number) => {
      if (groupsCloseTimerRef.current) {
        clearTimeout(groupsCloseTimerRef.current);
        groupsCloseTimerRef.current = null;
      }
      groupsCreatePinnedRef.current = false;
      setGroupsPanelPos(null);
      setGroupTargetOverrideIds(null);
      setCtxMenu({ id, x, y });
    },
    [],
  );

  const onCtxEdit = useCallback(
    (anchorEl: HTMLElement) => {
      if (!ctxMenu || hasSelection || formOpen) return;
      const id = ctxMenu.id;
      setCtxMenu(null);
      void participantForm.openEditContact(
        id,
        contactFormAnchorFromRect(anchorEl.getBoundingClientRect()),
      );
    },
    [
      ctxMenu,
      hasSelection,
      formOpen,
      participantForm.openEditContact,
    ],
  );

  const requestTrash = useCallback(
    (idsOverride?: number[]) => {
      void executeTrash(idsOverride);
    },
    [executeTrash],
  );

  const onCtxDelete = useCallback(() => {
    if (!ctxMenu) return;
    requestTrash(trashIdsForContext(ctxMenu.id));
  }, [ctxMenu, trashIdsForContext, requestTrash]);

  const closeGroupsPanel = useCallback(() => {
    if (groupsCloseTimerRef.current) {
      clearTimeout(groupsCloseTimerRef.current);
      groupsCloseTimerRef.current = null;
    }
    groupsCreatePinnedRef.current = false;
    setGroupsPanelPos(null);
    setGroupTargetOverrideIds(null);
  }, []);

  const flushSelectionDirty = useCallback(() => {
    if (!selectionDirtyRef.current) return;
    selectionDirtyRef.current = false;
    const groupOv = groupOverridesRef.current;
    const excludeOv = excludeOverridesRef.current;
    // Keep the open contact card in sync — overrides are cleared next, and
    // router.refresh() only updates the list props, not client `detail`.
    setDetail((prev) => {
      if (!prev) return prev;
      const groups = groupOv.get(prev.id);
      const hasExclude = excludeOv.has(prev.id);
      if (!groups && !hasExclude) return prev;
      return {
        ...prev,
        ...(groups ? { labels: groups } : {}),
        ...(hasExclude ? { exclude: excludeOv.get(prev.id)! } : {}),
      };
    });
    setGroupOverrides(new Map());
    setExcludeOverrides(new Map());
    router.refresh();
  }, [router]);

  const cancelCloseGroupsPanel = useCallback(() => {
    if (groupsCloseTimerRef.current) {
      clearTimeout(groupsCloseTimerRef.current);
      groupsCloseTimerRef.current = null;
    }
  }, []);

  const scheduleCloseGroupsPanel = useCallback(() => {
    if (groupsCreatePinnedRef.current) return;
    cancelCloseGroupsPanel();
    groupsCloseTimerRef.current = setTimeout(() => {
      groupsCloseTimerRef.current = null;
      setGroupsPanelPos(null);
      setGroupTargetOverrideIds(null);
    }, 400);
  }, [cancelCloseGroupsPanel]);

  const openCtxGroups = useCallback(
    (anchor: DOMRect) => {
      if (!ctxMenu || formOpen) return;
      const ids = trashIdsForContext(ctxMenu.id);
      if (ids.length === 0) return;
      cancelCloseGroupsPanel();
      const x = Math.max(
        8,
        Math.min(anchor.right - 4, window.innerWidth - 272),
      );
      const y = Math.max(
        8,
        Math.min(anchor.top, window.innerHeight - 320),
      );
      setGroupTargetOverrideIds(ids);
      setGroupsPanelPos({ x, y });
    },
    [
      ctxMenu,
      formOpen,
      trashIdsForContext,
      cancelCloseGroupsPanel,
    ],
  );

  useDismissible({
    open: ctxMenu != null || mergeFromId != null,
    onDismiss: () => {
      setCtxMenu(null);
      setMergeFromId(null);
      setMergeQuery("");
      setMergePos(null);
      closeGroupsPanel();
      flushSelectionDirty();
    },
    refs: [ctxMenuRef, groupsPanelWrapRef, mergePanelRef],
    onEscape: (e) => {
      if (mergeFromId != null) {
        e.preventDefault();
        setMergeFromId(null);
        setMergeQuery("");
        setMergePos(null);
        return false;
      }
      if (groupsPanelPos != null) {
        e.preventDefault();
        closeGroupsPanel();
        return false;
      }
    },
  });

  const ctxMenuContact = useMemo(
    () => (ctxMenu ? contacts.find((c) => c.id === ctxMenu.id) : null),
    [contacts, ctxMenu],
  );
  const ctxMenuIsNameless = Boolean(
    ctxMenuContact &&
      !(ctxMenuContact.firstName ?? "").trim() &&
      !(ctxMenuContact.lastName ?? "").trim(),
  );

  const mergeTargets = useMemo(() => {
    if (mergeFromId == null) return [];
    const q = mergeQuery.trim().toLowerCase();
    return contacts
      .filter((c) => {
        if (c.id === mergeFromId) return false;
        const hasName =
          Boolean((c.firstName ?? "").trim()) ||
          Boolean((c.lastName ?? "").trim());
        if (!hasName) return false;
        if (!q) return true;
        return (
          c.displayName.toLowerCase().includes(q) ||
          (c.preferredHandle ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) =>
        a.sortFirst.localeCompare(b.sortFirst, undefined, {
          sensitivity: "base",
        }),
      )
      .slice(0, 40);
  }, [contacts, mergeFromId, mergeQuery]);

  const runMergeInto = useCallback(
    async (intoId: number) => {
      if (mergeFromId == null || vaultReadOnly) return;
      setSaving(true);
      try {
        const res = await fetch("/api/contacts/merge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fromId: mergeFromId, intoId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "merge failed");
        setMergeFromId(null);
        setMergeQuery("");
        setMergePos(null);
        setCtxMenu(null);
        queueStatusMessage(
          `Merged into ${data.contact?.displayName ?? "contact"}`,
        );
        selectContact(intoId);
        router.refresh();
      } catch (err) {
        console.error(err);
        queueStatusMessage(
          err instanceof Error ? err.message : "merge failed",
        );
      } finally {
        setSaving(false);
      }
    },
    [
      mergeFromId,
      vaultReadOnly,
      queueStatusMessage,
      selectContact,
      router,
    ],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (ctxMenu != null || groupsPanelPos != null) {
        return;
      }
      if (formOpen) return;
      if (!canDelete) return;
      const t = e.target;
      if (t instanceof HTMLElement) {
        const tag = t.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          t.isContentEditable
        ) {
          return;
        }
      }
      const ids = deleteTargetIds();
      if (ids.length === 0) return;
      e.preventDefault();
      requestTrash(ids);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [
    ctxMenu,
    groupsPanelPos,
    formOpen,
    canDelete,
    deleteTargetIds,
    requestTrash,
  ]);
  const groupsFor = useCallback(
    (id: number, fallback: string[]) => groupOverrides.get(id) ?? fallback,
    [groupOverrides],
  );

  const groupTargets = useMemo(() => {
    if (groupTargetOverrideIds?.length) {
      return groupTargetOverrideIds.flatMap((id) => {
        const c =
          contacts.find((x) => x.id === id) ??
          selectedContacts.find((x) => x.id === id) ??
          (detail?.id === id ? detail : null);
        if (!c) return [];
        return [
          {
            id: c.id,
            labels: groupsFor(c.id, c.labels),
          },
        ];
      });
    }
    if (hasSelection) {
      return selectedContacts.map((c) => ({
        id: c.id,
        labels: groupsFor(c.id, c.labels),
      }));
    }
    if (detail) {
      return [{ id: detail.id, labels: groupsFor(detail.id, detail.labels) }];
    }
    return [] as Array<{ id: number; labels: string[] }>;
  }, [
    groupTargetOverrideIds,
    contacts,
    hasSelection,
    selectedContacts,
    detail,
    groupsFor,
  ]);
  const menuGroups = useMemo(() => {
    const names = new Set(allLabels);
    for (const person of groupTargets) {
      for (const group of person.labels) names.add(group);
    }
    return [...names].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [allLabels, groupTargets]);

  const groupChecks = useMemo(() => {
    const result: Record<string, LabelCheckState> = {};
    const n = groupTargets.length;
    for (const name of menuGroups) {
      if (n === 0) {
        result[name] = "off";
        continue;
      }
      let count = 0;
      for (const person of groupTargets) {
        if (person.labels.includes(name)) count++;
      }
      result[name] =
        count === 0 ? "off" : count === n ? "on" : "mixed";
    }
    return result;
  }, [menuGroups, groupTargets]);

  const applyGroupMembership = useCallback(
    async (name: string, enable: boolean) => {
      const targets = groupTargets;
      if (targets.length === 0) return;

      let changed = 0;
      for (const person of targets) {
        if (person.labels.includes(name) !== enable) changed++;
      }
      if (changed === 0) return;

      const nextGroupsById = new Map<number, string[]>();
      for (const person of targets) {
        const current =
          groupOverridesRef.current.get(person.id) ?? person.labels;
        const has = current.includes(name);
        if (enable === has) {
          nextGroupsById.set(person.id, current);
          continue;
        }
        const groups = enable
          ? [...current, name].sort((a, b) =>
              a.localeCompare(b, undefined, { sensitivity: "base" }),
            )
          : current.filter((g) => g !== name);
        nextGroupsById.set(person.id, groups);
      }

      // Optimistic UI so the menu can stay open across multiple toggles.
      setGroupOverrides((prev) => {
        const next = new Map(prev);
        for (const [id, groups] of nextGroupsById) {
          next.set(id, groups);
        }
        return next;
      });
      // Contact card reads `detail` after overrides flush — update it now.
      setDetail((prev) => {
        if (!prev) return prev;
        const groups = nextGroupsById.get(prev.id);
        if (!groups) return prev;
        return { ...prev, labels: groups };
      });
      selectionDirtyRef.current = true;

      const noun = changed === 1 ? "contact" : "contacts";
      queueStatusMessage(
        enable
          ? `Added ${changed} ${noun} to ${name}`
          : `Removed ${changed} ${noun} from ${name}`,
      );

      try {
        for (const person of targets) {
          const has = person.labels.includes(name);
          if (enable === has) continue;
          const groups =
            nextGroupsById.get(person.id) ??
            (enable
              ? [...person.labels, name].sort((a, b) =>
                  a.localeCompare(b, undefined, { sensitivity: "base" }),
                )
              : person.labels.filter((g) => g !== name));

          const res = await fetch(`/api/contacts/${person.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ labels: groups }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "save failed");
          if (data.contact) {
            setDetail((prev) =>
              prev && prev.id === data.contact.id ? data.contact : prev,
            );
          }
        }
      } catch (err) {
        console.error(err);
        // Re-sync from server on failure.
        selectionDirtyRef.current = true;
        router.refresh();
        setGroupOverrides(new Map());
        setThreadsEpoch((n) => n + 1);
      }
    },
    [groupTargets, router, queueStatusMessage],
  );

  const toggleGroup = useCallback(
    (name: string) => {
      const state = groupChecks[name] ?? "off";
      const enable = state !== "on";
      void applyGroupMembership(name, enable);
    },
    [groupChecks, applyGroupMembership],
  );

  const createAndAssignGroup = useCallback(
    (name: string) => {
      void (async () => {
        await applyGroupMembership(name, true);
        // Fixed context-menu flyout unmounts without onOpenChange(false), so
        // refresh here so the left Groups nav picks up the new name.
        router.refresh();
      })();
    },
    [applyGroupMembership, router],
  );

  const onSelectionMenuOpenChange = useCallback(
    (open: boolean) => {
      if (open) return;
      flushSelectionDirty();
    },
    [flushSelectionDirty],
  );

  const selectionFieldTargets = useMemo(() => {
    if (groupTargetOverrideIds?.length) {
      return groupTargetOverrideIds.flatMap((id) => {
        const c =
          contacts.find((x) => x.id === id) ??
          selectedContacts.find((x) => x.id === id) ??
          (detail?.id === id ? detail : null);
        if (!c) return [];
        return [
          {
            id: c.id,
            exclude: excludeOverrides.get(c.id) ?? c.exclude,
          },
        ];
      });
    }
    if (hasSelection) {
      return selectedContacts.map((c) => ({
        id: c.id,
        exclude: excludeOverrides.get(c.id) ?? c.exclude,
      }));
    }
    if (detail) {
      return [
        {
          id: detail.id,
          exclude: excludeOverrides.get(detail.id) ?? detail.exclude,
        },
      ];
    }
    return [] as Array<{ id: number; exclude: boolean }>;
  }, [
    groupTargetOverrideIds,
    contacts,
    hasSelection,
    selectedContacts,
    detail,
    excludeOverrides,
  ]);

  const excludedCheck = useMemo((): LabelCheckState => {
    const n = selectionFieldTargets.length;
    if (n === 0) return "off";
    let excluded = 0;
    for (const p of selectionFieldTargets) {
      if (p.exclude) excluded++;
    }
    if (excluded === 0) return "off";
    if (excluded === n) return "on";
    return "mixed";
  }, [selectionFieldTargets]);

  const patchContactFields = useCallback(
    async (id: number, patch: { exclude?: boolean }) => {
      const res = await fetch(`/api/contacts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "save failed");
      if (data.contact && id === contactId) setDetail(data.contact);
    },
    [contactId],
  );

  const toggleExcludedForSelection = useCallback(async () => {
    const targets = selectionFieldTargets;
    if (targets.length === 0) return;
    const excludeAll = excludedCheck !== "on";
    let changed = 0;
    for (const p of targets) {
      if (p.exclude !== excludeAll) changed++;
    }
    if (changed === 0) return;

    setExcludeOverrides((prev) => {
      const next = new Map(prev);
      for (const p of targets) {
        next.set(p.id, excludeAll);
      }
      return next;
    });
    selectionDirtyRef.current = true;

    const noun = changed === 1 ? "contact" : "contacts";
    queueStatusMessage(
      excludeAll
        ? `Made ${changed} ${noun} inactive`
        : `Made ${changed} ${noun} active`,
    );

    try {
      for (const p of targets) {
        if (p.exclude === excludeAll) continue;
        await patchContactFields(p.id, { exclude: excludeAll });
      }
    } catch (err) {
      console.error(err);
      selectionDirtyRef.current = true;
      router.refresh();
      setExcludeOverrides(new Map());
    }
  }, [
    selectionFieldTargets,
    excludedCheck,
    queueStatusMessage,
    patchContactFields,
    router,
  ]);

  const clearAllGroupsForSelection = useCallback(async () => {
    const targets = groupTargets;
    if (targets.length === 0) return;

    const nextGroupsById = new Map<number, string[]>();
    for (const person of targets) {
      nextGroupsById.set(person.id, []);
    }

    setGroupOverrides((prev) => {
      const next = new Map(prev);
      for (const [id, groups] of nextGroupsById) {
        next.set(id, groups);
      }
      return next;
    });
    setDetail((prev) => {
      if (!prev) return prev;
      if (!nextGroupsById.has(prev.id)) return prev;
      return { ...prev, labels: [], exclude: false };
    });

    const excludeTargets = selectionFieldTargets.filter((p) => p.exclude);
    if (excludeTargets.length > 0) {
      setExcludeOverrides((prev) => {
        const next = new Map(prev);
        for (const p of excludeTargets) {
          next.set(p.id, false);
        }
        return next;
      });
    }

    selectionDirtyRef.current = true;
    const noun = targets.length === 1 ? "contact" : "contacts";
    queueStatusMessage(`Cleared groups for ${targets.length} ${noun}`);

    try {
      for (const person of targets) {
        const body: { labels: string[]; exclude?: boolean } = {
          labels: [],
        };
        const wasExcluded =
          excludeOverrides.get(person.id) ??
          selectionFieldTargets.find((p) => p.id === person.id)?.exclude;
        if (wasExcluded) body.exclude = false;

        const res = await fetch(`/api/contacts/${person.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "save failed");
        if (data.contact) {
          setDetail((prev) =>
            prev && prev.id === data.contact.id ? data.contact : prev,
          );
        }
      }
    } catch (err) {
      console.error(err);
      selectionDirtyRef.current = true;
      router.refresh();
      setGroupOverrides(new Map());
      setExcludeOverrides(new Map());
      setThreadsEpoch((n) => n + 1);
    }
  }, [
    groupTargets,
    selectionFieldTargets,
    excludeOverrides,
    queueStatusMessage,
    router,
  ]);

  const injectSelectedParticipants = useCallback(
    (participants: GroupParticipant[]) => {
      const next = [...participants];
      const extras = hasSelection
        ? selectedContacts
        : detail
          ? [detail]
          : [];
      for (const c of extras) {
        const handles = new Set(
          [
            c.preferredHandle,
            ...("phones" in c && Array.isArray(c.phones) ? c.phones : []),
          ]
            .filter(Boolean)
            .map((h) => String(h).trim()),
        );
        const already = next.some(
          (p) =>
            p.contactId === c.id ||
            (p.handle && handles.has(p.handle.trim())),
        );
        if (already) continue;
        next.push({
          name: c.displayName || c.preferredHandle || "Contact",
          handle: c.preferredHandle ?? "",
          contactId: c.id,
        });
      }
      next.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );
      return next;
    },
    [hasSelection, selectedContacts, detail],
  );

  const groupThread = useMemo(() => {
    if (hasGroupSelection) return null;
    if (!activeThread?.startsWith("gfull-")) return null;
    const g = collapsedGroupChats.find(
      (t) => `gfull-${t.conversationIds.join("-")}` === activeThread,
    );
    if (!g) return null;
    return {
      participants: injectSelectedParticipants([...(g.participants ?? [])]),
      dateStart: g.dateStart,
      dateEnd: g.dateEnd,
      messageCount: g.messageCount,
    };
  }, [
    hasGroupSelection,
    collapsedGroupChats,
    activeThread,
    injectSelectedParticipants,
  ]);

  const selectedGroupRows = useMemo(
    () =>
      collapsedGroupChats.filter((g) => selectedGroupIds.has(g.conversationId)),
    [collapsedGroupChats, selectedGroupIds],
  );

  const onGroupParticipantClick = useCallback(
    (participant: GroupParticipant, anchorRect: DOMRect) => {
      if (vaultReadOnly || saving || contactSaving) return;
      participantForm.onParticipantClick(participant, anchorRect);
    },
    [
      vaultReadOnly,
      saving,
      contactSaving,
      participantForm.onParticipantClick,
    ],
  );

  const groupTrashTargets = useCallback(
    (forId?: number) => {
      const primaryIds =
        forId != null && !hasGroupSelection
          ? [forId]
          : hasGroupSelection
            ? [...selectedGroupIds]
            : selectedGroupConversationId != null
              ? [selectedGroupConversationId]
              : [];
      const out: number[] = [];
      for (const id of primaryIds) {
        const g = collapsedById.get(id);
        const ids = g?.conversationIds?.length ? g.conversationIds : [id];
        for (const cid of ids) {
          if (!out.includes(cid)) out.push(cid);
        }
      }
      return out;
    },
    [
      hasGroupSelection,
      selectedGroupIds,
      selectedGroupConversationId,
      collapsedById,
    ],
  );

  const canTrashGroups =
    !vaultReadOnly &&
    (hasGroupSelection || selectedGroupConversationId != null);

  const browseGroupTrash = useMemo(
    () => createGroupChatTrashOptions({ variant: "browse" }),
    [],
  );

  const {
    saving: groupTrashSaving,
    moveToTrash: moveGroupsToTrash,
    confirmDialog: groupTrashConfirmDialog,
  } = useTrashActions<number>({
    endpoint: browseGroupTrash.endpoint,
    idField: browseGroupTrash.idField,
    getTargets: groupTrashTargets,
    canTrash: canTrashGroups,
    canRestoreOrDelete: false,
    status: browseGroupTrash.status,
    setStatus: (s) => {
      if (s) queueStatusMessage(s);
    },
    onRemoved: (targets) => {
      clearGroupSelection();
      setSelectedGroupConversationId(null);
      setThreadConversationIds(null);
      setActiveThread(null);
      const removed = new Set(targets);
      setGroupChats((prev) =>
        prev.filter((g) => {
          const ids =
            g.conversationIds?.length > 0
              ? g.conversationIds
              : [g.conversationId];
          return !ids.some((id) => removed.has(id));
        }),
      );
      setSelectionGroupChats((prev) =>
        prev.filter((g) => {
          const ids =
            g.conversationIds?.length > 0
              ? g.conversationIds
              : [g.conversationId];
          return !ids.some((id) => removed.has(id));
        }),
      );
    },
    onTrashed: (ids) => {
      const titles = ids.map((id) => {
        const g = collapsedById.get(id);
        return g ? groupChatToastTitle(g) : "group message";
      });
      pushHistory(browseGroupTrash.historyEntry(ids, titles));
    },
    afterTrash: () => {
      setThreadsEpoch((n) => n + 1);
      router.refresh();
    },
  });

  return (
    <>
    <Group
      id="mv-browse-main-v2"
      orientation="horizontal"
      className="h-full w-full"
      defaultLayout={mainLayout.defaultLayout}
      onLayoutChanged={mainLayout.onLayoutChanged}
    >
      <Panel
        id="list"
        defaultSize={240}
        minSize={100}
        maxSize={480}
        className="min-h-0"
      >
        <BrowseContactList
          sectionLabel={sectionLabel}
          selectAllRef={selectAllRef}
          allGroupSelected={allGroupSelected}
          visibleCount={visibleContacts.length}
          sortedCount={sorted.length}
          query={query}
          onQueryChange={setQuery}
          onToggleSelectAll={toggleSelectAllInGroup}
          onNewContact={(el) =>
            openCreateContactInPlace(
              "",
              contactFormAnchorFromRect(el.getBoundingClientRect()),
            )
          }
          vaultReadOnly={vaultReadOnly}
          groupsMenu={
            <LabelsMenu
              allLabels={menuGroups}
              checks={groupChecks}
              excludedCheck={excludedCheck}
              disabled={!canEditGroups}
              onToggle={toggleGroup}
              onToggleExcluded={() => void toggleExcludedForSelection()}
              onCreate={createAndAssignGroup}
              onClearAll={() => void clearAllGroupsForSelection()}
              onOpenChange={onSelectionMenuOpenChange}
            />
          }
          onEdit={(el) =>
            beginContactEdit(
              contactFormAnchorFromRect(el.getBoundingClientRect()),
            )
          }
          editDisabled={!detail || hasSelection || formOpen}
          onTrashContact={() => requestTrash()}
          deleteDisabled={!canDelete || saving || groupTrashSaving}
          sort={sort}
          sortOrder={sortOrder}
          onSortChange={setSort}
          grouped={grouped}
          contactId={contactId}
          contextMenuId={ctxMenu?.id ?? null}
          selectedIds={selectedIds}
          onSelectColumnClick={onSelectColumnClick}
          onNamePhoneClick={onNamePhoneClick}
          onContextMenu={openContactCtxMenu}
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
          selectedConversationId={selectedGroupConversationId}
          selectedIds={selectedGroupIds}
          selectAllRef={groupSelectAllRef}
          allSelected={allGroupsSelected}
          onToggleSelectAll={toggleSelectAllGroups}
          onSelectColumnClick={onGroupSelectColumnClick}
          onRowClick={onGroupRowClick}
          onTrashMessages={() => void moveGroupsToTrash()}
          trashDisabled={!canTrashGroups || saving || groupTrashSaving}
          vaultReadOnly={vaultReadOnly}
          years={groupChatYears}
          filterYear={groupChatFilterYear}
          onFilterYearChange={setGroupChatFilterYear}
          sortBy={groupChatSortBy}
          sortOrder={groupChatSortOrder}
          onSortChange={setGroupChatSort}
          searchQuery={groupChatQuery}
          onSearchQueryChange={setGroupChatQuery}
          searchDisabled={!hasSelection && !contactId}
          groupDateFormat={groupDateFormat}
          emptyLabel={
            hasSelection
              ? loadingSelectionGroups
                ? "Loading…"
                : groupChatQuery.trim()
                  ? "No matches"
                  : selectedIds.size > 1
                    ? "No shared group messages"
                    : "No group messages"
              : contactId && loadingThreads
                ? "Loading…"
                : groupChatQuery.trim()
                  ? "No matches"
                  : "No group messages"
          }
        />
      </Panel>

      <PaneSeparator orientation="vertical" />

      <Panel id="thread" minSize="30%" className="min-h-0 min-w-0">
        <BrowseThreadColumn
          paneStorageKey={paneStorageKey}
          selectedIds={selectedIds}
          selectedContacts={selectedContacts}
          hasSelection={hasSelection}
          hasGroupSelection={hasGroupSelection}
          selectedGroupIds={selectedGroupIds}
          selectedGroupRows={selectedGroupRows}
          detail={detail}
          groupThread={groupThread}
          vaultReadOnly={vaultReadOnly}
          statusMsg={statusMsg}
          contactId={contactId}
          contacts={contacts}
          activeThread={activeThread}
          sources={sources}
          messageSources={messageSources}
          sourceCounts={sourceCounts}
          source={source}
          onSourceChange={setSource}
          yearly={yearly}
          messages={messages}
          loadingMessages={loadingMessages}
          loadingSelectionGroups={loadingSelectionGroups}
          threadsLoadedFor={threadsLoadedFor}
          onContactNameClick={onContactNameClick}
          onGroupParticipantClick={onGroupParticipantClick}
          onClearContactSelection={clearSelection}
          onClearGroupSelection={clearGroupSelection}
          onClearContactFocus={clearContactFocus}
        />
      </Panel>
    </Group>
    {ctxMenu && (
      <BrowseContactCtxMenu
        menuRef={ctxMenuRef}
        ctxMenu={ctxMenu}
        vaultReadOnly={vaultReadOnly}
        saving={saving}
        groupTrashSaving={groupTrashSaving}
        hasSelection={hasSelection}
        contactCreating={contactCreating}
        contactEditing={contactEditing}
        isNameless={ctxMenuIsNameless}
        onMouseEnterItem={scheduleCloseGroupsPanel}
        onNewContact={(el) => {
          setCtxMenu(null);
          openCreateContactInPlace(
            "",
            contactFormAnchorFromRect(el.getBoundingClientRect()),
          );
        }}
        onEdit={onCtxEdit}
        onMergeInto={() => {
          setMergeFromId(ctxMenu.id);
          setMergePos({ x: ctxMenu.x, y: ctxMenu.y });
          setMergeQuery("");
          setCtxMenu(null);
        }}
        onGroupsEnter={openCtxGroups}
        onGroupsLeave={scheduleCloseGroupsPanel}
        onDelete={onCtxDelete}
      />
    )}
    {mergeFromId != null && mergePos && (
      <BrowseMergeIntoPanel
        panelRef={mergePanelRef}
        x={mergePos.x}
        y={mergePos.y}
        query={mergeQuery}
        onQueryChange={setMergeQuery}
        targets={mergeTargets}
        saving={saving}
        onSelect={(id) => void runMergeInto(id)}
      />
    )}
    {groupsPanelPos && (
      <div
        ref={groupsPanelWrapRef}
        onMouseEnter={cancelCloseGroupsPanel}
        onMouseLeave={scheduleCloseGroupsPanel}
      >
        <LabelsMenu
          fixedPosition={groupsPanelPos}
          allLabels={menuGroups}
          checks={groupChecks}
          excludedCheck={excludedCheck}
          disabled={formOpen}
          onToggle={toggleGroup}
          onToggleExcluded={() => void toggleExcludedForSelection()}
          onCreate={createAndAssignGroup}
          onClearAll={() => void clearAllGroupsForSelection()}
          onModeChange={(mode) => {
            groupsCreatePinnedRef.current = mode === "create";
            if (mode === "create") cancelCloseGroupsPanel();
          }}
          onOpenChange={(open) => {
            if (!open) closeGroupsPanel();
            else onSelectionMenuOpenChange(true);
          }}
        />
      </div>
    )}
    <ParticipantContactFormOverlay
      titleId="mv-contact-form-title"
      phonesView={detail?.phones ?? []}
      form={participantForm}
    />
    {groupTrashConfirmDialog}
    </>
  );
}
