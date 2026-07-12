"use client";

import type { ContactListItem, ContactSection, MessageRow } from "@/lib/types";
import { searchContacts } from "@/lib/contactSearch";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SortByMenu, type SortMode } from "./SortByMenu";
import { GroupsMenu, type GroupCheckState } from "./GroupsMenu";
import {
  ContactPhoneList,
  draftHasName,
  emptyContactEditDraft,
  phonesForSave,
  seedContactEditDraft,
  type ContactEditDraft,
} from "./ContactEditPane";
import { MessageBubble } from "./MessageBubble";
import { useSourceFilter } from "./SourceFilter";
import { useResizablePanes } from "./useResizablePanes";

type YearThread = {
  year: number;
  messageCount: number;
  dateStart: string;
  dateEnd: string;
  conversationIds: number[];
};

type GroupThread = {
  conversationId: number;
  conversationIds: number[];
  title: string;
  titleFull: string;
  namedTitle: string | null;
  participantCount: number;
  year: number;
  messageCount: number;
  dateStart: string;
  dateEnd: string;
};

type ContactDetail = ContactListItem & {
  exclude: boolean;
  tags: string[];
  phones: string[];
  dateStart: string | null;
  dateEnd: string | null;
};

type GroupDateFormat = "md" | "mon-d" | "d-mon";

const GROUP_DATE_FORMAT_KEY = "mv-group-date-format";
const SORT_MODE_KEY = "mv-contact-sort";
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

/** Format YYYY-MM-DD for group row dates (year is in the section header). */
function formatGroupDate(isoDate: string, style: GroupDateFormat): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return isoDate;
  const monthNum = Number(m[2]);
  const dayNum = Number(m[3]);
  const mon = MONTH_SHORT[monthNum - 1] ?? m[2];
  switch (style) {
    case "mon-d":
      return `${mon} ${dayNum}`;
    case "d-mon":
      return `${dayNum} ${mon}`;
    case "md":
    default:
      return `${m[2]}-${m[3]}`;
  }
}

function groupDateMeta(
  g: { dateStart: string; dateEnd: string },
  style: GroupDateFormat,
): string {
  const start = formatGroupDate(g.dateStart, style);
  if (g.dateEnd === g.dateStart) return start;
  return `${start} – ${formatGroupDate(g.dateEnd, style)}`;
}

function readStoredGroupDateFormat(): GroupDateFormat {
  if (typeof window === "undefined") return "md";
  const v = localStorage.getItem(GROUP_DATE_FORMAT_KEY);
  if (v === "md" || v === "mon-d" || v === "d-mon") return v;
  return "md";
}

