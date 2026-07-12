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
import {
  isGroupChatThreadKey,
  yearThreadKey,
} from "@/lib/threadKeys";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  draftHasName,
  emptyContactEditDraft,
  phonesForSave,
  seedContactEditDraft,
  type ContactEditDraft,
} from "./contactEdit";
import { BrowseContactList } from "./BrowseContactList";
import { BrowseDetailPane } from "./BrowseDetailPane";
import { BrowseMessagesPane } from "./BrowseMessagesPane";
import { GroupsMenu, type GroupCheckState } from "./GroupsMenu";
import { type SortMode, type SortOrder } from "./SortByMenu";
import { useSourceFilter } from "./SourceFilter";
import { useListSelection } from "./useListSelection";
import { usePersistedEnum } from "./usePersistedEnum";
import { useResizablePanes } from "./useResizablePanes";

const SORT_MODE_KEY = "mv-contact-sort";
const SORT_ORDER_KEY = "mv-contact-sort-order";
const SORT_MODE_ALLOWED = ["first", "last", "messages"] as const;
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
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
  const [groupDateFormat, setGroupDateFormat] = usePersistedEnum(
    GROUP_DATE_FORMAT_KEY,
    GROUP_DATE_ALLOWED,
    "md",
  );
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const loadedContactIdRef = useRef<number | null>(null);
  const activeThreadRef = useRef<string | null>(null);
  activeThreadRef.current = activeThread;
  const activeSourceRef = useRef<string | null>(null);
  activeSourceRef.current = source;

  const [contactEditing, setContactEditing] = useState(false);
  const [contactCreating, setContactCreating] = useState(false);
  const [editDraft, setEditDraft] = useState<ContactEditDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [groupOverrides, setGroupOverrides] = useState<Map<number, string[]>>(
    () => new Map(),
  );
  const [excludeOverrides, setExcludeOverrides] = useState<Map<number, boolean>>(
    () => new Map(),
  );
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const selectionDirtyRef = useRef(false);
  const statusShowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { sidebarWidth, threadsPct, startSide, startThreads, shellRef, splitId } =
    useResizablePanes("browse");

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
      const letter =
        sort === "first"
          ? (() => {
              const ch = c.sortFirst.charAt(0).toUpperCase();
              return ch >= "A" && ch <= "Z" ? ch : "#";
            })()
          : c.letter;
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
      setContactId(id);
      setMessages([]);
      setActiveThread(null);
      setContactEditing(false);
      setContactCreating(false);
      setEditDraft(null);
      const params = new URLSearchParams(searchParams.toString());
      params.set("c", String(id));
      params.delete("y");
      params.delete("conv");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
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
          setDetail(data.contact);
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

        const available: string[] = data.messageSources ?? [];
        const selected = activeSourceRef.current;
        if (selected && !available.includes(selected)) {
          setSource(null);
        }

        setActiveThread((prev) => {
          if (!prev) return prev;
          if (prev.startsWith("y-")) {
            const year = Number(prev.slice(2));
            return nextYearly.some((t) => t.year === year) ? prev : null;
          }
          return nextGroupChats.some((t) => isGroupChatThreadKey(t, prev))
            ? prev
            : null;
        });

        // Prefer an already-open thread; otherwise auto-open the sole yearly thread.
        let key = activeThreadRef.current;
        if (key?.startsWith("y-")) {
          const year = Number(key.slice(2));
          if (!nextYearly.some((t) => t.year === year)) key = null;
        } else if (key) {
          if (!nextGroupChats.some((t) => isGroupChatThreadKey(t, key!))) key = null;
        }
        if (nextYearly.length === 1) {
          key = yearThreadKey(nextYearly[0]!.year);
          setActiveThread(key);
        } else if (!key) {
          if (switchingContact) setMessages([]);
          return;
        }

        let convIds: number[] | null = null;
        let year: number | null = null;
        if (key.startsWith("y-")) {
          const y = nextYearly.find((t) => yearThreadKey(t.year) === key);
          if (y) {
            convIds = y.conversationIds;
            year = y.year;
          }
        } else {
          const g = nextGroupChats.find((t) => isGroupChatThreadKey(t, key!));
          if (g) {
            convIds = g.conversationIds?.length
              ? g.conversationIds
              : [g.conversationId];
            year = g.year;
          }
        }
        if (!convIds || year == null) {
          setMessages([]);
          return;
        }
        setLoadingMessages(true);
        const ids = convIds.join(",");
        fetch(`/api/messages?conversationIds=${ids}&year=${year}${sourceQuery}`)
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
  }, [contactId, sourceQuery, setSource]);

  const loadMessages = useCallback(
    (conversationIds: number[], year: number, key: string) => {
      setActiveThread(key);
      setLoadingMessages(true);
      const ids = conversationIds.join(",");
      fetch(`/api/messages?conversationIds=${ids}&year=${year}${sourceQuery}`)
        .then((r) => r.json())
        .then((data) => setMessages(data.messages ?? []))
        .finally(() => setLoadingMessages(false));
    },
    [sourceQuery],
  );

  const groupChatsByYear = useMemo(() => {
    const map = new Map<number, GroupChatThread[]>();
    for (const g of groupChats) {
      if (!map.has(g.year)) map.set(g.year, []);
      map.get(g.year)!.push(g);
    }
    return [...map.entries()].sort(([a], [b]) => b - a);
  }, [groupChats]);

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
      e.preventDefault();
      clearSelection();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [hasSelection, clearSelection]);

  useEffect(() => {
    if (!hasSelection) return;
    setContactEditing(false);
    setContactCreating(false);
    setEditDraft(null);
  }, [hasSelection]);

  const beginContactEdit = useCallback(() => {
    if (!detail || hasSelection || contactCreating) return;
    setEditDraft(seedContactEditDraft(detail));
    setContactEditing(true);
  }, [detail, hasSelection, contactCreating]);

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
    setSelectedIds(new Set());
    setContactId(null);
    setDetail(null);
    setYearly([]);
    setGroupChats([]);
    setMessageSources([]);
    setSourceCounts({ all: 0, bySource: {} });
    setMessages([]);
    setActiveThread(null);
    loadedContactIdRef.current = null;
    setContactEditing(false);
    setContactCreating(true);
    setEditDraft(emptyContactEditDraft(createDefaults));
    const params = new URLSearchParams(searchParams.toString());
    params.delete("c");
    params.delete("y");
    params.delete("conv");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams, createDefaults]);

  const cancelContactEdit = useCallback(() => {
    setContactEditing(false);
    setContactCreating(false);
    setEditDraft(null);
  }, []);

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
      if (data.contact) {
        setDetail(data.contact);
        selectContact(data.contact.id);
      }
      router.refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }, [editDraft, selectContact, router]);

  const formOpen = (contactEditing || contactCreating) && !!editDraft;
  const canSaveForm =
    !!editDraft &&
    draftHasName(editDraft) &&
    phoneHandlesOnly(phonesForSave(editDraft.phones)).length > 0;
  const canDelete = !contactCreating && (hasSelection || contactId != null);

  const deleteSelectedContacts = useCallback(async () => {
    const ids = hasSelection
      ? selectedContacts.map((c) => c.id)
      : contactId != null
        ? [contactId]
        : [];
    if (ids.length === 0) return;
    const label =
      ids.length === 1
        ? "Delete this contact?"
        : `Delete ${ids.length} contacts?`;
    if (!window.confirm(label)) return;

    setSaving(true);
    try {
      const res = await fetch("/api/contacts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "delete failed");

      setSelectedIds(new Set());
      setGroupOverrides(new Map());
      setExcludeOverrides(new Map());
      selectionDirtyRef.current = false;
      setContactEditing(false);
      setContactCreating(false);
      setEditDraft(null);
      setDetail(null);
      setYearly([]);
      setGroupChats([]);
      setMessageSources([]);
      setSourceCounts({ all: 0, bySource: {} });
      setMessages([]);
      setActiveThread(null);
      setContactId(null);

      const params = new URLSearchParams(searchParams.toString());
      params.delete("c");
      params.delete("y");
      params.delete("conv");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      router.refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }, [
    hasSelection,
    selectedContacts,
    contactId,
    pathname,
    router,
    searchParams,
  ]);

  const groupsFor = useCallback(
    (id: number, fallback: string[]) => groupOverrides.get(id) ?? fallback,
    [groupOverrides],
  );

  const groupTargets = useMemo(() => {
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
  }, [hasSelection, selectedContacts, detail, groupsFor]);

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

      // Optimistic UI so the menu can stay open across multiple toggles.
      setGroupOverrides((prev) => {
        const next = new Map(prev);
        for (const person of targets) {
          const current = next.get(person.id) ?? person.contactGroups;
          const has = current.includes(name);
          if (enable === has) continue;
          const groups = enable
            ? [...current, name].sort((a, b) =>
                a.localeCompare(b, undefined, { sensitivity: "base" }),
              )
            : current.filter((g) => g !== name);
          next.set(person.id, groups);
        }
        return next;
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
          const groups = enable
            ? [...person.contactGroups, name].sort((a, b) =>
                a.localeCompare(b, undefined, { sensitivity: "base" }),
              )
            : person.contactGroups.filter((g) => g !== name);

          if (!hasSelection && person.id === contactId) {
            const ok = await saveContactPatch({ contactGroups: groups });
            if (!ok) throw new Error("save failed");
          } else {
            const res = await fetch(`/api/contacts/${person.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contactGroups: groups }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "save failed");
            if (data.contact && person.id === contactId) {
              setDetail(data.contact);
            }
          }
        }
      } catch (err) {
        console.error(err);
        // Re-sync from server on failure.
        selectionDirtyRef.current = true;
        router.refresh();
        setGroupOverrides(new Map());
      }
    },
    [
      groupTargets,
      hasSelection,
      contactId,
      saveContactPatch,
      router,
      queueStatusMessage,
    ],
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
      void applyGroupMembership(name, true);
    },
    [applyGroupMembership],
  );

  const onSelectionMenuOpenChange = useCallback(
    (open: boolean) => {
      if (open) return;
      if (!selectionDirtyRef.current) return;
      selectionDirtyRef.current = false;
      setGroupOverrides(new Map());
      setExcludeOverrides(new Map());
      router.refresh();
    },
    [router],
  );

  const selectionFieldTargets = useMemo(() => {
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
  }, [hasSelection, selectedContacts, detail, excludeOverrides]);

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
        ? `Excluded ${changed} ${noun}`
        : `Included ${changed} ${noun}`,
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

  const activeThreadMeta = useMemo(() => {
    if (!activeThread) return null;
    if (activeThread.startsWith("y-")) {
      const y = yearly.find((t) => yearThreadKey(t.year) === activeThread);
      if (!y) return null;
      return {
        title: String(y.year),
        dateStart: y.dateStart,
        dateEnd: y.dateEnd,
        messageCount: y.messageCount,
      };
    }
    const g = groupChats.find((t) => isGroupChatThreadKey(t, activeThread));
    if (!g) return null;
    return {
      title: g.title,
      dateStart: g.dateStart,
      dateEnd: g.dateEnd,
      messageCount: g.messageCount,
    };
  }, [activeThread, yearly, groupChats]);

  return (
    <div ref={shellRef} className="flex h-full min-h-0">
      <BrowseContactList
        sidebarWidth={sidebarWidth}
        sectionLabel={sectionLabel}
        selectAllRef={selectAllRef}
        allGroupSelected={allGroupSelected}
        visibleCount={visibleContacts.length}
        sortedCount={sorted.length}
        query={query}
        onQueryChange={setQuery}
        onToggleSelectAll={toggleSelectAllInGroup}
        onNewContact={beginCreateContact}
        sort={sort}
        sortOrder={sortOrder}
        onSortChange={setSort}
        grouped={grouped}
        contactId={contactId}
        selectedIds={selectedIds}
        onSelectColumnClick={onSelectColumnClick}
        onNamePhoneClick={onNamePhoneClick}
      />

      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={startSide}
        className="w-1 shrink-0 cursor-col-resize bg-border hover:bg-accent/60"
      />

      <div
        id={`browse-${paneStorageKey}-right`}
        className="flex min-w-0 flex-1 flex-col"
      >
        <div className="flex h-[45px] shrink-0 items-center gap-2 border-b border-border px-5">
          {formOpen ? (
            <>
              <button
                type="button"
                disabled={saving || (contactCreating && !canSaveForm)}
                onClick={() =>
                  void (contactCreating ? saveContactCreate() : saveContactEdit())
                }
                className="inline-flex items-center rounded-md bg-elevated px-2.5 py-1 text-[12px] text-text transition-colors hover:bg-white/18 disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={cancelContactEdit}
                className="inline-flex items-center rounded-md bg-white/8 px-2.5 py-1 text-[12px] text-muted transition-colors hover:bg-white/14 hover:text-text disabled:opacity-50"
              >
                Cancel
              </button>
              {canDelete && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void deleteSelectedContacts()}
                  className="inline-flex items-center rounded-md bg-white/8 px-2.5 py-1 text-[12px] text-muted transition-colors hover:bg-red-500/15 hover:text-red-300 disabled:opacity-50"
                >
                  Delete
                </button>
              )}
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={!detail || hasSelection}
                onClick={beginContactEdit}
                className="inline-flex items-center gap-1.5 rounded-md bg-elevated px-2.5 py-1 text-[12px] text-muted transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
              >
                <PencilIcon className="size-3.5" />
                Edit
              </button>
              <GroupsMenu
                allGroups={menuGroups}
                checks={groupChecks}
                excludedCheck={excludedCheck}
                disabled={!canEditGroups}
                onToggle={toggleGroup}
                onToggleExcluded={() => void toggleExcludedForSelection()}
                onCreate={createAndAssignGroup}
                onOpenChange={onSelectionMenuOpenChange}
              />
              {canDelete && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void deleteSelectedContacts()}
                  className="inline-flex items-center rounded-md bg-white/8 px-2.5 py-1 text-[12px] text-muted transition-colors hover:bg-red-500/15 hover:text-red-300 disabled:opacity-50"
                >
                  Delete
                </button>
              )}
              <span className="min-w-0 flex-1" aria-hidden />
              {statusMsg && (
                <span className="truncate text-[12px] text-muted">{statusMsg}</span>
              )}
            </>
          )}
        </div>

        <div className="flex h-[45px] shrink-0 items-center border-b border-border px-5">
          {hasSelection ? (
            <h1 className="truncate text-xl font-semibold tracking-tight text-text">
              {selectedIds.size} contact
              {selectedIds.size === 1 ? "" : "s"} selected
            </h1>
          ) : contactCreating && editDraft ? (
            <h1 className="truncate text-xl font-semibold tracking-tight text-text">
              {[editDraft.firstName, editDraft.lastName]
                .map((p) => p.trim())
                .filter(Boolean)
                .join(" ") || "New contact"}
            </h1>
          ) : detail ? (
            <h1 className="truncate text-xl font-semibold tracking-tight text-text">
              {contactEditing && editDraft
                ? [editDraft.firstName, editDraft.lastName]
                    .map((p) => p.trim())
                    .filter(Boolean)
                    .join(" ") || detail.displayName
                : detail.displayName}
            </h1>
          ) : (
            <span className="text-[13px] text-muted">
              {!contactId
                ? "Choose a contact"
                : loadingThreads
                  ? "Loading…"
                  : ""}
            </span>
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
          <div id={splitId} className="flex min-h-0 flex-1 flex-col">
            <BrowseDetailPane
              threadsPct={threadsPct}
              detail={detail}
              contactId={contactId}
              contactCreating={contactCreating}
              formOpen={formOpen}
              editDraft={editDraft}
              onDraftChange={setEditDraft}
              groupsFor={groupsFor}
              excludeOverrides={excludeOverrides}
              sources={sources}
              messageSources={messageSources}
              sourceCounts={sourceCounts}
              source={source}
              onSourceChange={setSource}
              yearly={yearly}
              activeThread={activeThread}
              onLoadYear={(y) =>
                loadMessages(y.conversationIds, y.year, yearThreadKey(y.year))
              }
              groupChatsByYear={groupChatsByYear}
              groupDateFormat={groupDateFormat}
              onGroupDateFormatChange={setGroupDateFormat}
              onLoadGroupChatThread={loadMessages}
            />

            <div
              role="separator"
              aria-orientation="horizontal"
              onMouseDown={startThreads}
              className="h-1 shrink-0 cursor-row-resize bg-border hover:bg-accent/60"
            />

            <BrowseMessagesPane
              activeThread={activeThread}
              loadingMessages={loadingMessages}
              messages={messages}
              activeThreadMeta={activeThreadMeta}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
