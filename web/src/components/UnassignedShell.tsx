"use client";

import type {
  ContactListItem,
  MessageRow,
  UnassignedHandle,
  YearThread,
} from "@/lib/types";
import { searchContacts } from "@/lib/contactSearch";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  draftHasName,
  emptyContactEditDraft,
  phonesForSave,
  type ContactEditDraft,
} from "./contactEdit";
import { GroupsMenu, type GroupCheckState } from "./GroupsMenu";
import { EllipsisIcon } from "./icons";
import {
  type SortOrder,
  type UnassignedSortBy,
} from "./SortByMenu";
import { UnassignedContactList } from "./UnassignedContactList";
import { UnassignedDetailPane } from "./UnassignedDetailPane";
import { UnassignedMessagesPane } from "./UnassignedMessagesPane";
import { useSourceFilter } from "./SourceFilter";
import { useDismissible } from "./useDismissible";
import { useListSelection } from "./useListSelection";
import { usePersistedEnum } from "./usePersistedEnum";
import { useResizablePanes } from "./useResizablePanes";

const UNASSIGNED_SORT_ORDER_KEY = "mv-unassigned-sort-order";
const UNASSIGNED_SORT_BY_KEY = "mv-unassigned-sort-by";
const UNASSIGNED_SORT_BY_ALLOWED = ["phone", "date", "messages"] as const;
const UNASSIGNED_SORT_ORDER_ALLOWED = ["asc", "desc"] as const;
const LEGACY_SORT_ORDER_KEY = "mv-unmatched-sort-order";
const LEGACY_SORT_BY_KEY = "mv-unmatched-sort-by";