export function BrowseShell({
  section,
  sectionLabel,
  browseSection,
  contacts,
  allTags = [],
  initialContactId,
}: {
  section: string;
  sectionLabel: string;
  browseSection: ContactSection;
  contacts: ContactListItem[];
  allTags?: string[];
  initialContactId: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { sources, source, setSource, sourceQuery } = useSourceFilter();
  const [sort, setSortState] = useState<SortMode>(() => {
    if (typeof window === "undefined") return "last";
    const v = localStorage.getItem(SORT_MODE_KEY);
    return v === "first" || v === "last" ? v : "last";
  });

  const setSort = useCallback((next: SortMode) => {
    setSortState(next);
    localStorage.setItem(SORT_MODE_KEY, next);
  }, []);
  const [query, setQuery] = useState("");
  const [contactId, setContactId] = useState<number | null>(initialContactId);
  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [yearly, setYearly] = useState<YearThread[]>([]);
  const [groups, setGroups] = useState<GroupThread[]>([]);
  const [messageSources, setMessageSources] = useState<string[]>([]);
  const [sourceCounts, setSourceCounts] = useState<{
    all: number;
    bySource: Record<string, number>;
  }>({ all: 0, bySource: {} });
  const [groupDateFormat, setGroupDateFormatState] =
    useState<GroupDateFormat>("md");
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const loadedContactIdRef = useRef<number | null>(null);
  const activeThreadRef = useRef<string | null>(null);
  activeThreadRef.current = activeThread;
  const activeSourceRef = useRef<string | null>(null);
  activeSourceRef.current = source;

  useEffect(() => {
    setGroupDateFormatState(readStoredGroupDateFormat());
  }, []);

  const setGroupDateFormat = useCallback((next: GroupDateFormat) => {
    setGroupDateFormatState(next);
    localStorage.setItem(GROUP_DATE_FORMAT_KEY, next);
  }, []);
  const [contactEditing, setContactEditing] = useState(false);
  const [contactCreating, setContactCreating] = useState(false);
  const [editDraft, setEditDraft] = useState<ContactEditDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [tagOverrides, setTagOverrides] = useState<Map<number, string[]>>(
    () => new Map(),
  );
  const [excludeOverrides, setExcludeOverrides] = useState<Map<number, boolean>>(
    () => new Map(),
  );
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const selectionDirtyRef = useRef(false);
  const statusShowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { sidebarWidth, threadsPct, startSide, startThreads, shellRef } =
    useResizablePanes("browse");

  const saveContactPatch = useCallback(
    async (patch: {
      exclude?: boolean;
      tags?: string[];
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

  /** Excluded contacts stay out of All / tags; No messages may include them. */
  const visibleContacts = useMemo(() => {
    if (browseSection === "excluded") {
      return contacts.filter((c) => isContactExcluded(c));
    }
    if (browseSection === "no-messages") {
      return contacts;
    }
    return contacts.filter((c) => !isContactExcluded(c));
  }, [contacts, browseSection, isContactExcluded]);

  const sorted = useMemo(() => {
    const q = query.trim();
    if (q) {
      return searchContacts(visibleContacts, q);
    }
    const copy = [...visibleContacts];
    copy.sort((a, b) => {
      if (sort === "first") {
        return (
          a.sortFirst.localeCompare(b.sortFirst, undefined, { sensitivity: "base" }) ||
          a.sortLast.localeCompare(b.sortLast, undefined, { sensitivity: "base" })
        );
      }
      return (
        a.sortLast.localeCompare(b.sortLast, undefined, { sensitivity: "base" }) ||
        a.sortFirst.localeCompare(b.sortFirst, undefined, { sensitivity: "base" })
      );
    });
    return copy;
  }, [visibleContacts, sort, query]);

  const grouped = useMemo(() => {
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

  useEffect(() => {
    setSelectedIds(new Set());
    setTagOverrides(new Map());
    setExcludeOverrides(new Map());
    selectionDirtyRef.current = false;
    setContactEditing(false);
    setContactCreating(false);
    setEditDraft(null);
  }, [section, query]);

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

  const sortedIndexById = useMemo(() => {
    const map = new Map<number, number>();
    sorted.forEach((c, i) => map.set(c.id, i));
    return map;
  }, [sorted]);

  const applyRangeSelect = useCallback(
    (id: number) => {
      const clickIndex = sortedIndexById.get(id);
      if (clickIndex === undefined) return;

      const selectedIndices: number[] = [];
      for (const sid of selectedIds) {
        const idx = sortedIndexById.get(sid);
        if (idx !== undefined) selectedIndices.push(idx);
      }

      if (selectedIndices.length === 0) {
        setSelectedIds(new Set([id]));
        return;
      }

      const minSel = Math.min(...selectedIndices);
      const maxSel = Math.max(...selectedIndices);
      const from = Math.min(minSel, clickIndex);
      const to = Math.max(maxSel, clickIndex);
      const next = new Set<number>();
      for (let i = from; i <= to; i++) {
        const c = sorted[i];
        if (c) next.add(c.id);
      }
      setSelectedIds(next);
    },
    [selectedIds, sorted, sortedIndexById],
  );

  /** Checkbox: toggle, or shift-range. */
  const toggleOrRangeSelect = useCallback(
    (id: number, shiftKey: boolean) => {
      if (shiftKey) {
        applyRangeSelect(id);
        return;
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [applyRangeSelect],
  );

  const ctrlToggleSelect = useCallback(
    (id: number) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.size === 0 && contactId != null && contactId !== id) {
          next.add(contactId);
        }
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [contactId],
  );

  const onSelectColumnClick = useCallback(
    (id: number, e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) {
        applyRangeSelect(id);
        return;
      }
      if (e.metaKey || e.ctrlKey) {
        ctrlToggleSelect(id);
        return;
      }
      toggleOrRangeSelect(id, false);
    },
    [applyRangeSelect, ctrlToggleSelect, toggleOrRangeSelect],
  );

  /**
   * Name/phone (or whole row when selection active):
   * - plain, no selection → open detail
   * - shift → range select
   * - ctrl/cmd → toggle (seed focused contact when starting)
   * - plain, selection active → toggle
   */
  const onNamePhoneClick = useCallback(
    (id: number, e: MouseEvent | { shiftKey: boolean; metaKey?: boolean; ctrlKey?: boolean }) => {
      if (e.shiftKey) {
        applyRangeSelect(id);
        return;
      }
      if (e.metaKey || e.ctrlKey) {
        ctrlToggleSelect(id);
        return;
      }
      if (selectedIds.size === 0) {
        selectContact(id);
        return;
      }
      toggleOrRangeSelect(id, false);
    },
    [
      applyRangeSelect,
      ctrlToggleSelect,
      selectContact,
      selectedIds.size,
      toggleOrRangeSelect,
    ],
  );

  useEffect(() => {
    if (!contactId) {
      loadedContactIdRef.current = null;
      setDetail(null);
      setYearly([]);
      setGroups([]);
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
        const nextGroups: GroupThread[] = data.groups ?? [];
        setYearly(nextYearly);
        setGroups(nextGroups);
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
          return nextGroups.some(
            (t) =>
              `g-${(t.conversationIds ?? [t.conversationId]).join("-")}-${t.year}` ===
                prev || `g-${t.conversationId}-${t.year}` === prev,
          )
            ? prev
            : null;
        });

        // Prefer an already-open thread; otherwise auto-open the sole yearly thread.
        let key = activeThreadRef.current;
        if (key?.startsWith("y-")) {
          const year = Number(key.slice(2));
          if (!nextYearly.some((t) => t.year === year)) key = null;
        } else if (key) {
          const stillThere = nextGroups.some(
            (t) =>
              `g-${(t.conversationIds ?? [t.conversationId]).join("-")}-${t.year}` ===
                key || `g-${t.conversationId}-${t.year}` === key,
          );
          if (!stillThere) key = null;
        }
        if (nextYearly.length === 1) {
          key = `y-${nextYearly[0]!.year}`;
          setActiveThread(key);
        } else if (!key) {
          if (switchingContact) setMessages([]);
          return;
        }

        let convIds: number[] | null = null;
        let year: number | null = null;
        if (key.startsWith("y-")) {
          const y = nextYearly.find((t) => `y-${t.year}` === key);
          if (y) {
            convIds = y.conversationIds;
            year = y.year;
          }
        } else {
          const g = nextGroups.find(
            (t) =>
              `g-${(t.conversationIds ?? [t.conversationId]).join("-")}-${t.year}` ===
                key || `g-${t.conversationId}-${t.year}` === key,
          );
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

  const groupsByYear = useMemo(() => {
    const map = new Map<number, GroupThread[]>();
    for (const g of groups) {
      if (!map.has(g.year)) map.set(g.year, []);
      map.get(g.year)!.push(g);
    }
    return [...map.entries()].sort(([a], [b]) => b - a);
  }, [groups]);

  const selectedContacts = useMemo(
    () => sorted.filter((c) => selectedIds.has(c.id)),
    [sorted, selectedIds],
  );
  const hasSelection = selectedContacts.length > 0;
  const canEditGroups =
    !contactEditing && !contactCreating && (hasSelection || !!detail);

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
    if (typeof browseSection === "object") {
      return { tags: [browseSection.tag], exclude: false };
    }
    if (browseSection === "excluded") {
      return { tags: [] as string[], exclude: true };
    }
    // all, untagged / no-group
    return { tags: [] as string[], exclude: false };
  }, [browseSection]);

  const beginCreateContact = useCallback(() => {
    setSelectedIds(new Set());
    setContactId(null);
    setDetail(null);
    setYearly([]);
    setGroups([]);
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
          tags: editDraft.tags,
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
  const canSaveForm = !!editDraft && draftHasName(editDraft);
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
      setTagOverrides(new Map());
      setExcludeOverrides(new Map());
      selectionDirtyRef.current = false;
      setContactEditing(false);
      setContactCreating(false);
      setEditDraft(null);
      setDetail(null);
      setYearly([]);
      setGroups([]);
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

  const tagsFor = useCallback(
    (id: number, fallback: string[]) => tagOverrides.get(id) ?? fallback,
    [tagOverrides],
  );

  const groupTargets = useMemo(() => {
    if (hasSelection) {
      return selectedContacts.map((c) => ({
        id: c.id,
        tags: tagsFor(c.id, c.tags),
      }));
    }
    if (detail) {
      return [{ id: detail.id, tags: tagsFor(detail.id, detail.tags) }];
    }
    return [] as Array<{ id: number; tags: string[] }>;
  }, [hasSelection, selectedContacts, detail, tagsFor]);

  const menuGroups = useMemo(() => {
    const names = new Set(allTags);
    for (const person of groupTargets) {
      for (const tag of person.tags) names.add(tag);
    }
    return [...names].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [allTags, groupTargets]);

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
        if (person.tags.includes(name)) count++;
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
        if (person.tags.includes(name) !== enable) changed++;
      }
      if (changed === 0) return;

      // Optimistic UI so the menu can stay open across multiple toggles.
      setTagOverrides((prev) => {
        const next = new Map(prev);
        for (const person of targets) {
          const current = next.get(person.id) ?? person.tags;
          const has = current.includes(name);
          if (enable === has) continue;
          const tags = enable
            ? [...current, name].sort((a, b) =>
                a.localeCompare(b, undefined, { sensitivity: "base" }),
              )
            : current.filter((t) => t !== name);
          next.set(person.id, tags);
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
          const has = person.tags.includes(name);
          if (enable === has) continue;
          const tags = enable
            ? [...person.tags, name].sort((a, b) =>
                a.localeCompare(b, undefined, { sensitivity: "base" }),
              )
            : person.tags.filter((t) => t !== name);

          if (!hasSelection && person.id === contactId) {
            const ok = await saveContactPatch({ tags });
            if (!ok) throw new Error("save failed");
          } else {
            const res = await fetch(`/api/contacts/${person.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tags }),
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
        setTagOverrides(new Map());
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
      setTagOverrides(new Map());
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
      const y = yearly.find((t) => `y-${t.year}` === activeThread);
      if (!y) return null;
      return {
        title: String(y.year),
        dateStart: y.dateStart,
        dateEnd: y.dateEnd,
        messageCount: y.messageCount,
      };
    }
    const g = groups.find(
      (t) => `g-${t.conversationId}-${t.year}` === activeThread,
    );
    if (!g) return null;
    return {
      title: g.title,
      dateStart: g.dateStart,
      dateEnd: g.dateEnd,
      messageCount: g.messageCount,
    };
  }, [activeThread, yearly, groups]);

  const selectAllRef = useRef<HTMLInputElement>(null);

  const allGroupSelected = useMemo(() => {
    if (visibleContacts.length === 0) return false;
    return visibleContacts.every((c) => selectedIds.has(c.id));
  }, [visibleContacts, selectedIds]);

  const someGroupSelected = useMemo(() => {
    if (visibleContacts.length === 0) return false;
    return visibleContacts.some((c) => selectedIds.has(c.id));
  }, [visibleContacts, selectedIds]);

  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate =
      someGroupSelected && !allGroupSelected;
  }, [someGroupSelected, allGroupSelected]);

  const toggleSelectAllInGroup = useCallback(() => {
    if (allGroupSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(visibleContacts.map((c) => c.id)));
  }, [allGroupSelected, visibleContacts]);

  return (
    <div ref={shellRef} className="flex h-full min-h-0">
      <aside
        className="flex shrink-0 flex-col bg-sidebar"
        style={{ width: sidebarWidth }}
      >
        <div className="flex h-[45px] shrink-0 items-center justify-between border-b border-border px-3">
          <label className="flex min-w-0 items-center gap-2">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allGroupSelected}
              disabled={visibleContacts.length === 0}
              aria-label={`Select all ${sectionLabel}`}
              onChange={toggleSelectAllInGroup}
              className="checkbox-people"
            />
            <span className="truncate text-[13px] text-muted">
              {query.trim() ? `${sorted.length}/` : ""}
              {visibleContacts.length}
            </span>
          </label>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              aria-label="New contact"
              title="New contact"
              onClick={beginCreateContact}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-elevated text-muted hover:text-text"
            >
              <NewContactIcon className="size-4" />
            </button>
            <SortByMenu sort={sort} onChange={setSort} />
          </div>
        </div>
        <div className="flex h-[45px] shrink-0 items-center border-b border-border px-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or phone…"
            className="w-full rounded-md border border-border bg-elevated px-2.5 py-1.5 text-[13px] text-text outline-none placeholder:text-muted focus:border-accent"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {sorted.length === 0 && (
            <p className="px-3 py-4 text-[12px] text-muted">No matches</p>
          )}
          {grouped.map(([letter, items]) => (
            <div key={letter}>
              {!query.trim() && (
                <div className="sticky top-0 z-10 border-b border-border bg-sidebar px-3 py-1 text-[11px] font-semibold text-muted">
                  {letter}
                </div>
              )}
              {items.map((c, i) => {
                const active = c.id === contactId;
                const checked = selectedIds.has(c.id);
                const showInsetDivider = i < items.length - 1;
                const selectionActive = selectedIds.size >= 1;
                return (
                  <div
                    key={c.id}
                    role={selectionActive ? "button" : undefined}
                    tabIndex={selectionActive ? 0 : undefined}
                    onClick={
                      selectionActive
                        ? (e) => onNamePhoneClick(c.id, e)
                        : undefined
                    }
                    onKeyDown={
                      selectionActive
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onNamePhoneClick(c.id, {
                                shiftKey: e.shiftKey,
                                metaKey: e.metaKey,
                                ctrlKey: e.ctrlKey,
                              });
                            }
                          }
                        : undefined
                    }
                    onMouseDown={(e) => {
                      if (e.shiftKey) e.preventDefault();
                    }}
                    className={`relative flex w-full items-start gap-1.5 py-2 pr-3 pl-0 select-none ${
                      selectionActive ? "cursor-pointer" : ""
                    } ${
                      checked
                        ? "bg-accent/20 hover:bg-accent/25"
                        : active
                          ? "bg-elevated hover:bg-white/18"
                          : "hover:bg-white/20"
                    }`}
                  >
                    {active && !selectionActive && (
                      <span
                        aria-hidden
                        className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-full bg-[#c8c8c8]"
                      />
                    )}
                    {checked && (
                      <span
                        aria-hidden
                        className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-full bg-accent"
                      />
                    )}
                    <button
                      type="button"
                      aria-pressed={checked}
                      aria-label={`Select ${c.displayName}`}
                      onClick={(e) => onSelectColumnClick(c.id, e)}
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
                      onClick={(e) => {
                        e.stopPropagation();
                        onNamePhoneClick(c.id, e);
                      }}
                      onMouseDown={(e) => {
                        if (e.shiftKey) e.preventDefault();
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate text-[13px] text-text">
                        {c.displayName}
                      </span>
                      {c.preferredPhone && (
                        <span className="block truncate text-[11px] text-muted">
                          {c.preferredPhone}
                        </span>
                      )}
                    </button>
                    {showInsetDivider && (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute right-3 bottom-0 left-3 h-px bg-border/60"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </aside>

      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={startSide}
        className="w-1 shrink-0 cursor-col-resize bg-border hover:bg-accent/60"
      />

      <div
        id={`browse-${section}-right`}
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
              {statusMsg && (
                <span className="truncate text-[12px] text-muted">{statusMsg}</span>
              )}
            </>
          )}
        </div>

        <div className="flex h-[45px] shrink-0 items-center border-b border-border px-5">
          {hasSelection ? null : contactCreating && editDraft ? (
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
                  {selectedContacts.length} contact
                  {selectedContacts.length === 1 ? "" : "s"} selected
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedIds(new Set());
                    if (selectionDirtyRef.current) {
                      selectionDirtyRef.current = false;
                      setTagOverrides(new Map());
                      setExcludeOverrides(new Map());
                      router.refresh();
                    } else {
                      setTagOverrides(new Map());
                      setExcludeOverrides(new Map());
                    }
                  }}
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
                      {c.preferredPhone ?? ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div
            id="browse-split"
            className="flex min-h-0 flex-1 flex-col"
          >
        <section
          className="min-h-0 flex flex-col overflow-y-auto bg-bg px-5 py-4"
          style={{ height: `${threadsPct}%` }}
        >
          {((detail && contactId) || (contactCreating && editDraft)) && (
            <>
              <div className="rounded-xl border border-border bg-[#2c2c2e] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
                <h2 className="text-[13px] font-semibold text-text">Contact details</h2>
                <div className="mt-3">
                  {formOpen && editDraft && (
                    <div className="mb-3 flex gap-3">
                      <div className="pt-0.5">
                        <PersonDetailIcon className="size-4 shrink-0 text-muted" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] tracking-wide text-muted">Name</div>
                        <div className="mt-0.5 grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={editDraft.firstName}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                firstName: e.target.value,
                              })
                            }
                            placeholder="First"
                            className="rounded-md border border-border bg-transparent px-2 py-1 text-[13px] text-text outline-none placeholder:text-muted focus:border-accent/60"
                          />
                          <input
                            type="text"
                            value={editDraft.lastName}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                lastName: e.target.value,
                              })
                            }
                            placeholder="Last"
                            className="rounded-md border border-border bg-transparent px-2 py-1 text-[13px] text-text outline-none placeholder:text-muted focus:border-accent/60"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex min-w-0 gap-3">
                      <div className="pt-0.5">
                        <PeopleGroupIcon className="size-4 shrink-0 text-muted" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] tracking-wide text-muted">Groups</div>
                        <div className="mt-0.5">
                          {(() => {
                            const shownTags =
                              contactCreating && editDraft
                                ? editDraft.tags
                                : detail
                                  ? tagsFor(detail.id, detail.tags)
                                  : [];
                            if (shownTags.length === 0) {
                              return (
                                <span className="text-[13px] text-muted">
                                  None
                                </span>
                              );
                            }
                            return (
                              <div className="flex flex-col gap-0.5">
                                {shownTags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="truncate text-[13px] text-text"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>

                    <div className="flex min-w-0 gap-3">
                      <div className="pt-0.5">
                        <PhoneIcon className="size-4 shrink-0 text-muted" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] tracking-wide text-muted">
                          {(formOpen && editDraft
                            ? editDraft.phones.filter((p) => p.trim()).length
                            : detail?.phones.length ?? 0) === 1
                            ? "Phone"
                            : "Phones"}
                        </div>
                        <div className="mt-0.5">
                          {formOpen && editDraft ? (
                            <ContactPhoneList
                              phones={editDraft.phones}
                              onChange={(phones) =>
                                setEditDraft({ ...editDraft, phones })
                              }
                            />
                          ) : detail && detail.phones.length > 0 ? (
                            <div className="flex flex-col gap-0.5">
                              {detail.phones.map((phone) => (
                                <span
                                  key={phone}
                                  className="truncate text-[13px] text-text"
                                >
                                  {phone}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[13px] text-muted">None</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex gap-3 border-t border-border/60 pt-2.5">
                    <div className="pt-0.5">
                      <ProhibitedIcon className="size-4 shrink-0 text-muted" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] tracking-wide text-muted">Excluded</div>
                      <div className="mt-0.5">
                        {formOpen && editDraft ? (
                          <select
                            value={editDraft.exclude ? "yes" : "no"}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                exclude: e.target.value === "yes",
                              })
                            }
                            className="rounded-md border border-border bg-[#1c1c1e] px-2 py-1 text-[13px] text-text outline-none focus:border-accent/60"
                          >
                            <option value="no">No</option>
                            <option value="yes">Yes</option>
                          </select>
                        ) : detail ? (
                          <span className="text-[13px] text-text">
                            {(excludeOverrides.get(detail.id) ?? detail.exclude)
                              ? "Yes"
                              : "No"}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {detail?.dateStart && detail.dateEnd && (
                    <div className="mt-3 flex gap-3 border-t border-border/60 pt-2.5">
                      <div className="pt-0.5">
                        <RangeIcon className="size-4 shrink-0 text-muted" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] tracking-wide text-muted">
                          Message range
                        </div>
                        <div className="mt-0.5 text-[13px] text-text">
                          {detail.dateStart === detail.dateEnd
                            ? detail.dateStart
                            : `${detail.dateStart} — ${detail.dateEnd}`}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {!contactCreating && (
              <div className="mt-4 rounded-xl border border-border bg-[#2c2c2e] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
              {sources.length > 0 && (
                <div className="mb-5">
                  <h3 className="text-[11px] font-semibold tracking-wider text-muted uppercase">
                    Message Sources
                  </h3>
                  <div className="mt-2 flex flex-wrap items-start gap-x-0 gap-y-2">
                    {[
                      {
                        id: null as string | null,
                        label: "Combined",
                        enabled: true,
                        count: sourceCounts.all,
                      },
                      ...sources.map((id) => ({
                        id,
                        label: formatSourceLabel(id),
                        enabled: messageSources.includes(id),
                        count: sourceCounts.bySource[id] ?? 0,
                      })),
                    ].map((opt, i) => {
                      const active =
                        opt.id === null ? source === null : source === opt.id;
                      const disabled = !opt.enabled;
                      const countLabel = opt.count.toLocaleString();
                      return (
                        <span key={opt.id ?? "all"} className="flex items-start">
                          {i > 0 && (
                            <span
                              className="mx-2 pt-0.5 text-[13px] text-muted/50"
                              aria-hidden
                            >
                              |
                            </span>
                          )}
                          <button
                            type="button"
                            disabled={disabled}
                            aria-disabled={disabled}
                            title={`${opt.label}: ${countLabel} messages`}
                            onClick={() => {
                              if (disabled) return;
                              setSource(opt.id);
                            }}
                            className={`group flex min-w-0 flex-col items-start text-left ${
                              disabled ? "cursor-default" : ""
                            }`}
                          >
                            <span
                              className={`text-[13px] font-medium leading-tight ${
                                disabled
                                  ? "text-muted/40"
                                  : active
                                    ? "text-accent"
                                    : "text-text group-hover:text-accent"
                              }`}
                            >
                              {opt.label}
                            </span>
                            <span
                              className={`mt-0.5 inline-block w-[6ch] text-[11px] leading-tight tabular-nums ${
                                disabled ? "text-muted/30" : "text-muted"
                              }`}
                            >
                              {countLabel}
                            </span>
                          </button>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
              <div>
                <h3 className="text-[11px] font-semibold tracking-wider text-muted uppercase">
                  Yearly messages
                </h3>
                {yearly.length === 0 ? (
                  <p className="mt-2 text-[12px] text-muted">No individual messages</p>
                ) : (
                  <div className="mt-2 flex flex-wrap items-center gap-y-1.5">
                    {yearly.map((y, i) => {
                      const key = `y-${y.year}`;
                      const active = activeThread === key;
                      return (
                        <span key={key} className="flex items-center">
                          {i > 0 && (
                            <span className="mx-2 text-[13px] text-muted/50" aria-hidden>
                              |
                            </span>
                          )}
                          <button
                            type="button"
                            title={`${y.messageCount} msgs · ${y.dateStart}${
                              y.dateEnd !== y.dateStart ? ` — ${y.dateEnd}` : ""
                            }`}
                            onClick={() =>
                              loadMessages(y.conversationIds, y.year, key)
                            }
                            className={`text-[13px] font-medium ${
                              active
                                ? "text-accent"
                                : "text-text hover:text-accent"
                            }`}
                          >
                            {y.year}
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="mt-5">
                <h3 className="text-[11px] font-semibold tracking-wider text-muted uppercase">
                  Group messages
                </h3>
                {groupsByYear.length === 0 ? (
                  <p className="mt-2 text-[12px] text-muted">No group messages</p>
                ) : (
                  <div className="mt-3 space-y-12">
                    {groupsByYear.map(([year, items], yearIdx) => (
                      <div key={year}>
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <div className="text-[13px] font-semibold text-text">
                            {year}
                          </div>
                          {yearIdx === 0 && (
                            <label className="flex items-center gap-1.5 text-[11px] text-muted">
                              <span className="sr-only">Date format</span>
                              <select
                                value={groupDateFormat}
                                onChange={(e) =>
                                  setGroupDateFormat(
                                    e.target.value as GroupDateFormat,
                                  )
                                }
                                className="rounded border border-border bg-elevated px-1.5 py-0.5 text-[11px] text-text outline-none"
                              >
                                <option value="md">01-31</option>
                                <option value="mon-d">Jan 31</option>
                                <option value="d-mon">31 Jan</option>
                              </select>
                            </label>
                          )}
                        </div>
                        <ul className="divide-y divide-border/50 border-y border-border/50">
                          {items.map((g) => {
                            const convIds = g.conversationIds?.length
                              ? g.conversationIds
                              : [g.conversationId];
                            const key = `g-${convIds.join("-")}-${g.year}`;
                            const active = activeThread === key;
                            return (
                              <li key={key}>
                                <button
                                  type="button"
                                  title={g.titleFull}
                                  onClick={() =>
                                    loadMessages(convIds, g.year, key)
                                  }
                                  className={`flex w-full items-start justify-between gap-4 rounded-md px-2 py-2 text-left text-[13px] ${
                                    active
                                      ? "bg-white/12 text-accent"
                                      : "text-text hover:bg-white/20 hover:text-accent"
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
                                  <span className="shrink-0 pt-0.5 text-[11px] text-muted tabular-nums">
                                    {groupDateMeta(g, groupDateFormat)}
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              </div>
              )}
            </>
          )}
        </section>

        <div
          role="separator"
          aria-orientation="horizontal"
          onMouseDown={startThreads}
          className="h-1 shrink-0 cursor-row-resize bg-border hover:bg-accent/60"
        />

        <section className="min-h-0 flex-1 overflow-y-auto bg-bg px-4 py-4">
          {!activeThread && (
            <p className="pt-8 text-center text-[13px] text-muted">
              Select a year or group thread to read messages.
            </p>
          )}
          {loadingMessages && messages.length === 0 && (
            <p className="pt-8 text-center text-[13px] text-muted">Loading messages…</p>
          )}
          {activeThreadMeta && messages.length > 0 && (
            <div
              className={`mx-auto flex max-w-2xl flex-col gap-2 ${
                loadingMessages ? "opacity-60" : ""
              }`}
            >
              <div className="mb-2 border-b border-border/60 pb-2 text-center">
                <div className="text-[13px] font-medium text-text">
                  {activeThreadMeta.title}
                </div>
                <div className="mt-0.5 text-[12px] text-muted">
                  {activeThreadMeta.messageCount} msgs
                  <span className="mx-1.5">·</span>
                  {activeThreadMeta.dateStart === activeThreadMeta.dateEnd
                    ? activeThreadMeta.dateStart
                    : `${activeThreadMeta.dateStart} — ${activeThreadMeta.dateEnd}`}
                </div>
              </div>
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
            </div>
          )}
        </section>
          </div>
        )}
      </div>
    </div>
  );
}

function formatSourceLabel(id: string): string {
  const known: Record<string, string> = {
    imessage: "iMessage",
    "go-sms-pro": "GO SMS Pro",
    "sms-backup-plus": "SMS Backup Plus",
    "sms-backup-restore": "SMS Backup Restore",
  };
  if (known[id]) return known[id];
  return id
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
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

function NewContactIcon({ className }: { className?: string }) {
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
      <circle cx="8.5" cy="7.5" r="3" />
      <path d="M2.5 19c.55-2.85 2.6-4.5 6-4.5 1.2 0 2.25.2 3.15.55" />
      <path d="M17.5 10.5v9M13 15h9" strokeWidth="2.25" />
    </svg>
  );
}

function PersonDetailIcon({ className }: { className?: string }) {
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
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5 19.25c.85-3.2 3.4-5 7-5s6.15 1.8 7 5" />
    </svg>
  );
}

function PeopleGroupIcon({ className }: { className?: string }) {
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
      <circle cx="9" cy="8" r="3.25" />
      <path d="M2.75 19.25c.6-3.1 2.85-4.75 6.25-4.75s5.65 1.65 6.25 4.75" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M14.5 19.25c.35-1.85 1.55-3.1 3.5-3.55" />
    </svg>
  );
}

function ProhibitedIcon({ className }: { className?: string }) {
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
      <circle cx="12" cy="12" r="8.25" />
      <path d="M6.2 6.2 17.8 17.8" />
    </svg>
  );
}

function RangeIcon({ className }: { className?: string }) {
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
      <rect x="3.5" y="5.5" width="17" height="15" rx="2" />
      <path d="M8 3.5v4M16 3.5v4M3.5 10.5h17" />
    </svg>
  );
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M6.62 10.79a15.15 15.15 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.4 21 3 13.6 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.25 1.02l-2.2 2.19Z" />
    </svg>
  );
}
