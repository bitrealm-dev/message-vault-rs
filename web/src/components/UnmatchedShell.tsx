"use client";

import type {
  ContactListItem,
  MessageRow,
  UnmatchedHandle,
  YearThread,
} from "@/lib/types";
import { searchContacts } from "@/lib/contactSearch";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ContactPhoneList,
  displayGroupNames,
  draftHasName,
  emptyContactEditDraft,
  phonesForSave,
  type ContactEditDraft,
} from "./ContactEditPane";
import { GroupsMenu, type GroupCheckState } from "./GroupsMenu";
import { MessageAttachments } from "./MessageAttachments";
import {
  UnmatchedSortMenu,
  type SortOrder,
  type UnmatchedSortBy,
} from "./SortByMenu";
import { useSourceFilter } from "./SourceFilter";
import { useResizablePanes } from "./useResizablePanes";

const UNMATCHED_SORT_ORDER_KEY = "mv-unmatched-sort-order";
const UNMATCHED_SORT_BY_KEY = "mv-unmatched-sort-by";

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

export function UnmatchedShell({
  handles: initialHandles,
  assignContacts,
  initialHandle,
  tags: allTags = [],
  mode = "unmatched",
}: {
  handles: UnmatchedHandle[];
  assignContacts: ContactListItem[];
  initialHandle: string | null;
  tags?: string[];
  mode?: "unmatched" | "trash";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { sources, source, setSource, sourceQuery } = useSourceFilter();
  const [handles, setHandles] = useState(initialHandles);
  const [sortBy, setSortByState] = useState<UnmatchedSortBy>(() => {
    if (typeof window === "undefined") return "phone";
    const v = localStorage.getItem(UNMATCHED_SORT_BY_KEY);
    return v === "phone" || v === "date" || v === "messages" ? v : "phone";
  });
  const [sortOrder, setSortOrderState] = useState<SortOrder>(() => {
    if (typeof window === "undefined") return "asc";
    const v = localStorage.getItem(UNMATCHED_SORT_ORDER_KEY);
    return v === "asc" || v === "desc" ? v : "asc";
  });
  const setUnmatchedSort = useCallback(
    (next: { sortBy: UnmatchedSortBy; order: SortOrder }) => {
      setSortByState(next.sortBy);
      setSortOrderState(next.order);
      localStorage.setItem(UNMATCHED_SORT_BY_KEY, next.sortBy);
      localStorage.setItem(UNMATCHED_SORT_ORDER_KEY, next.order);
    },
    [],
  );
  const [handle, setHandle] = useState<string | null>(initialHandle);
  const [yearly, setYearly] = useState<YearThread[]>([]);
  const [messageSources, setMessageSources] = useState<string[]>([]);
  const [sourceCounts, setSourceCounts] = useState<{
    all: number;
    bySource: Record<string, number>;
  }>({ all: 0, bySource: {} });
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [activeYear, setActiveYear] = useState<number | null>(null);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState<ContactEditDraft | null>(null);
  const [extraGroups, setExtraGroups] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [assignMode, setAssignMode] = useState<
    null | "header" | { x: number; y: number }
  >(null);
  const [assignQuery, setAssignQuery] = useState("");
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    handle?: string;
  } | null>(null);
  const [selectedHandles, setSelectedHandles] = useState<Set<string>>(
    () => new Set(),
  );
  const [status, setStatus] = useState<string | null>(null);
  const assignRef = useRef<HTMLDivElement>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);
  const selectionAnchorRef = useRef<string | null>(null);
  const { sidebarWidth, threadsPct, startSide, startThreads, shellRef } =
    useResizablePanes("browse");

  const selected = handles.find((h) => h.handle === handle) ?? null;
  const multiSelected = selectedHandles.size > 1;

  const sortedHandles = useMemo(() => {
    const copy = [...handles];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "messages") {
        cmp = a.messageCount - b.messageCount;
        if (cmp === 0) {
          cmp = a.handle.localeCompare(b.handle, undefined, {
            sensitivity: "base",
          });
        }
      } else if (sortBy === "date") {
        const aDate = a.dateEnd ?? a.dateStart ?? "";
        const bDate = b.dateEnd ?? b.dateStart ?? "";
        cmp = aDate.localeCompare(bDate);
        if (cmp === 0) {
          cmp = a.handle.localeCompare(b.handle, undefined, {
            sensitivity: "base",
          });
        }
      } else {
        cmp = a.handle.localeCompare(b.handle, undefined, {
          sensitivity: "base",
        });
      }
      return sortOrder === "desc" ? -cmp : cmp;
    });
    return copy;
  }, [handles, sortBy, sortOrder]);

  const selectedItems = useMemo(
    () => sortedHandles.filter((h) => selectedHandles.has(h.handle)),
    [sortedHandles, selectedHandles],
  );

  const clearSelection = useCallback(() => {
    setSelectedHandles(new Set());
    selectionAnchorRef.current = null;
  }, []);

  const allHandlesSelected = useMemo(() => {
    if (sortedHandles.length === 0) return false;
    return sortedHandles.every((h) => selectedHandles.has(h.handle));
  }, [sortedHandles, selectedHandles]);

  const someHandlesSelected = useMemo(() => {
    if (sortedHandles.length === 0) return false;
    return sortedHandles.some((h) => selectedHandles.has(h.handle));
  }, [sortedHandles, selectedHandles]);

  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate =
      someHandlesSelected && !allHandlesSelected;
  }, [someHandlesSelected, allHandlesSelected]);

  const toggleSelectAll = useCallback(() => {
    if (allHandlesSelected) {
      clearSelection();
      return;
    }
    setSelectedHandles(new Set(sortedHandles.map((h) => h.handle)));
    selectionAnchorRef.current = sortedHandles[0]?.handle ?? null;
  }, [allHandlesSelected, clearSelection, sortedHandles]);

  const actionTargets = useMemo(() => {
    if (multiSelected) return selectedItems.map((h) => h.handle);
    if (handle) return [handle];
    return [] as string[];
  }, [multiSelected, selectedItems, handle]);

  const sortedIndexByHandle = useMemo(() => {
    const map = new Map<string, number>();
    sortedHandles.forEach((h, i) => map.set(h.handle, i));
    return map;
  }, [sortedHandles]);

  const selectHandle = useCallback(
    (next: string) => {
      setHandle(next);
      setMessages([]);
      setActiveYear(null);
      setAssignMode(null);
      setCtxMenu(null);
      setSelectedHandles(new Set());
      selectionAnchorRef.current = next;
      const params = new URLSearchParams(searchParams.toString());
      params.set("h", next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // Default to create/edit when a single unmatched handle is focused.
  const createHandleRef = useRef<string | null>(null);
  useEffect(() => {
    if (mode !== "unmatched") {
      createHandleRef.current = null;
      setCreating(false);
      setCreateDraft(null);
      return;
    }
    if (multiSelected || !handle) {
      createHandleRef.current = null;
      setCreating(false);
      setCreateDraft(null);
      return;
    }
    setCreating(true);
    if (createHandleRef.current === handle) return;
    createHandleRef.current = handle;
    const row = handles.find((h) => h.handle === handle);
    setExtraGroups([]);
    setCreateDraft({
      ...emptyContactEditDraft(),
      firstName: row?.nameHint?.trim() ?? "",
      phones: [handle, ""],
    });
  }, [handle, mode, multiSelected, handles]);

  const cancelCreate = useCallback(() => {
    createHandleRef.current = null;
    setCreating(false);
    setCreateDraft(null);
    setExtraGroups([]);
    setHandle(null);
    setYearly([]);
    setMessages([]);
    setActiveYear(null);
    setMessageSources([]);
    setSourceCounts({ all: 0, bySource: {} });
    const params = new URLSearchParams(searchParams.toString());
    params.delete("h");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const menuGroups = useMemo(() => {
    const names = new Set([...allTags, ...extraGroups]);
    for (const t of createDraft?.tags ?? []) names.add(t);
    return [...names].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [allTags, extraGroups, createDraft?.tags]);

  const draftGroupChecks = useMemo(() => {
    const result: Record<string, GroupCheckState> = {};
    const tags = createDraft?.tags ?? [];
    for (const name of menuGroups) {
      result[name] = tags.includes(name) ? "on" : "off";
    }
    return result;
  }, [menuGroups, createDraft?.tags]);

  const draftExcludedCheck = useMemo((): GroupCheckState => {
    return createDraft?.exclude ? "on" : "off";
  }, [createDraft?.exclude]);

  const toggleDraftGroup = useCallback((name: string) => {
    setCreateDraft((prev) => {
      if (!prev) return prev;
      const has = prev.tags.includes(name);
      const tags = has
        ? prev.tags.filter((t) => t !== name)
        : [...prev.tags, name].sort((a, b) =>
            a.localeCompare(b, undefined, { sensitivity: "base" }),
          );
      return { ...prev, tags };
    });
  }, []);

  const createAndAssignDraftGroup = useCallback((name: string) => {
    setExtraGroups((prev) =>
      prev.includes(name) ? prev : [...prev, name],
    );
    setCreateDraft((prev) => {
      if (!prev) return prev;
      if (prev.tags.includes(name)) return prev;
      return {
        ...prev,
        tags: [...prev.tags, name].sort((a, b) =>
          a.localeCompare(b, undefined, { sensitivity: "base" }),
        ),
      };
    });
  }, []);

  const toggleDraftExcluded = useCallback(() => {
    setCreateDraft((prev) =>
      prev ? { ...prev, exclude: !prev.exclude } : prev,
    );
  }, []);

  const applyRangeSelect = useCallback(
    (target: string) => {
      const clickIndex = sortedIndexByHandle.get(target);
      if (clickIndex === undefined) return;
      const anchor = selectionAnchorRef.current;
      const anchorIndex =
        anchor != null ? sortedIndexByHandle.get(anchor) : undefined;
      if (anchorIndex === undefined) {
        setSelectedHandles(new Set([target]));
        selectionAnchorRef.current = target;
        return;
      }
      const from = Math.min(anchorIndex, clickIndex);
      const to = Math.max(anchorIndex, clickIndex);
      const next = new Set<string>();
      for (let i = from; i <= to; i++) {
        const row = sortedHandles[i];
        if (row) next.add(row.handle);
      }
      setSelectedHandles(next);
    },
    [sortedHandles, sortedIndexByHandle],
  );

  const toggleOrRangeSelect = useCallback(
    (target: string, shiftKey: boolean) => {
      if (shiftKey) {
        applyRangeSelect(target);
        return;
      }
      setSelectedHandles((prev) => {
        const next = new Set(prev);
        if (next.has(target)) next.delete(target);
        else next.add(target);
        return next;
      });
      selectionAnchorRef.current = target;
      setCreating(false);
      setCreateDraft(null);
      setAssignMode(null);
      setCtxMenu(null);
    },
    [applyRangeSelect],
  );

  const ctrlToggleSelect = useCallback(
    (target: string) => {
      setSelectedHandles((prev) => {
        const n = new Set(prev);
        // Seed with focused handle so ctrl-clicking a second row selects both.
        if (n.size === 0 && handle && handle !== target) n.add(handle);
        if (n.has(target)) n.delete(target);
        else n.add(target);
        return n;
      });
      selectionAnchorRef.current = target;
      setCreating(false);
      setCreateDraft(null);
      setAssignMode(null);
      setCtxMenu(null);
    },
    [handle],
  );

  const onSelectColumnClick = useCallback(
    (target: string, e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) {
        applyRangeSelect(target);
        setCreating(false);
        setCreateDraft(null);
        setAssignMode(null);
        setCtxMenu(null);
        return;
      }
      if (e.metaKey || e.ctrlKey) {
        ctrlToggleSelect(target);
        return;
      }
      toggleOrRangeSelect(target, false);
    },
    [applyRangeSelect, ctrlToggleSelect, toggleOrRangeSelect],
  );

  const onRowClick = useCallback(
    (next: string, e: MouseEvent) => {
      if (e.shiftKey) {
        e.preventDefault();
        applyRangeSelect(next);
        setCreating(false);
        setCreateDraft(null);
        setAssignMode(null);
        setCtxMenu(null);
        return;
      }
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        ctrlToggleSelect(next);
        return;
      }
      selectHandle(next);
    },
    [applyRangeSelect, ctrlToggleSelect, selectHandle],
  );

  const clampMenu = (x: number, y: number, w: number, h: number) => ({
    x: Math.max(8, Math.min(x, window.innerWidth - w - 8)),
    y: Math.max(8, Math.min(y, window.innerHeight - h - 8)),
  });

  useEffect(() => {
    setHandles(initialHandles);
    if (handle && !initialHandles.some((h) => h.handle === handle)) {
      setHandle(null);
      setYearly([]);
      setMessages([]);
      setActiveYear(null);
    }
    setSelectedHandles((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<string>();
      for (const h of prev) {
        if (initialHandles.some((row) => row.handle === h)) next.add(h);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [initialHandles, handle]);

  useEffect(() => {
    if (multiSelected) {
      setYearly([]);
      setMessages([]);
      setActiveYear(null);
      setMessageSources([]);
      setSourceCounts({ all: 0, bySource: {} });
      setCreating(false);
      setCreateDraft(null);
      return;
    }
    if (!handle) {
      setYearly([]);
      setMessageSources([]);
      setSourceCounts({ all: 0, bySource: {} });
      return;
    }
    let cancelled = false;
    setLoadingThreads(true);
    const qs = new URLSearchParams({ handle });
    if (source) qs.set("source", source);
    fetch(`/api/unmatched/threads?${qs.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setYearly([]);
          setMessageSources([]);
          setSourceCounts({ all: 0, bySource: {} });
          return;
        }
        const nextYearly: YearThread[] = data.yearly ?? [];
        setYearly(nextYearly);
        setMessageSources(data.messageSources ?? []);
        setSourceCounts(data.sourceCounts ?? { all: 0, bySource: {} });

        const available: string[] = data.messageSources ?? [];
        if (source && !available.includes(source)) {
          setSource(null);
        }

        if (nextYearly.length === 1) {
          const y = nextYearly[0]!;
          setActiveYear(y.year);
          setLoadingMessages(true);
          const ids = y.conversationIds.join(",");
          fetch(
            `/api/messages?conversationIds=${ids}&year=${y.year}${sourceQuery}`,
          )
            .then((r) => r.json())
            .then((msgData) => {
              if (!cancelled) setMessages(msgData.messages ?? []);
            })
            .finally(() => {
              if (!cancelled) setLoadingMessages(false);
            });
        } else if (
          activeYear != null &&
          nextYearly.some((t) => t.year === activeYear)
        ) {
          const y = nextYearly.find((t) => t.year === activeYear)!;
          setLoadingMessages(true);
          const ids = y.conversationIds.join(",");
          fetch(
            `/api/messages?conversationIds=${ids}&year=${y.year}${sourceQuery}`,
          )
            .then((r) => r.json())
            .then((msgData) => {
              if (!cancelled) setMessages(msgData.messages ?? []);
            })
            .finally(() => {
              if (!cancelled) setLoadingMessages(false);
            });
        } else {
          setActiveYear(null);
          setMessages([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingThreads(false);
      });
    return () => {
      cancelled = true;
    };
    // activeYear intentionally omitted — only reload on handle/source change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handle, source, sourceQuery, setSource, multiSelected]);

  useEffect(() => {
    if (!multiSelected && selectedHandles.size === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (ctxMenu || assignMode) return;
      clearSelection();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [
    multiSelected,
    selectedHandles.size,
    ctxMenu,
    assignMode,
    clearSelection,
  ]);

  const loadYear = (year: number, conversationIds: number[]) => {
    setActiveYear(year);
    setLoadingMessages(true);
    const ids = conversationIds.join(",");
    fetch(`/api/messages?conversationIds=${ids}&year=${year}${sourceQuery}`)
      .then((r) => r.json())
      .then((data) => setMessages(data.messages ?? []))
      .finally(() => setLoadingMessages(false));
  };

  const clearFocusAfterRemoval = (phones: string[]) => {
    const removed = new Set(phones);
    setHandles((prev) => prev.filter((h) => !removed.has(h.handle)));
    clearSelection();
    if (handle && removed.has(handle)) {
      setHandle(null);
      setYearly([]);
      setMessages([]);
      setActiveYear(null);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("h");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  };

  const saveCreate = async () => {
    if (!createDraft || !handle || !draftHasName(createDraft)) return;
    setSaving(true);
    try {
      const fromDraft = phonesForSave(createDraft.phones);
      const phones = fromDraft.includes(handle)
        ? fromDraft
        : [handle, ...fromDraft];
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: createDraft.firstName.trim() || null,
          lastName: createDraft.lastName.trim() || null,
          phones,
          exclude: createDraft.exclude,
          tags: createDraft.tags,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "create failed");
      router.push(`/all?c=${data.contact.id}`);
      router.refresh();
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  };

  const assignFiltered = useMemo(() => {
    const q = assignQuery.trim();
    const byFirst = (a: ContactListItem, b: ContactListItem) =>
      a.sortFirst.localeCompare(b.sortFirst, undefined, {
        sensitivity: "base",
      }) ||
      a.sortLast.localeCompare(b.sortLast, undefined, { sensitivity: "base" });
    if (!q) {
      return [...assignContacts].sort(byFirst).slice(0, 40);
    }
    return searchContacts(assignContacts, q).slice(0, 40);
  }, [assignContacts, assignQuery]);

  useEffect(() => {
    if (!assignMode) return;
    const onDoc = (e: globalThis.MouseEvent) => {
      if (!assignRef.current?.contains(e.target as Node)) setAssignMode(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAssignMode(null);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [assignMode]);

  useEffect(() => {
    if (!ctxMenu) return;
    const onDoc = (e: globalThis.MouseEvent) => {
      if (!ctxMenuRef.current?.contains(e.target as Node)) setCtxMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCtxMenu(null);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [ctxMenu]);

  const assignToContact = async (contactId: number) => {
    const targets = actionTargets;
    if (targets.length === 0) return;
    setSaving(true);
    setCtxMenu(null);
    try {
      let displayName = "";
      for (const phone of targets) {
        const res = await fetch(`/api/contacts/${contactId}/phones`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "assign failed");
        displayName = data.contact.displayName;
      }
      setAssignMode(null);
      setStatus(
        targets.length === 1
          ? `Added to ${displayName}`
          : `Added ${targets.length} handles to ${displayName}`,
      );
      clearFocusAfterRemoval(targets);
      router.refresh();
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : "Assign failed");
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const moveToTrash = async () => {
    if (mode !== "unmatched") return;
    const targets = actionTargets;
    if (targets.length === 0) return;
    setSaving(true);
    setCtxMenu(null);
    try {
      for (const phone of targets) {
        const res = await fetch("/api/unmatched/trash", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle: phone }),
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
      router.refresh();
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : "Delete failed");
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const restoreFromTrash = async (forHandle?: string) => {
    if (mode !== "trash") return;
    const targets =
      forHandle && !multiSelected ? [forHandle] : actionTargets;
    if (targets.length === 0) return;
    setSaving(true);
    setCtxMenu(null);
    try {
      for (const phone of targets) {
        const res = await fetch("/api/unmatched/trash", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle: phone }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "undelete failed");
      }
      setStatus(
        targets.length === 1
          ? "Undeleted — back in Unassigned"
          : `Undeleted ${targets.length} handles`,
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

  const permanentlyDeleteFromTrash = async (forHandle?: string) => {
    if (mode !== "trash") return;
    const targets =
      forHandle && !multiSelected ? [forHandle] : actionTargets;
    if (targets.length === 0) return;
    setSaving(true);
    setCtxMenu(null);
    try {
      for (const phone of targets) {
        const res = await fetch("/api/unmatched/trash", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle: phone, permanent: true }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "permanent delete failed");
      }
      setStatus(
        targets.length === 1
          ? "Permanently deleted"
          : `Permanently deleted ${targets.length} handles`,
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

  const openCtxMenuAt = (
    x: number,
    y: number,
    nextHandle: string,
    menuH: number,
  ) => {
    if (multiSelected && selectedHandles.has(nextHandle)) {
      setAssignMode(null);
      setCtxMenu({ ...clampMenu(x, y, 200, menuH), handle: nextHandle });
      return;
    }
    if (multiSelected) {
      selectHandle(nextHandle);
      setCtxMenu({ ...clampMenu(x, y, 200, menuH), handle: nextHandle });
      return;
    }
    if (nextHandle !== handle) selectHandle(nextHandle);
    else setAssignMode(null);
    setCtxMenu({ ...clampMenu(x, y, 200, menuH), handle: nextHandle });
  };

  const openTrashMenu = (x: number, y: number, nextHandle: string) => {
    openCtxMenuAt(x, y, nextHandle, 88);
  };

  const assignSearch = (
    <div className="w-72 rounded-lg border border-border bg-elevated shadow-xl">
      <input
        autoFocus
        value={assignQuery}
        onChange={(e) => setAssignQuery(e.target.value)}
        placeholder="Search contacts…"
        className="w-full border-b border-border bg-transparent px-3 py-2 text-[13px] text-text outline-none placeholder:text-muted"
      />
      <div className="max-h-64 overflow-y-auto py-1">
        {assignFiltered.length === 0 ? (
          <p className="px-3 py-2 text-[12px] text-muted">No matches</p>
        ) : (
          assignFiltered.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => void assignToContact(c.id)}
              className="flex w-full flex-col px-3 py-1.5 text-left hover:bg-white/15"
            >
              <span className="truncate text-[13px] text-text">
                {c.displayName}
              </span>
              {c.preferredPhone && (
                <span className="truncate text-[11px] text-muted">
                  {c.preferredPhone}
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );

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
              checked={allHandlesSelected}
              disabled={sortedHandles.length === 0}
              aria-label={
                mode === "trash" ? "Select all trash" : "Select all unassigned"
              }
              onChange={toggleSelectAll}
              className="checkbox-people"
            />
            <span className="truncate text-[13px] text-muted">
              {handles.length}
            </span>
          </label>
          <UnmatchedSortMenu
            sortBy={sortBy}
            order={sortOrder}
            onChange={setUnmatchedSort}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {sortedHandles.length === 0 && (
            <p className="px-3 py-4 text-[12px] text-muted">
              {mode === "trash"
                ? "Trash is empty"
                : "No unassigned 1:1 threads"}
            </p>
          )}
          {sortedHandles.map((h) => {
            const selectionActive = selectedHandles.size >= 1;
            const checked = selectedHandles.has(h.handle);
            const focused = h.handle === handle && !selectionActive;
            const rowActive = selectionActive ? checked : focused;
            return (
              <div
                key={h.handle}
                className={`group relative flex items-start gap-1.5 border-b border-border/60 py-2 pr-2 pl-0 select-none ${
                  checked
                    ? "bg-accent/20 hover:bg-accent/25"
                    : focused
                      ? "bg-elevated hover:bg-white/18"
                      : "hover:bg-white/20"
                }`}
              >
                {rowActive && (
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
                  aria-label={`Select ${h.displayName}`}
                  onClick={(e) => onSelectColumnClick(h.handle, e)}
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
                  onClick={(e) => onRowClick(h.handle, e)}
                  onMouseDown={(e) => {
                    if (e.shiftKey) e.preventDefault();
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (mode === "trash") {
                      openTrashMenu(e.clientX, e.clientY, h.handle);
                    } else {
                      openCtxMenuAt(
                        e.clientX,
                        e.clientY,
                        h.handle,
                        multiSelected && selectedHandles.has(h.handle)
                          ? 88
                          : 140,
                      );
                    }
                  }}
                  className="flex min-w-0 flex-1 items-start justify-between gap-2 text-left"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-text">
                      {h.displayName}
                    </span>
                    {h.nameHint && (
                      <span className="block truncate text-[11px] text-muted">
                        {h.handle}
                      </span>
                    )}
                    {h.dateStart && (
                      <span className="block text-[11px] text-muted">
                        {h.dateStart === h.dateEnd || !h.dateEnd
                          ? h.dateStart
                          : `${h.dateStart} — ${h.dateEnd}`}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-muted">
                    {h.messageCount.toLocaleString()}
                  </span>
                </button>
                {mode === "trash" && (
                  <button
                    type="button"
                    aria-label={`Trash options for ${h.displayName}`}
                    disabled={saving}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const r = e.currentTarget.getBoundingClientRect();
                      openTrashMenu(r.right - 8, r.bottom + 2, h.handle);
                    }}
                    className={`mr-0.5 shrink-0 self-center rounded p-0.5 text-muted hover:bg-white/10 hover:text-text disabled:opacity-40 ${
                      rowActive
                        ? "opacity-100"
                        : "opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    <EllipsisIcon className="size-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      <div
        role="separator"
        aria-orientation="vertical"
        onMouseDown={startSide}
        className="w-1 shrink-0 cursor-col-resize bg-border hover:bg-accent/60"
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-[45px] shrink-0 items-center justify-between gap-3 border-b border-border bg-panel px-4">
          <h1 className="truncate text-xl font-semibold tracking-tight text-text">
            {multiSelected
              ? `${selectedHandles.size} selected`
              : creating && createDraft
                ? [createDraft.firstName, createDraft.lastName]
                    .map((p) => p.trim())
                    .filter(Boolean)
                    .join(" ") ||
                  selected?.displayName ||
                  "New contact"
                : (selected?.displayName ??
                  (mode === "trash" ? "Trash" : "Unassigned"))}
          </h1>
          {multiSelected && (
            <div className="flex shrink-0 items-center gap-2">
              {mode === "unmatched" && (
                <div className="relative">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      setAssignQuery("");
                      setAssignMode((m) => (m === "header" ? null : "header"));
                    }}
                    className="rounded-md border border-border px-2.5 py-1 text-[12px] text-text hover:bg-white/15"
                  >
                    Add to existing contact
                  </button>
                  {assignMode === "header" && (
                    <div ref={assignRef} className="absolute right-0 z-30 mt-1">
                      {assignSearch}
                    </div>
                  )}
                </div>
              )}
              {mode === "unmatched" ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void moveToTrash()}
                  className="rounded-md border border-border px-2.5 py-1 text-[12px] text-text hover:bg-red-500/15 hover:text-red-300"
                >
                  Delete
                </button>
              ) : (
                <button
                  type="button"
                  disabled={saving}
                  aria-label="Trash options"
                  aria-expanded={Boolean(ctxMenu)}
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    if (ctxMenu) {
                      setCtxMenu(null);
                      return;
                    }
                    const target = selectedItems[0]?.handle;
                    if (!target) return;
                    openTrashMenu(r.right - 188, r.bottom + 4, target);
                  }}
                  className="rounded-md border border-border p-1.5 text-text hover:bg-white/15 disabled:opacity-40"
                >
                  <EllipsisIcon className="size-3.5" />
                </button>
              )}
            </div>
          )}
          {creating && createDraft && !multiSelected && mode === "unmatched" && (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                disabled={saving || !draftHasName(createDraft)}
                onClick={() => void saveCreate()}
                className="inline-flex items-center rounded-md bg-elevated px-2.5 py-1 text-[12px] text-text transition-colors hover:bg-white/18 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={cancelCreate}
                className="inline-flex items-center rounded-md bg-white/8 px-2.5 py-1 text-[12px] text-muted transition-colors hover:bg-white/14 hover:text-text disabled:opacity-50"
              >
                Cancel
              </button>
              <GroupsMenu
                allGroups={menuGroups}
                checks={draftGroupChecks}
                excludedCheck={draftExcludedCheck}
                onToggle={toggleDraftGroup}
                onToggleExcluded={toggleDraftExcluded}
                onCreate={createAndAssignDraftGroup}
              />
              <div className="relative">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setAssignQuery("");
                    setAssignMode((m) => (m === "header" ? null : "header"));
                  }}
                  className="rounded-md border border-border px-2.5 py-1 text-[12px] text-text hover:bg-white/15"
                >
                  Add to existing contact
                </button>
                {assignMode === "header" && (
                  <div ref={assignRef} className="absolute right-0 z-30 mt-1">
                    {assignSearch}
                  </div>
                )}
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => void moveToTrash()}
                className="inline-flex items-center rounded-md bg-white/8 px-2.5 py-1 text-[12px] text-muted transition-colors hover:bg-red-500/15 hover:text-red-300 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          )}
          {mode === "trash" && selected && !multiSelected && (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                disabled={saving}
                aria-label="Trash options"
                aria-expanded={Boolean(ctxMenu)}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  if (ctxMenu) {
                    setCtxMenu(null);
                    return;
                  }
                  if (!handle) return;
                  openTrashMenu(r.right - 188, r.bottom + 4, handle);
                }}
                className="rounded-md border border-border p-1.5 text-text hover:bg-white/15 disabled:opacity-40"
              >
                <EllipsisIcon className="size-3.5" />
              </button>
            </div>
          )}
        </div>

        {status && (
          <div className="border-b border-border bg-elevated px-4 py-1.5 text-[12px] text-muted">
            {status}
          </div>
        )}

        <div id="browse-split" className="flex min-h-0 flex-1 flex-col">
        <section
          className="flex flex-col overflow-y-auto bg-panel px-5 py-4"
          style={{ height: `${threadsPct}%`, minHeight: 140 }}
        >
          {multiSelected ? (
            <div className="rounded-xl border border-border bg-[#2c2c2e] shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
              <div className="flex items-center justify-between gap-3 border-b border-border/80 px-4 py-3">
                <h2 className="text-[14px] font-semibold text-text">
                  {selectedItems.length}{" "}
                  {mode === "trash" ? "trashed" : "unassigned"} handle
                  {selectedItems.length === 1 ? "" : "s"} selected
                </h2>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="inline-flex items-center rounded-md bg-white/12 px-2.5 py-1 text-[12px] text-text transition-colors hover:bg-white/18"
                >
                  Clear selection
                </button>
              </div>
              <ul className="max-h-64 overflow-y-auto">
                {selectedItems.map((h, i) => (
                  <li
                    key={h.handle}
                    className={`flex items-center justify-between gap-4 px-4 py-2.5 ${
                      i < selectedItems.length - 1
                        ? "border-b border-border/60"
                        : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => selectHandle(h.handle)}
                      className="min-w-0 truncate text-left text-[13px] text-text hover:text-accent"
                    >
                      {h.displayName}
                    </button>
                    <span className="shrink-0 text-[12px] text-muted tabular-nums">
                      {h.messageCount} msgs
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : !selected ? (
            <p className="text-[13px] text-muted">
              {mode === "trash"
                ? "Choose a trashed number or email to read messages, or use Undelete / Delete permanently from the menu."
                : "Choose an unassigned number or email to create a contact or add the handle to someone existing."}
            </p>
          ) : (
            <>
              <div className="rounded-xl border border-border bg-[#2c2c2e] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
                <h2 className="text-[13px] font-semibold text-text">
                  Contact details
                </h2>
                <div className="mt-3">
                  {creating && createDraft ? (
                    <div className="mb-3 flex gap-3">
                      <div className="pt-0.5">
                        <PersonDetailIcon className="size-4 shrink-0 text-muted" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] tracking-wide text-muted">
                          Name
                        </div>
                        <div className="mt-0.5 grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={createDraft.firstName}
                            onChange={(e) =>
                              setCreateDraft({
                                ...createDraft,
                                firstName: e.target.value,
                              })
                            }
                            placeholder="First"
                            className="rounded-md border border-border bg-transparent px-2 py-1 text-[13px] text-text outline-none placeholder:text-muted focus:border-accent/60"
                          />
                          <input
                            type="text"
                            value={createDraft.lastName}
                            onChange={(e) =>
                              setCreateDraft({
                                ...createDraft,
                                lastName: e.target.value,
                              })
                            }
                            placeholder="Last"
                            className="rounded-md border border-border bg-transparent px-2 py-1 text-[13px] text-text outline-none placeholder:text-muted focus:border-accent/60"
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex min-w-0 gap-3">
                      <div className="pt-0.5">
                        <PeopleGroupIcon className="size-4 shrink-0 text-muted" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] tracking-wide text-muted">
                          Groups
                        </div>
                        <div className="mt-0.5">
                          {(() => {
                            const shownTags = displayGroupNames(
                              creating ? (createDraft?.tags ?? []) : [],
                              creating
                                ? Boolean(createDraft?.exclude)
                                : false,
                            );
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
                                    className={
                                      tag === "Excluded"
                                        ? "truncate text-[13px] font-semibold text-amber-400/90"
                                        : "truncate text-[13px] text-text"
                                    }
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
                          {(creating && createDraft
                            ? createDraft.phones.filter((p) => p.trim()).length
                            : 1) === 1
                            ? "Phone"
                            : "Phones"}
                        </div>
                        <div className="mt-0.5">
                          {creating && createDraft ? (
                            <ContactPhoneList
                              phones={createDraft.phones}
                              onChange={(phones) =>
                                setCreateDraft({ ...createDraft, phones })
                              }
                            />
                          ) : (
                            <span className="truncate text-[13px] text-text">
                              {selected.handle}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {selected.dateStart && selected.dateEnd && (
                    <div className="mt-3 flex gap-3 border-t border-border/60 pt-2.5">
                      <div className="pt-0.5">
                        <RangeIcon className="size-4 shrink-0 text-muted" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] tracking-wide text-muted">
                          Message range
                        </div>
                        <div className="mt-0.5 text-[13px] text-text">
                          {selected.dateStart === selected.dateEnd
                            ? selected.dateStart
                            : `${selected.dateStart} — ${selected.dateEnd}`}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

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
                          opt.id === null
                            ? source === null
                            : source === opt.id;
                        const disabled = !opt.enabled;
                        return (
                          <span
                            key={opt.id ?? "all"}
                            className="flex items-start"
                          >
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
                              onClick={() => {
                                if (disabled) return;
                                setSource(opt.id);
                              }}
                              className={`flex min-w-0 flex-col items-start text-left ${
                                disabled ? "cursor-default" : ""
                              }`}
                            >
                              <span
                                className={`text-[13px] font-medium ${
                                  disabled
                                    ? "text-muted/40"
                                    : active
                                      ? "text-accent"
                                      : "text-text hover:text-accent"
                                }`}
                              >
                                {opt.label}
                              </span>
                              <span className="mt-0.5 w-[6ch] text-[11px] tabular-nums text-muted">
                                {opt.count.toLocaleString()}
                              </span>
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                <h3 className="text-[11px] font-semibold tracking-wider text-muted uppercase">
                  Yearly messages
                </h3>
                {loadingThreads ? (
                  <p className="mt-2 text-[12px] text-muted">Loading…</p>
                ) : yearly.length === 0 ? (
                  <p className="mt-2 text-[12px] text-muted">
                    No messages for this source
                  </p>
                ) : (
                  <div className="mt-2 flex flex-wrap items-center gap-y-1.5">
                    {yearly.map((y, i) => (
                      <span key={y.year} className="flex items-center">
                        {i > 0 && (
                          <span
                            className="mx-2 text-[13px] text-muted/50"
                            aria-hidden
                          >
                            |
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => loadYear(y.year, y.conversationIds)}
                          className={`text-[13px] font-medium ${
                            activeYear === y.year
                              ? "text-accent"
                              : "text-text hover:text-accent"
                          }`}
                        >
                          {y.year}
                          <span className="ml-2 text-muted">
                            {y.messageCount}
                          </span>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
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
          {multiSelected ? (
            <p className="pt-8 text-center text-[13px] text-muted">
              Select a single handle to read messages.
            </p>
          ) : (
            <>
              {!activeYear && (
                <p className="pt-8 text-center text-[13px] text-muted">
                  Select a year to read messages.
                </p>
              )}
              {loadingMessages && activeYear && (
                <p className="pt-8 text-center text-[13px] text-muted">Loading…</p>
              )}
              {!loadingMessages && messages.length > 0 && (
                <div className="mx-auto flex max-w-2xl flex-col gap-2">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex flex-col ${
                        m.isFromMe ? "items-end" : "items-start"
                      }`}
                    >
                      {!m.isFromMe && (
                        <span className="mb-0.5 px-1 text-[10px] text-muted">
                          {m.senderName}
                        </span>
                      )}
                      <div
                        className={`max-w-[75%] rounded-2xl px-3 py-2 text-[14px] leading-snug ${
                          m.isFromMe
                            ? "rounded-br-md bg-sent text-sent-text"
                            : "rounded-bl-md bg-received text-received-text"
                        }`}
                      >
                        {m.body && (
                          <p className="whitespace-pre-wrap break-words">
                            {m.body}
                          </p>
                        )}
                        <MessageAttachments
                          source={m.source}
                          attachments={m.attachments}
                          hasBody={Boolean(m.body)}
                        />
                      </div>
                      <span className="mt-0.5 px-1 text-[10px] text-muted">
                        {m.timestamp.replace("T", " ").slice(0, 19)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
        </div>
      </div>

      {ctxMenu && (
        <div
          ref={ctxMenuRef}
          className="fixed z-50 min-w-[180px] rounded-lg border border-border bg-[#2c2c2e] py-1 shadow-xl"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          {mode === "trash" ? (
            <>
              <button
                type="button"
                disabled={saving}
                className="block w-full px-3 py-1.5 text-left text-[13px] text-text hover:bg-white/20 disabled:opacity-50"
                onClick={() => void restoreFromTrash(ctxMenu.handle)}
              >
                Undelete
              </button>
              <button
                type="button"
                disabled={saving}
                className="block w-full px-3 py-1.5 text-left text-[13px] text-text hover:bg-red-500/15 hover:text-red-300 disabled:opacity-50"
                onClick={() => void permanentlyDeleteFromTrash(ctxMenu.handle)}
              >
                Delete permanently
              </button>
            </>
          ) : multiSelected ? (
            <>
              <button
                type="button"
                disabled={saving}
                className="block w-full px-3 py-1.5 text-left text-[13px] text-text hover:bg-white/20 disabled:opacity-50"
                onClick={() => {
                  const pos = clampMenu(ctxMenu.x, ctxMenu.y, 288, 280);
                  setCtxMenu(null);
                  setAssignQuery("");
                  setAssignMode(pos);
                }}
              >
                Add to existing contact
              </button>
              <div className="my-1 border-t border-border/60" />
              <button
                type="button"
                disabled={saving}
                className="block w-full px-3 py-1.5 text-left text-[13px] text-text hover:bg-red-500/15 hover:text-red-300 disabled:opacity-50"
                onClick={() => void moveToTrash()}
              >
                Delete
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={saving}
                className="block w-full px-3 py-1.5 text-left text-[13px] text-text hover:bg-white/20 disabled:opacity-50"
                onClick={() => {
                  const pos = clampMenu(ctxMenu.x, ctxMenu.y, 288, 280);
                  setCtxMenu(null);
                  setAssignQuery("");
                  setAssignMode(pos);
                }}
              >
                Add to existing contact
              </button>
              <div className="my-1 border-t border-border/60" />
              <button
                type="button"
                disabled={saving}
                className="block w-full px-3 py-1.5 text-left text-[13px] text-text hover:bg-red-500/15 hover:text-red-300 disabled:opacity-50"
                onClick={() => void moveToTrash()}
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}

      {assignMode && typeof assignMode === "object" && (
        <div
          ref={assignRef}
          className="fixed z-50"
          style={{ left: assignMode.x, top: assignMode.y }}
        >
          {assignSearch}
        </div>
      )}
    </div>
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
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
    </svg>
  );
}

function PhoneIcon({ className }: { className?: string }) {
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
      <path d="M8.5 3.5h3.2l1.1 3.3-2 1.2a12.5 12.5 0 0 0 5.2 5.2l1.2-2 3.3 1.1v3.2a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 3.5 8.7a2 2 0 0 1 2-2.2Z" />
    </svg>
  );
}

function EllipsisIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
    >
      <circle cx="3.5" cy="8" r="1.25" />
      <circle cx="8" cy="8" r="1.25" />
      <circle cx="12.5" cy="8" r="1.25" />
    </svg>
  );
}