export function UnassignedShell({
  handles: initialHandles,
  assignContacts,
  initialHandle,
  tags: allTags = [],
  mode = "unassigned",
}: {
  handles: UnassignedHandle[];
  assignContacts: ContactListItem[];
  initialHandle: string | null;
  tags?: string[];
  mode?: "unassigned" | "trash";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { sources, source, setSource, sourceQuery } = useSourceFilter();
  const [handles, setHandles] = useState(initialHandles);
  const [sortBy, setSortBy] = usePersistedEnum(
    UNASSIGNED_SORT_BY_KEY,
    UNASSIGNED_SORT_BY_ALLOWED,
    "phone",
    [LEGACY_SORT_BY_KEY],
  );
  const [sortOrder, setSortOrder] = usePersistedEnum(
    UNASSIGNED_SORT_ORDER_KEY,
    UNASSIGNED_SORT_ORDER_ALLOWED,
    "asc",
    [LEGACY_SORT_ORDER_KEY],
  );
  const setUnassignedSort = useCallback(
    (next: { sortBy: UnassignedSortBy; order: SortOrder }) => {
      setSortBy(next.sortBy);
      setSortOrder(next.order);
    },
    [setSortBy, setSortOrder],
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
  const [status, setStatus] = useState<string | null>(null);
  const assignRef = useRef<HTMLDivElement>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);
  const { sidebarWidth, threadsPct, startSide, startThreads, shellRef, splitId } =
    useResizablePanes("browse", { splitId: "unassigned-split" });

  const selected = handles.find((h) => h.handle === handle) ?? null;

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

  const orderedIds = useMemo(
    () => sortedHandles.map((h) => h.handle),
    [sortedHandles],
  );
  const validIds = useMemo(() => handles.map((h) => h.handle), [handles]);

  const selectHandleRef = useRef<(next: string) => void>(() => {});
  const dismissSelectionUi = useCallback(() => {
    setCreating(false);
    setCreateDraft(null);
    setAssignMode(null);
    setCtxMenu(null);
  }, []);

  const {
    selectedIds: selectedHandles,
    setSelectedIds: setSelectedHandles,
    selectionAnchorRef,
    multiSelected,
    allSelected: allHandlesSelected,
    selectAllRef,
    clearSelection,
    toggleSelectAll,
    onSelectColumnClick,
    onRowClick,
  } = useListSelection<string>({
    orderedIds,
    validIds,
    rangeMode: "anchor",
    multiThreshold: "any",
    focusedId: handle,
    rowClickMode: "alwaysOpen",
    checkboxEvents: "preventAndStop",
    escapeToClear: true,
    escapeBlocked: () => ctxMenu != null || assignMode != null,
    selectAllSetsAnchor: true,
    onOpen: (id) => selectHandleRef.current(id),
    onSelectionMutation: dismissSelectionUi,
  });

  const selectedItems = useMemo(
    () => sortedHandles.filter((h) => selectedHandles.has(h.handle)),
    [sortedHandles, selectedHandles],
  );

  const actionTargets = useMemo(() => {
    if (multiSelected) return selectedItems.map((h) => h.handle);
    if (handle) return [handle];
    return [] as string[];
  }, [multiSelected, selectedItems, handle]);

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
    [pathname, router, searchParams, setSelectedHandles, selectionAnchorRef],
  );
  selectHandleRef.current = selectHandle;

  // Default to create/edit when a single unassigned handle is focused.
  const createHandleRef = useRef<string | null>(null);
  useEffect(() => {
    if (mode !== "unassigned") {
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
    fetch(`/api/unassigned/threads?${qs.toString()}`)
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

  useDismissible({
    open: assignMode != null,
    onDismiss: () => setAssignMode(null),
    refs: [assignRef],
  });

  useDismissible({
    open: ctxMenu != null,
    onDismiss: () => setCtxMenu(null),
    refs: [ctxMenuRef],
  });

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
    if (mode !== "unassigned") return;
    const targets = actionTargets;
    if (targets.length === 0) return;
    setSaving(true);
    setCtxMenu(null);
    try {
      for (const phone of targets) {
        const res = await fetch("/api/unassigned/trash", {
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
        const res = await fetch("/api/unassigned/trash", {
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
        const res = await fetch("/api/unassigned/trash", {
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

  const activeYearMeta = useMemo(() => {
    if (activeYear == null) return null;
    const y = yearly.find((t) => t.year === activeYear);
    if (!y) return null;
    return {
      messageCount: y.messageCount,
      dateStart: y.dateStart,
      dateEnd: y.dateEnd,
    };
  }, [activeYear, yearly]);

  return (
    <div ref={shellRef} className="flex h-full min-h-0">
      <UnassignedContactList
        sidebarWidth={sidebarWidth}
        mode={mode}
        selectAllRef={selectAllRef}
        allHandlesSelected={allHandlesSelected}
        handleCount={handles.length}
        sortedHandles={sortedHandles}
        handle={handle}
        selectedHandles={selectedHandles}
        multiSelected={multiSelected}
        saving={saving}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={setUnassignedSort}
        onToggleSelectAll={toggleSelectAll}
        onSelectColumnClick={onSelectColumnClick}
        onRowClick={onRowClick}
        onOpenCtxMenu={openCtxMenuAt}
        onOpenTrashMenu={openTrashMenu}
      />

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
              ? `${selectedHandles.size} contact${
                  selectedHandles.size === 1 ? "" : "s"
                } selected`
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
              {mode === "unassigned" && (
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
              {mode === "unassigned" ? (
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
          {creating && createDraft && !multiSelected && mode === "unassigned" && (
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

        <div id={splitId} className="flex min-h-0 flex-1 flex-col">
        <UnassignedDetailPane
          threadsPct={threadsPct}
          mode={mode}
          multiSelected={multiSelected}
          selected={selected}
          selectedItems={selectedItems}
          creating={creating}
          createDraft={createDraft}
          onDraftChange={setCreateDraft}
          sources={sources}
          messageSources={messageSources}
          sourceCounts={sourceCounts}
          source={source}
          onSourceChange={setSource}
          yearly={yearly}
          activeYear={activeYear}
          loadingThreads={loadingThreads}
          onLoadYear={(y) => loadYear(y.year, y.conversationIds)}
          onClearSelection={clearSelection}
          onSelectHandle={selectHandle}
        />

        <div
          role="separator"
          aria-orientation="horizontal"
          onMouseDown={startThreads}
          className="h-1 shrink-0 cursor-row-resize bg-border hover:bg-accent/60"
        />

        <UnassignedMessagesPane
          multiSelected={multiSelected}
          activeYear={activeYear}
          loadingMessages={loadingMessages}
          messages={messages}
          activeYearMeta={activeYearMeta}
        />

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
