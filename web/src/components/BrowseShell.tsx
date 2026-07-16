"use client";

import type {
  ContactDetail,
  ContactListItem,
  ContactSection,
  GroupChatThread,
  MessageRow,
  YearThread,
} from "@/lib/types";
import { searchContacts } from "@/lib/contactSearch";
import { GROUP_DATE_FORMAT_KEY } from "@/lib/groupDateFormat";
import { phoneHandlesOnly } from "@/lib/handleKind";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVaultReadOnly } from "./useVaultReadOnly";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  draftHasName,
  emptyContactEditDraft,
  phonesForSave,
  seedContactEditDraft,
  type ContactEditDraft,
} from "./contactEdit";
import { BrowseContactList, NewContactIcon } from "./BrowseContactList";
import {
  BrowseGroupChatsPane,
  collapseContactGroupChats,
  type ContactGroupConversation,
} from "./BrowseGroupChatsPane";
import { BrowseThreadPane } from "./BrowseThreadPane";
import { ContactDetailsCard } from "./ContactDetailsCard";
import { GroupsMenu, type GroupCheckState } from "./GroupsMenu";
import { useHistory } from "./history";
import {
  ChevronRightIcon,
  PencilIcon,
  PeopleGroupIcon,
  TrashMessagesIcon,
  XIcon,
} from "./icons";
import {
  type BrowseGroupChatSortBy,
  type SortMode,
  type SortOrder,
} from "./SortByMenu";
import { useSourceFilter } from "./SourceFilter";
import { useListSelection } from "./useListSelection";
import { useDismissible } from "./useDismissible";
import { usePersistedEnum } from "./usePersistedEnum";
import { PaneSeparator } from "./PaneSeparator";
import { usePanelLayoutStorage } from "./panelLayoutStorage";
import { Group, Panel, useDefaultLayout } from "react-resizable-panels";

const SORT_MODE_KEY = "mv-contact-sort";
const SORT_ORDER_KEY = "mv-contact-sort-order";
const GROUP_CHAT_SORT_KEY = "mv-browse-group-chat-sort";
const GROUP_CHAT_SORT_ORDER_KEY = "mv-browse-group-chat-sort-order";
const SORT_MODE_ALLOWED = ["first", "last", "messages"] as const;
const GROUP_CHAT_SORT_ALLOWED = ["date", "messages"] as const;
const SORT_ORDER_ALLOWED = ["asc", "desc"] as const;
const GROUP_DATE_ALLOWED = ["md", "mon-d", "d-mon"] as const;
export function BrowseShell({
  paneStorageKey,
  sectionLabel,
  contactSection,
  contacts,
  allGroups = [],
  initialContactId,
}: {
  paneStorageKey: string;
  sectionLabel: string;
  contactSection: ContactSection;
  contacts: ContactListItem[];
  allGroups?: string[];
  initialContactId: number | null;
}) {
  const vaultReadOnly = useVaultReadOnly() === true;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { push: pushHistory } = useHistory();
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
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const loadedContactIdRef = useRef<number | null>(null);
  /** State mirror of loadedContactIdRef so the thread pane can tell "empty" from "still loading". */
  const [threadsLoadedFor, setThreadsLoadedFor] = useState<number | null>(null);
  const activeThreadRef = useRef<string | null>(null);
  activeThreadRef.current = activeThread;
  const activeSourceRef = useRef<string | null>(null);
  activeSourceRef.current = source;

  const [contactEditing, setContactEditing] = useState(false);
  const [contactCreating, setContactCreating] = useState(false);
  const [editDraft, setEditDraft] = useState<ContactEditDraft | null>(null);
  const [extraDraftGroups, setExtraDraftGroups] = useState<string[]>([]);
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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [trashConfirm, setTrashConfirm] = useState<{
    mode: "contact_and_messages" | "messages_only";
    ids: number[];
  } | null>(null);
  const [threadsEpoch, setThreadsEpoch] = useState(0);
  const [ctxMenu, setCtxMenu] = useState<{
    id: number;
    x: number;
    y: number;
  } | null>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);
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
    id: "mv-browse-main",
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

  const saveContactPatch = useCallback(
    async (patch: {
      exclude?: boolean;
      contactGroups?: string[];
      firstName?: string | null;
      lastName?: string | null;
      phones?: string[];
    }): Promise<boolean> => {
      if (!contactId) return false;
      setSaving(true);
      try {
        const res = await fetch(`/api/contacts/${contactId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "save failed");
        if (data.contact) setDetail(data.contact);
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

  /** Excluded stay out of Contacts / groups; All and No messages may include them. */
  const visibleContacts = useMemo(() => {
    if (contactSection === "excluded") {
      return contacts.filter((c) => isContactExcluded(c));
    }
    if (contactSection === "all" || contactSection === "no-messages") {
      return contacts;
    }
    return contacts.filter((c) => !isContactExcluded(c));
  }, [contacts, contactSection, isContactExcluded]);

  const sorted = useMemo(() => {
    const q = query.trim();
    if (q) {
      return searchContacts(visibleContacts, q);
    }
    const copy = [...visibleContacts];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sort === "messages") {
        cmp = a.messageCount - b.messageCount;
        if (cmp === 0) {
          cmp =
            a.sortLast.localeCompare(b.sortLast, undefined, {
              sensitivity: "base",
            }) ||
            a.sortFirst.localeCompare(b.sortFirst, undefined, {
              sensitivity: "base",
            });
        }
      } else if (sort === "first") {
        cmp =
          a.sortFirst.localeCompare(b.sortFirst, undefined, {
            sensitivity: "base",
          }) ||
          a.sortLast.localeCompare(b.sortLast, undefined, {
            sensitivity: "base",
          });
      } else {
        cmp =
          a.sortLast.localeCompare(b.sortLast, undefined, {
            sensitivity: "base",
          }) ||
          a.sortFirst.localeCompare(b.sortFirst, undefined, {
            sensitivity: "base",
          });
      }
      return sortOrder === "desc" ? -cmp : cmp;
    });
    return copy;
  }, [visibleContacts, sort, sortOrder, query]);

  const grouped = useMemo(() => {
    if (sort === "messages") {
      return [["", sorted]] as [string, ContactListItem[]][];
    }
    const map = new Map<string, ContactListItem[]>();
    for (const c of sorted) {
      const letterSrc = sort === "first" ? c.sortFirst : c.sortLast;
      const ch = letterSrc.charAt(0).toUpperCase();
      const letter = ch >= "A" && ch <= "Z" ? ch : "#";
      if (!map.has(letter)) map.set(letter, []);
      map.get(letter)!.push(c);
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (a === "#") return 1;
      if (b === "#") return -1;
      return a.localeCompare(b);
    });
  }, [sorted, sort]);

  const selectContactRef = useRef<(id: number) => void>(() => {});

  const orderedIds = useMemo(() => sorted.map((c) => c.id), [sorted]);
  const selectAllIds = useMemo(
    () => visibleContacts.map((c) => c.id),
    [visibleContacts],
  );
  const validIds = useMemo(() => contacts.map((c) => c.id), [contacts]);

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
    orderedIds,
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

  const selectContact = useCallback(
    (id: number) => {
      setSelectedGroupConversationId(null);
      setGroupChatFilterYear(null);
      setGroupChatQuery("");
      setContactEditing(false);
      setContactCreating(false);
      setEditDraft(null);
      if (id === contactId) {
        setActiveThread("dm");
        setThreadsEpoch((e) => e + 1);
        return;
      }
      setContactId(id);
      setMessages([]);
      setActiveThread(null);
      const params = new URLSearchParams(searchParams.toString());
      params.set("c", String(id));
      params.delete("y");
      params.delete("conv");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [contactId, pathname, router, searchParams],
  );
  selectContactRef.current = selectContact;

  useEffect(() => {
    setSelectedIds(new Set());
    setGroupOverrides(new Map());
    setExcludeOverrides(new Map());
    selectionDirtyRef.current = false;
    setContactEditing(false);
    setContactCreating(false);
    setEditDraft(null);
    setGroupChatQuery("");
  }, [paneStorageKey, query, setSelectedIds]);

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
      setThreadsLoadedFor(null);
      setDetail(null);
      setYearly([]);
      setGroupChats([]);
      setMessageSources([]);
      setSourceCounts({ all: 0, bySource: {} });
      return;
    }
    let cancelled = false;
    // Keep the existing cards mounted while the next contact loads (swap data in place).
    // Only show a blank "Loading…" state when there is nothing to display yet.
    const switchingContact = loadedContactIdRef.current !== contactId;
    if (switchingContact && loadedContactIdRef.current == null) {
      setLoadingThreads(true);
    }
    fetch(`/api/contacts/${contactId}/threads${sourceQuery ? `?${sourceQuery.slice(1)}` : ""}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        // Contact fields don't depend on source — only replace detail when the person changes
        // so the top card shell/content don't flash on source filter updates.
        if (switchingContact) {
          const contact = data.contact as ContactDetail;
          const ov = groupOverridesRef.current.get(contact.id);
          setDetail(
            ov ? { ...contact, contactGroups: ov } : contact,
          );
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
              setMessages([]);
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
          setMessages([]);
          return;
        }
        setLoadingMessages(true);
        const ids = convIds.join(",");
        fetch(`/api/messages?conversationIds=${ids}${sourceQuery}`)
          .then((r) => r.json())
          .then((msgData) => {
            if (!cancelled) setMessages(msgData.messages ?? []);
          })
          .finally(() => {
            if (!cancelled) setLoadingMessages(false);
          });
      })
      .finally(() => {
        if (!cancelled) setLoadingThreads(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contactId, sourceQuery, setSource, threadsEpoch]);

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

  const groupChatYears = useMemo(() => {
    const years = new Set<number>();
    for (const g of groupChats) years.add(g.year);
    return [...years].sort((a, b) => b - a);
  }, [groupChats]);

  useEffect(() => {
    if (
      groupChatFilterYear != null &&
      !groupChatYears.includes(groupChatFilterYear)
    ) {
      setGroupChatFilterYear(null);
    }
  }, [groupChatFilterYear, groupChatYears]);

  const collapsedGroupChats = useMemo(() => {
    const filtered =
      groupChatFilterYear == null
        ? groupChats
        : groupChats.filter((g) => g.year === groupChatFilterYear);
    let items = collapseContactGroupChats(filtered);
    const q = groupChatQuery.trim().toLowerCase();
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
      const cmp =
        groupChatSortBy === "messages"
          ? a.messageCount - b.messageCount
          : a.dateEnd.localeCompare(b.dateEnd);
      return groupChatSortOrder === "desc" ? -cmp : cmp;
    });
    return items;
  }, [
    groupChats,
    groupChatFilterYear,
    groupChatQuery,
    groupChatSortBy,
    groupChatSortOrder,
  ]);

  const selectGroupConversation = useCallback(
    (g: ContactGroupConversation) => {
      setSelectedGroupConversationId(g.conversationId);
      const key = `gfull-${g.conversationIds.join("-")}`;
      loadFullMessages(g.conversationIds, key);
    },
    [loadFullMessages],
  );

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
  const canEditGroups =
    !contactEditing && !contactCreating && (hasSelection || !!detail);

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
    setContactEditing(false);
    setContactCreating(false);
    setEditDraft(null);
    setGroupChatQuery("");
  }, [hasSelection]);

  const beginContactEdit = useCallback(() => {
    if (!detail || hasSelection || contactCreating) return;
    setExtraDraftGroups([]);
    setEditDraft(
      seedContactEditDraft({
        ...detail,
        contactGroups:
          groupOverrides.get(detail.id) ?? detail.contactGroups,
        exclude: excludeOverrides.get(detail.id) ?? detail.exclude,
      }),
    );
    setContactEditing(true);
  }, [
    detail,
    hasSelection,
    contactCreating,
    groupOverrides,
    excludeOverrides,
  ]);

  // Finish Edit from context menu once the contact detail has loaded.
  useEffect(() => {
    const pending = pendingEditIdRef.current;
    if (pending == null || !detail || detail.id !== pending) return;
    if (hasSelection || contactCreating) return;
    pendingEditIdRef.current = null;
    setExtraDraftGroups([]);
    setEditDraft(
      seedContactEditDraft({
        ...detail,
        contactGroups:
          groupOverrides.get(detail.id) ?? detail.contactGroups,
        exclude: excludeOverrides.get(detail.id) ?? detail.exclude,
      }),
    );
    setContactEditing(true);
  }, [
    detail,
    hasSelection,
    contactCreating,
    groupOverrides,
    excludeOverrides,
  ]);
  const createDefaults = useMemo(() => {
    if (typeof contactSection === "object") {
      return { contactGroups: [contactSection.group], exclude: false };
    }
    if (contactSection === "excluded") {
      return { contactGroups: [] as string[], exclude: true };
    }
    // all, no-group
    return { contactGroups: [] as string[], exclude: false };
  }, [contactSection]);

  const beginCreateContact = useCallback(() => {
    if (vaultReadOnly) return;
    setSelectedIds(new Set());
    setContactId(null);
    setDetail(null);
    setYearly([]);
    setGroupChats([]);
    setGroupChatFilterYear(null);
    setGroupChatQuery("");
    setSelectedGroupConversationId(null);
    setMessageSources([]);
    setSourceCounts({ all: 0, bySource: {} });
    setMessages([]);
    setActiveThread(null);
    loadedContactIdRef.current = null;
    setThreadsLoadedFor(null);
    setContactEditing(false);
    setContactCreating(true);
    setEditDraft(emptyContactEditDraft(createDefaults));
    setExtraDraftGroups([]);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("c");
    params.delete("y");
    params.delete("conv");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams, createDefaults, vaultReadOnly]);

  const cancelContactEdit = useCallback(() => {
    setContactEditing(false);
    setContactCreating(false);
    setEditDraft(null);
    setExtraDraftGroups([]);
  }, []);

  useEffect(() => {
    if (!contactEditing && !contactCreating) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (
        deleteDialogOpen ||
        trashConfirm != null ||
        ctxMenu != null ||
        groupsPanelPos != null
      ) {
        return;
      }
      e.preventDefault();
      cancelContactEdit();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [
    contactEditing,
    contactCreating,
    deleteDialogOpen,
    trashConfirm,
    ctxMenu,
    groupsPanelPos,
    cancelContactEdit,
  ]);

  const saveContactEdit = useCallback(async () => {
    if (!editDraft || !contactId) return;
    const ok = await saveContactPatch({
      firstName: editDraft.firstName.trim() || null,
      lastName: editDraft.lastName.trim() || null,
      phones: phonesForSave(editDraft.phones),
      exclude: editDraft.exclude,
      contactGroups: editDraft.contactGroups,
    });
    if (!ok) return;
    setContactEditing(false);
    setEditDraft(null);
    setExtraDraftGroups([]);
    router.refresh();
  }, [editDraft, contactId, saveContactPatch, router]);

  const saveContactCreate = useCallback(async () => {
    if (!editDraft || !draftHasName(editDraft)) return;
    setSaving(true);
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
      setContactCreating(false);
      setEditDraft(null);
      setExtraDraftGroups([]);
      if (data.contact) {
        pushHistory({
          type: "createContact",
          contactId: data.contact.id,
          label: `Create contact ${data.contact.displayName ?? "contact"}`,
        });
        setDetail(data.contact);
        selectContact(data.contact.id);
      }
      router.refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }, [editDraft, selectContact, router, pushHistory]);

  const formOpen = (contactEditing || contactCreating) && !!editDraft;
  const canSaveForm =
    !!editDraft &&
    draftHasName(editDraft) &&
    phoneHandlesOnly(phonesForSave(editDraft.phones)).length > 0;

  const draftMenuGroups = useMemo(() => {
    const names = new Set([...allGroups, ...extraDraftGroups]);
    for (const g of editDraft?.contactGroups ?? []) names.add(g);
    return [...names].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [allGroups, extraDraftGroups, editDraft?.contactGroups]);

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

  const canDelete = !contactCreating && (hasSelection || contactId != null);

  const deleteTargetIds = useCallback((): number[] => {
    if (hasSelection) return selectedContacts.map((c) => c.id);
    if (contactId != null) return [contactId];
    return [];
  }, [hasSelection, selectedContacts, contactId]);

  const confirmTrashMode = useCallback(
    async (
      mode: "contact_and_messages" | "messages_only",
      idsOverride?: number[],
    ) => {
      const ids = idsOverride ?? deleteTargetIds();
      if (ids.length === 0) return;
      setDeleteDialogOpen(false);
      setTrashConfirm(null);
      setCtxMenu(null);
      setSaving(true);
      try {
        const res = await fetch("/api/contacts/trash", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, mode }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "delete failed");

        pushHistory({
          type: "trashContacts",
          contactIds: ids,
          mode,
          handles:
            mode === "messages_only" && Array.isArray(data.handles)
              ? (data.handles as string[])
              : undefined,
          label:
            mode === "contact_and_messages"
              ? ids.length === 1
                ? "Delete contact & messages"
                : `Delete ${ids.length} contacts & messages`
              : ids.length === 1
                ? "Delete contact messages"
                : `Delete messages for ${ids.length} contacts`,
        });

        setSelectedIds(new Set());
        setGroupOverrides(new Map());
        setExcludeOverrides(new Map());
        selectionDirtyRef.current = false;
        setContactEditing(false);
        setContactCreating(false);
        setEditDraft(null);

        if (mode === "contact_and_messages") {
          setDetail(null);
          setYearly([]);
          setGroupChats([]);
          setMessageSources([]);
          setSourceCounts({ all: 0, bySource: {} });
          setMessages([]);
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
          params.delete("y");
          params.delete("conv");
          const qs = params.toString();
          router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
          router.refresh();
          return;
        }

        queueStatusMessage(
          ids.length === 1
            ? "Moved messages to Trash"
            : `Moved messages for ${ids.length} contacts to Trash`,
        );
        setMessages([]);
        setActiveThread(null);
        loadedContactIdRef.current = null;
        setThreadsLoadedFor(null);
        setThreadsEpoch((n) => n + 1);
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
      queueStatusMessage,
      router,
      setSelectedIds,
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

  const onCtxEdit = useCallback(() => {
    if (!ctxMenu || hasSelection || contactCreating || contactEditing) return;
    const id = ctxMenu.id;
    setCtxMenu(null);
    if (contactId === id && detail?.id === id) {
      beginContactEdit();
      return;
    }
    pendingEditIdRef.current = id;
    setSelectedIds(new Set());
    selectContact(id);
  }, [
    ctxMenu,
    hasSelection,
    contactCreating,
    contactEditing,
    contactId,
    detail,
    beginContactEdit,
    selectContact,
    setSelectedIds,
  ]);

  const requestTrash = useCallback(
    (
      mode: "contact_and_messages" | "messages_only",
      idsOverride?: number[],
    ) => {
      const ids = idsOverride ?? deleteTargetIds();
      if (ids.length === 0) return;
      setCtxMenu(null);
      setTrashConfirm({ mode, ids });
    },
    [deleteTargetIds],
  );

  const onCtxDelete = useCallback(
    (mode: "contact_and_messages" | "messages_only") => {
      if (!ctxMenu) return;
      requestTrash(mode, trashIdsForContext(ctxMenu.id));
    },
    [ctxMenu, trashIdsForContext, requestTrash],
  );

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
        ...(groups ? { contactGroups: groups } : {}),
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
    }, 160);
  }, [cancelCloseGroupsPanel]);

  const openCtxGroups = useCallback(
    (anchor: DOMRect) => {
      if (!ctxMenu || contactCreating || contactEditing) return;
      const ids = trashIdsForContext(ctxMenu.id);
      if (ids.length === 0) return;
      cancelCloseGroupsPanel();
      const x = Math.max(
        8,
        Math.min(anchor.right + 2, window.innerWidth - 272),
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
      contactCreating,
      contactEditing,
      trashIdsForContext,
      cancelCloseGroupsPanel,
    ],
  );

  useDismissible({
    open: ctxMenu != null,
    onDismiss: () => {
      setCtxMenu(null);
      closeGroupsPanel();
      flushSelectionDirty();
    },
    refs: [ctxMenuRef, groupsPanelWrapRef],
    onEscape: (e) => {
      if (groupsPanelPos != null) {
        e.preventDefault();
        closeGroupsPanel();
        return false;
      }
    },
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (
        deleteDialogOpen ||
        trashConfirm != null ||
        ctxMenu != null ||
        groupsPanelPos != null
      ) {
        return;
      }
      if (contactCreating || contactEditing) return;
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
      setTrashConfirm({ mode: "contact_and_messages", ids });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [
    deleteDialogOpen,
    trashConfirm,
    ctxMenu,
    groupsPanelPos,
    contactCreating,
    contactEditing,
    canDelete,
    deleteTargetIds,
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
            contactGroups: groupsFor(c.id, c.contactGroups),
          },
        ];
      });
    }
    if (hasSelection) {
      return selectedContacts.map((c) => ({
        id: c.id,
        contactGroups: groupsFor(c.id, c.contactGroups),
      }));
    }
    if (detail) {
      return [{ id: detail.id, contactGroups: groupsFor(detail.id, detail.contactGroups) }];
    }
    return [] as Array<{ id: number; contactGroups: string[] }>;
  }, [
    groupTargetOverrideIds,
    contacts,
    hasSelection,
    selectedContacts,
    detail,
    groupsFor,
  ]);
  const menuGroups = useMemo(() => {
    const names = new Set(allGroups);
    for (const person of groupTargets) {
      for (const group of person.contactGroups) names.add(group);
    }
    return [...names].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [allGroups, groupTargets]);

  const groupChecks = useMemo(() => {
    const result: Record<string, GroupCheckState> = {};
    const n = groupTargets.length;
    for (const name of menuGroups) {
      if (n === 0) {
        result[name] = "off";
        continue;
      }
      let count = 0;
      for (const person of groupTargets) {
        if (person.contactGroups.includes(name)) count++;
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
        if (person.contactGroups.includes(name) !== enable) changed++;
      }
      if (changed === 0) return;

      const nextGroupsById = new Map<number, string[]>();
      for (const person of targets) {
        const current =
          groupOverridesRef.current.get(person.id) ?? person.contactGroups;
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
        return { ...prev, contactGroups: groups };
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
          const has = person.contactGroups.includes(name);
          if (enable === has) continue;
          const groups =
            nextGroupsById.get(person.id) ??
            (enable
              ? [...person.contactGroups, name].sort((a, b) =>
                  a.localeCompare(b, undefined, { sensitivity: "base" }),
                )
              : person.contactGroups.filter((g) => g !== name));

          const res = await fetch(`/api/contacts/${person.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contactGroups: groups }),
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

  const excludedCheck = useMemo((): GroupCheckState => {
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
      return { ...prev, contactGroups: [], exclude: false };
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
        const body: { contactGroups: string[]; exclude?: boolean } = {
          contactGroups: [],
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

  const activeThreadMeta = useMemo(() => {
    if (!activeThread) return null;
    if (activeThread === "dm") {
      if (yearly.length === 0) return null;
      const messageCount = yearly.reduce((n, y) => n + y.messageCount, 0);
      const attachmentCount = yearly.reduce((n, y) => n + y.attachmentCount, 0);
      const dateStart = yearly.reduce(
        (min, y) => (y.dateStart < min ? y.dateStart : min),
        yearly[0]!.dateStart,
      );
      const dateEnd = yearly.reduce(
        (max, y) => (y.dateEnd > max ? y.dateEnd : max),
        yearly[0]!.dateEnd,
      );
      return {
        title: detail?.displayName ?? "Messages",
        dateStart,
        dateEnd,
        messageCount,
        attachmentCount,
      };
    }
    if (activeThread.startsWith("gfull-")) {
      const g = collapsedGroupChats.find(
        (t) => `gfull-${t.conversationIds.join("-")}` === activeThread,
      );
      if (!g) return null;
      return {
        title: g.namedTitle || g.title,
        dateStart: g.dateStart,
        dateEnd: g.dateEnd,
        messageCount: g.messageCount,
      };
    }
    return null;
  }, [activeThread, yearly, collapsedGroupChats, detail]);

  const groupThreadTitle =
    activeThread?.startsWith("gfull-") && activeThreadMeta
      ? activeThreadMeta.title
      : null;

  const trashConfirmCopy = useMemo(() => {
    if (!trashConfirm) return null;
    const n = trashConfirm.ids.length;
    if (trashConfirm.mode === "contact_and_messages") {
      return {
        title:
          n === 1
            ? "Delete contact and messages?"
            : `Delete ${n} contacts and messages?`,
      };
    }
    return {
      title: n === 1 ? "Delete messages?" : `Delete messages for ${n} contacts?`,
    };
  }, [trashConfirm]);

  return (
    <>
    <Group
      id="mv-browse-main"
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
          onNewContact={beginCreateContact}
          vaultReadOnly={vaultReadOnly}
          groupsMenu={
            <GroupsMenu
              allGroups={menuGroups}
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
          onEdit={beginContactEdit}
          editDisabled={!detail || hasSelection || formOpen}
          onTrashContact={() => requestTrash("contact_and_messages")}
          onTrashMessages={() => requestTrash("messages_only")}
          deleteDisabled={!canDelete || saving}
          sort={sort}
          sortOrder={sortOrder}
          onSortChange={setSort}
          grouped={grouped}
          contactId={contactId}
          selectedIds={selectedIds}
          onSelectColumnClick={onSelectColumnClick}
          onNamePhoneClick={onNamePhoneClick}
          onContextMenu={openContactCtxMenu}
        />
      </Panel>

      <PaneSeparator orientation="vertical" />

      <Panel
        id="groups"
        defaultSize={300}
        minSize={180}
        maxSize={520}
        className="min-h-0"
      >
        {hasSelection ? (
          <div className="flex h-full items-center justify-center bg-sidebar px-4">
            <p className="text-center text-[13px] text-muted">
              Clear selection to browse group chats
            </p>
          </div>
        ) : (
          <BrowseGroupChatsPane
            items={collapsedGroupChats}
            selectedConversationId={selectedGroupConversationId}
            years={groupChatYears}
            filterYear={groupChatFilterYear}
            onFilterYearChange={setGroupChatFilterYear}
            sortBy={groupChatSortBy}
            sortOrder={groupChatSortOrder}
            onSortChange={setGroupChatSort}
            searchQuery={groupChatQuery}
            onSearchQueryChange={setGroupChatQuery}
            searchDisabled={!contactId}
            groupDateFormat={groupDateFormat}
            onSelect={selectGroupConversation}
            emptyLabel={
              !contactId
                ? "Choose a contact"
                : loadingThreads
                  ? "Loading…"
                  : groupChatQuery.trim()
                    ? "No matches"
                    : "No group chats"
            }
          />
        )}
      </Panel>

      <PaneSeparator orientation="vertical" />

      <Panel id="thread" minSize="30%" className="min-h-0 min-w-0">
        <div
          id={`browse-${paneStorageKey}-thread`}
          className="flex h-full min-h-0 min-w-0 flex-col"
        >
        <div className="flex h-[45px] shrink-0 items-center gap-2 border-b border-border px-5">
          <span className="min-w-0 flex-1" aria-hidden />
          {statusMsg && (
            <span className="truncate text-[12px] text-muted">{statusMsg}</span>
          )}
        </div>

        {hasSelection ? (
          <div className="min-h-0 flex-1 overflow-y-auto bg-bg px-5 pt-8 pb-5">
            <div className="rounded-xl border border-border bg-[#2c2c2e] shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
              <div className="flex items-center justify-between gap-3 border-b border-border/80 px-4 py-3">
                <h2 className="text-[14px] font-semibold text-text">
                  {selectedIds.size} contact
                  {selectedIds.size === 1 ? "" : "s"} selected
                </h2>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="inline-flex items-center rounded-md bg-white/12 px-2.5 py-1 text-[12px] text-text transition-colors hover:bg-white/18"
                >
                  Clear selection
                </button>
              </div>
              <ul>
                {selectedContacts.map((c, i) => (
                  <li
                    key={c.id}
                    className={`flex items-center justify-between gap-4 px-4 py-2.5 ${
                      i < selectedContacts.length - 1
                        ? "border-b border-border/60"
                        : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => selectContact(c.id)}
                      className="min-w-0 truncate text-left text-[13px] text-text hover:text-accent"
                    >
                      {c.displayName}
                    </button>
                    <span className="shrink-0 text-[13px] text-muted tabular-nums">
                      {c.preferredHandle ?? ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1">
            <BrowseThreadPane
              detail={detail}
              groups={
                detail ? groupsFor(detail.id, detail.contactGroups) : []
              }
              excluded={
                detail
                  ? (excludeOverrides.get(detail.id) ?? detail.exclude)
                  : false
              }
              sources={sources}
              messageSources={messageSources}
              sourceCounts={sourceCounts}
              source={source}
              onSourceChange={setSource}
              yearly={yearly}
              messages={messages}
              loadingMessages={loadingMessages}
              threadsReady={threadsLoadedFor === contactId}
              activeThread={activeThread}
              threadTitle={groupThreadTitle}
            />
          </div>
        )}
        </div>
      </Panel>
    </Group>
    {ctxMenu && (
      <div
        ref={ctxMenuRef}
        className="fixed z-[100] min-w-[180px] rounded-lg border border-border bg-[#2c2c2e] py-1 shadow-xl"
        style={{ left: ctxMenu.x, top: ctxMenu.y }}
      >
        {!vaultReadOnly && (
          <button
            type="button"
            disabled={saving || contactCreating || contactEditing}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-text hover:bg-white/20 disabled:opacity-40"
            onMouseEnter={scheduleCloseGroupsPanel}
            onClick={() => {
              setCtxMenu(null);
              beginCreateContact();
            }}
          >
            <NewContactIcon className="size-5 shrink-0 opacity-80" />
            New contact
          </button>
        )}
        <button
          type="button"
          disabled={
            saving || hasSelection || contactCreating || contactEditing
          }
          className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-text hover:bg-white/20 disabled:opacity-40"
          onMouseEnter={scheduleCloseGroupsPanel}
          onClick={onCtxEdit}
        >
          <PencilIcon className="size-5 shrink-0 opacity-80" />
          Edit
        </button>
        <button
          type="button"
          disabled={saving || contactCreating || contactEditing}
          className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-text hover:bg-white/20 disabled:opacity-40"
          onMouseEnter={(e) => {
            if (saving || contactCreating || contactEditing) return;
            openCtxGroups(e.currentTarget.getBoundingClientRect());
          }}
          onMouseLeave={scheduleCloseGroupsPanel}
        >
          <PeopleGroupIcon className="size-5 shrink-0 opacity-80" />
          <span className="min-w-0 flex-1">Groups</span>
          <ChevronRightIcon className="size-3.5 shrink-0 opacity-70" />
        </button>
        <div className="my-1 border-t border-border/60" />
        <button
          type="button"
          disabled={saving}
          className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-text hover:bg-red-500/15 hover:text-red-300 disabled:opacity-50"
          onMouseEnter={scheduleCloseGroupsPanel}
          onClick={() => onCtxDelete("contact_and_messages")}
        >
          <XIcon className="size-5 shrink-0 opacity-80" />
          Delete
        </button>
        <button
          type="button"
          disabled={saving}
          className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-text hover:bg-red-500/15 hover:text-red-300 disabled:opacity-50"
          onMouseEnter={scheduleCloseGroupsPanel}
          onClick={() => onCtxDelete("messages_only")}
        >
          <TrashMessagesIcon className="size-5 shrink-0 opacity-80" />
          Delete messages
        </button>
      </div>
    )}
    {groupsPanelPos && (
      <div
        ref={groupsPanelWrapRef}
        onMouseEnter={cancelCloseGroupsPanel}
        onMouseLeave={scheduleCloseGroupsPanel}
      >
        <GroupsMenu
          fixedPosition={groupsPanelPos}
          allGroups={menuGroups}
          checks={groupChecks}
          excludedCheck={excludedCheck}
          disabled={contactCreating || contactEditing}
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
    {formOpen && editDraft && (
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 px-4"
        role="presentation"
        onClick={() => {
          if (!saving) cancelContactEdit();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="mv-contact-form-title"
          className="w-full max-w-lg rounded-xl border border-border bg-[#2c2c2e] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.5)]"
          onClick={(e) => e.stopPropagation()}
        >
          <h2
            id="mv-contact-form-title"
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
              phonesView={detail?.phones ?? []}
              groupsEditor={
                <GroupsMenu
                  labeled
                  allGroups={draftMenuGroups}
                  checks={draftGroupChecks}
                  excludedCheck={draftExcludedCheck}
                  disabled={saving}
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
              disabled={saving}
              onClick={cancelContactEdit}
              className="rounded-md bg-elevated px-3 py-1.5 text-[13px] text-text transition-colors hover:bg-white/14 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || (contactCreating && !canSaveForm)}
              onClick={() =>
                void (contactCreating ? saveContactCreate() : saveContactEdit())
              }
              className="rounded-md bg-accent/25 px-3 py-1.5 text-[13px] font-medium text-text transition-colors hover:bg-accent/35 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    )}
    {trashConfirm && trashConfirmCopy && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4"
        role="presentation"
        onClick={() => !saving && setTrashConfirm(null)}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="mv-trash-confirm-title"
          className="w-full max-w-md rounded-xl border border-border bg-[#2c2c2e] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.5)]"
          onClick={(e) => e.stopPropagation()}
        >
          <h2
            id="mv-trash-confirm-title"
            className="text-[16px] font-semibold text-text"
          >
            {trashConfirmCopy.title}
          </h2>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => setTrashConfirm(null)}
              className="rounded-md bg-elevated px-3 py-1.5 text-[13px] text-text transition-colors hover:bg-white/14 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                void confirmTrashMode(trashConfirm.mode, trashConfirm.ids)
              }
              className="rounded-md bg-red-500/25 px-3 py-1.5 text-[13px] font-medium text-red-100 transition-colors hover:bg-red-500/35 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    )}
    {deleteDialogOpen && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4"
        role="presentation"
        onClick={() => !saving && setDeleteDialogOpen(false)}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="mv-delete-contact-title"
          className="w-full max-w-md rounded-xl border border-border bg-[#2c2c2e] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.5)]"
          onClick={(e) => e.stopPropagation()}
        >
          <h2
            id="mv-delete-contact-title"
            className="text-[16px] font-semibold text-text"
          >
            Delete?
          </h2>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void confirmTrashMode("contact_and_messages")}
              className="rounded-md bg-red-500/20 px-3 py-2 text-left text-[13px] font-medium text-red-100 transition-colors hover:bg-red-500/30 disabled:opacity-50"
            >
              Delete contact and messages
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void confirmTrashMode("messages_only")}
              className="rounded-md bg-white/8 px-3 py-2 text-left text-[13px] font-medium text-text transition-colors hover:bg-white/14 disabled:opacity-50"
            >
              Delete messages
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => setDeleteDialogOpen(false)}
              className="mt-1 rounded-md px-3 py-2 text-[13px] text-muted transition-colors hover:bg-white/8 hover:text-text disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
