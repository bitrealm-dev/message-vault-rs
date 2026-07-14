"use client";

import type {
  ContactListItem,
  MessageRow,
  UnassignedHandle,
  YearThread,
} from "@/lib/types";
import { searchContacts } from "@/lib/contactSearch";
import { isEmailHandle, phoneHandlesOnly } from "@/lib/handleKind";
import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  draftHasName,
  emptyContactEditDraft,
  phonesForSave,
  type ContactEditDraft,
} from "./contactEdit";
import { GroupsMenu, type GroupCheckState } from "./GroupsMenu";
import { ChevronDownIcon, ChevronRightIcon, PeopleGroupIcon, PencilIcon, XIcon } from "./icons";
import {
  type SortOrder,
  type TrashSortBy,
  type UnassignedSortBy,
} from "./SortByMenu";
import { UnassignedContactList } from "./UnassignedContactList";
import { TrashContactList } from "./TrashContactList";
import { UnassignedDetailPane } from "./UnassignedDetailPane";
import { UnassignedMessagesPane } from "./UnassignedMessagesPane";
import { useHistory } from "./history";
import { useSourceFilter } from "./SourceFilter";
import { useDismissible } from "./useDismissible";
import { useListSelection } from "./useListSelection";
import { usePersistedEnum } from "./usePersistedEnum";
import { PaneSeparator } from "./PaneSeparator";
import { usePanelLayoutStorage } from "./panelLayoutStorage";
import { fetchThreadMessages } from "./useThreadMessages";
import { useTrashActions } from "./useTrashActions";
import { Group, Panel, useDefaultLayout } from "react-resizable-panels";

const UNASSIGNED_SORT_ORDER_KEY = "mv-unassigned-sort-order";
const UNASSIGNED_SORT_BY_KEY = "mv-unassigned-sort-by";
const UNASSIGNED_SORT_BY_ALLOWED = ["phone", "date", "messages"] as const;
const UNASSIGNED_SORT_ORDER_ALLOWED = ["asc", "desc"] as const;
const TRASH_SORT_BY_KEY = "mv-trash-sort-by";
const TRASH_SORT_ORDER_KEY = "mv-trash-sort-order";
const TRASH_SORT_BY_ALLOWED = ["phone", "first", "last", "count"] as const;
const ASSIGN_PAGE_SIZE = 40;

function trashLetterFor(
  h: UnassignedHandle,
  sortBy: TrashSortBy,
): string {
  if (sortBy === "count") return "";
  const src =
    sortBy === "first"
      ? (h.sortFirst ?? h.handle)
      : sortBy === "last"
        ? (h.sortLast ?? h.handle)
        : h.handle;
  const ch = src.charAt(0).toUpperCase();
  return ch >= "A" && ch <= "Z" ? ch : "#";
}

export function UnassignedShell({
  handles: initialHandles,
  assignContacts,
  initialHandle,
  groups: allGroups = [],
  mode = "unassigned",
  trashTabBar = null,
}: {
  handles: UnassignedHandle[];
  assignContacts: ContactListItem[];
  initialHandle: string | null;
  groups?: string[];
  mode?: "unassigned" | "trash";
  /** Contacts / Group chats tabs — sits in the list header (left of the pane split). */
  trashTabBar?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { push: pushHistory, clear: clearHistory } = useHistory();
  const { sources, source, setSource, sourceQuery } = useSourceFilter();
  const [handles, setHandles] = useState(initialHandles);
  const [sortBy, setSortBy] = usePersistedEnum(
    UNASSIGNED_SORT_BY_KEY,
    UNASSIGNED_SORT_BY_ALLOWED,
    "phone",
  );
  const [sortOrder, setSortOrder] = usePersistedEnum(
    UNASSIGNED_SORT_ORDER_KEY,
    UNASSIGNED_SORT_ORDER_ALLOWED,
    "asc",
  );
  const [trashSortBy, setTrashSortBy] = usePersistedEnum(
    TRASH_SORT_BY_KEY,
    TRASH_SORT_BY_ALLOWED,
    "phone",
  );
  const [trashSortOrder, setTrashSortOrder] = usePersistedEnum(
    TRASH_SORT_ORDER_KEY,
    UNASSIGNED_SORT_ORDER_ALLOWED,
    "asc",
  );
  const setUnassignedSort = useCallback(
    (next: { sortBy: UnassignedSortBy; order: SortOrder }) => {
      setSortBy(next.sortBy);
      setSortOrder(next.order);
    },
    [setSortBy, setSortOrder],
  );
  const setTrashSort = useCallback(
    (next: { sortBy: TrashSortBy; order: SortOrder }) => {
      setTrashSortBy(next.sortBy);
      setTrashSortOrder(next.order);
    },
    [setTrashSortBy, setTrashSortOrder],
  );
  const [trashQuery, setTrashQuery] = useState("");
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
  const [assignSaving, setSaving] = useState(false);
  const [assignMode, setAssignMode] = useState<
    null | "header" | { x: number; y: number }
  >(null);
  const [assignQuery, setAssignQuery] = useState("");
  const [assignVisibleCount, setAssignVisibleCount] = useState(ASSIGN_PAGE_SIZE);
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    handle?: string;
  } | null>(null);
  const [groupsPanelPos, setGroupsPanelPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const assignRef = useRef<HTMLDivElement>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);
  const groupsPanelWrapRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const groupsCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const groupsCreatePinnedRef = useRef(false);
  const storage = usePanelLayoutStorage();
  const sideLayout = useDefaultLayout({
    id: "mv-browse-side",
    panelIds: ["list", "right"],
    storage,
  });
  const threadsLayout = useDefaultLayout({
    id: "mv-unassigned-threads",
    panelIds: ["detail", "messages"],
    storage,
  });

  const selected = handles.find((h) => h.handle === handle) ?? null;
  const selectedTrashKind = selected?.trashKind;
  const selectedContactId = selected?.contactId;

  const sortedHandles = useMemo(() => {
    const copy = [...handles];
    const order = mode === "trash" ? trashSortOrder : sortOrder;
    copy.sort((a, b) => {
      let cmp = 0;
      if (mode === "trash") {
        if (trashSortBy === "count") {
          cmp = a.messageCount - b.messageCount;
          if (cmp === 0) {
            cmp = a.handle.localeCompare(b.handle, undefined, {
              sensitivity: "base",
            });
          }
        } else if (trashSortBy === "first") {
          const aFirst = a.sortFirst ?? a.handle;
          const bFirst = b.sortFirst ?? b.handle;
          cmp = aFirst.localeCompare(bFirst, undefined, { sensitivity: "base" });
          if (cmp === 0) {
            const aLast = a.sortLast ?? a.handle;
            const bLast = b.sortLast ?? b.handle;
            cmp = aLast.localeCompare(bLast, undefined, { sensitivity: "base" });
          }
          if (cmp === 0) {
            cmp = a.handle.localeCompare(b.handle, undefined, {
              sensitivity: "base",
            });
          }
        } else if (trashSortBy === "last") {
          const aLast = a.sortLast ?? a.handle;
          const bLast = b.sortLast ?? b.handle;
          cmp = aLast.localeCompare(bLast, undefined, { sensitivity: "base" });
          if (cmp === 0) {
            const aFirst = a.sortFirst ?? a.handle;
            const bFirst = b.sortFirst ?? b.handle;
            cmp = aFirst.localeCompare(bFirst, undefined, {
              sensitivity: "base",
            });
          }
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
      } else if (sortBy === "messages") {
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
      return order === "desc" ? -cmp : cmp;
    });
    return copy;
  }, [handles, mode, sortBy, sortOrder, trashSortBy, trashSortOrder]);

  const trashFilteredHandles = useMemo(() => {
    if (mode !== "trash") return sortedHandles;
    const q = trashQuery.trim().toLowerCase();
    if (!q) return sortedHandles;
    return sortedHandles.filter((h) => {
      const hay = [
        h.displayName,
        h.handle,
        h.firstName,
        h.lastName,
        h.nameHint,
      ]
        .filter(Boolean)
        .join("\0")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [mode, sortedHandles, trashQuery]);

  const trashGrouped = useMemo((): [string, UnassignedHandle[]][] => {
    if (mode !== "trash") return [];
    if (trashSortBy === "count" || trashQuery.trim()) {
      return [["", trashFilteredHandles]];
    }
    const map = new Map<string, UnassignedHandle[]>();
    for (const h of trashFilteredHandles) {
      const letter = trashLetterFor(h, trashSortBy);
      if (!map.has(letter)) map.set(letter, []);
      map.get(letter)!.push(h);
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (a === "#") return 1;
      if (b === "#") return -1;
      return a.localeCompare(b);
    });
  }, [mode, trashFilteredHandles, trashSortBy, trashQuery]);

  const orderedIds = useMemo(
    () =>
      (mode === "trash" ? trashFilteredHandles : sortedHandles).map(
        (h) => h.handle,
      ),
    [mode, trashFilteredHandles, sortedHandles],
  );
  const validIds = useMemo(() => handles.map((h) => h.handle), [handles]);

  const selectHandleRef = useRef<(next: string) => void>(() => {});
  const dismissSelectionUi = useCallback(() => {
    setCreating(false);
    setCreateDraft(null);
    setAssignMode(null);
    setCtxMenu(null);
    setGroupsPanelPos(null);
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
    escapeBlocked: () =>
      ctxMenu != null || assignMode != null || groupsPanelPos != null,
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
      setCreating(false);
      setCreateDraft(null);
      setExtraGroups([]);
      setMoreMenuOpen(false);
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

  const seedDraftForHandle = useCallback(
    (target: string) => {
      const row = handles.find((h) => h.handle === target);
      setExtraGroups([]);
      // Email handles stay DB-only: draft phones start empty; email is attached on save.
      setCreateDraft({
        ...emptyContactEditDraft(),
        firstName: row?.nameHint?.trim() ?? "",
        phones: isEmailHandle(target) ? ["", ""] : [target, ""],
      });
    },
    [handles],
  );

  // Keep a view-mode draft for Groups; do not enter edit on select.
  useEffect(() => {
    if (mode !== "unassigned") {
      setCreating(false);
      setCreateDraft(null);
      return;
    }
    if (multiSelected || !handle) {
      setCreating(false);
      setCreateDraft(null);
      return;
    }
    setCreating(false);
    const row = handles.find((h) => h.handle === handle);
    setExtraGroups([]);
    setCreateDraft({
      ...emptyContactEditDraft(),
      firstName: row?.nameHint?.trim() ?? "",
      phones: isEmailHandle(handle) ? ["", ""] : [handle, ""],
    });
    // Only re-seed when the focused handle (or selection mode) changes — not on
    // list refresh, which would cancel an in-progress edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handles read intentionally on handle change
  }, [handle, mode, multiSelected]);

  const beginCreate = useCallback(() => {
    if (mode !== "unassigned" || !handle || multiSelected) return;
    setMoreMenuOpen(false);
    if (!createDraft) seedDraftForHandle(handle);
    setCreating(true);
  }, [mode, handle, multiSelected, createDraft, seedDraftForHandle]);

  const cancelCreate = useCallback(() => {
    setCreating(false);
    setMoreMenuOpen(false);
    if (handle && mode === "unassigned" && !multiSelected) {
      seedDraftForHandle(handle);
    } else {
      setCreateDraft(null);
      setExtraGroups([]);
    }
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, [handle, mode, multiSelected, seedDraftForHandle]);

  useEffect(() => {
    if (!creating || multiSelected || mode !== "unassigned") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (
        ctxMenu != null ||
        assignMode != null ||
        groupsPanelPos != null ||
        moreMenuOpen
      ) {
        return;
      }
      e.preventDefault();
      cancelCreate();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [
    creating,
    multiSelected,
    mode,
    ctxMenu,
    assignMode,
    groupsPanelPos,
    moreMenuOpen,
    cancelCreate,
  ]);

  const menuGroups = useMemo(() => {
    const names = new Set([...allGroups, ...extraGroups]);
    for (const g of createDraft?.contactGroups ?? []) names.add(g);
    return [...names].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [allGroups, extraGroups, createDraft?.contactGroups]);

  const draftGroupChecks = useMemo(() => {
    const result: Record<string, GroupCheckState> = {};
    const groups = createDraft?.contactGroups ?? [];
    for (const name of menuGroups) {
      result[name] = groups.includes(name) ? "on" : "off";
    }
    return result;
  }, [menuGroups, createDraft?.contactGroups]);

  const draftExcludedCheck = useMemo((): GroupCheckState => {
    return createDraft?.exclude ? "on" : "off";
  }, [createDraft?.exclude]);

  const toggleDraftGroup = useCallback((name: string) => {
    setCreateDraft((prev) => {
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
    setExtraGroups((prev) =>
      prev.includes(name) ? prev : [...prev, name],
    );
    setCreateDraft((prev) => {
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
    const qs = new URLSearchParams();
    if (source) qs.set("source", source);
    if (mode === "trash") qs.set("trashed", "1");
    const url =
      mode === "trash" &&
      selectedTrashKind === "contact" &&
      selectedContactId != null
        ? `/api/contacts/${selectedContactId}/threads?${qs.toString()}`
        : (() => {
            qs.set("handle", handle);
            return `/api/unassigned/threads?${qs.toString()}`;
          })();
    fetch(url)
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
  }, [
    handle,
    mode,
    selectedTrashKind,
    selectedContactId,
    source,
    sourceQuery,
    setSource,
    multiSelected,
  ]);

  const loadYear = (year: number, conversationIds: number[]) => {
    setActiveYear(year);
    setLoadingMessages(true);
    fetchThreadMessages(conversationIds, year, sourceQuery)
      .then(setMessages)
      .finally(() => setLoadingMessages(false));
  };

  const clearFocusAfterRemoval = useCallback(
    (phones: string[]) => {
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
    },
    [clearSelection, handle, pathname, router, searchParams],
  );

  const getTrashTargets = useCallback(
    (forHandle?: string) => {
      if (forHandle && !multiSelected) return [forHandle];
      return actionTargets;
    },
    [actionTargets, multiSelected],
  );

  const runMixedTrashRestoreOrDelete = useCallback(
    async (targets: string[], permanent: boolean) => {
      if (targets.length === 0) return;
      if (permanent) {
        const msg =
          targets.length === 1
            ? "Delete forever? This cannot be undone."
            : `Delete ${targets.length} items forever? This cannot be undone.`;
        if (!window.confirm(msg)) return;
      }
      setSaving(true);
      setCtxMenu(null);
      setGroupsPanelPos(null);
      try {
        for (const target of targets) {
          const row = handles.find((h) => h.handle === target);
          const kind = row?.trashKind ?? "unassigned";
          let res: Response;
          if (kind === "contact" && row?.contactId != null) {
            res = await fetch("/api/contacts/trash", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ids: [row.contactId],
                permanent: permanent || undefined,
              }),
            });
          } else if (kind === "messages_only") {
            res = await fetch("/api/contacts/trash", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                handle: target,
                permanent: permanent || undefined,
              }),
            });
          } else {
            res = await fetch("/api/unassigned/trash", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                handle: target,
                permanent: permanent || undefined,
              }),
            });
          }
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "action failed");
        }
        setStatus(
          permanent
            ? targets.length === 1
              ? "Deleted forever"
              : `Deleted ${targets.length} forever`
            : targets.length === 1
              ? "Undeleted"
              : `Undeleted ${targets.length}`,
        );
        if (permanent) clearHistory();
        clearFocusAfterRemoval(targets);
        router.refresh();
      } catch (err) {
        console.error(err);
        setStatus(err instanceof Error ? err.message : "action failed");
        router.refresh();
      } finally {
        setSaving(false);
      }
    },
    [
      handles,
      clearFocusAfterRemoval,
      clearHistory,
      router,
    ],
  );

  const {
    saving: trashSaving,
    moveToTrash,
  } = useTrashActions<string>({
    endpoint: "/api/unassigned/trash",
    idField: "handle",
    getTargets: getTrashTargets,
    canTrash: mode === "unassigned",
    canRestoreOrDelete: false,
    confirmTrash: (targets) =>
      targets.length === 1
        ? "Move this number or email to Trash?"
        : `Move ${targets.length} numbers/emails to Trash?`,
    confirmPermanent: (targets) =>
      targets.length === 1
        ? "Delete this number or email forever? This cannot be undone."
        : `Delete ${targets.length} numbers/emails forever? This cannot be undone.`,
    status: {
      trashedOne: "Moved to Trash",
      trashedMany: (n) => `Moved ${n} to Trash`,
      restoredOne: "Undeleted — back in Unassigned",
      restoredMany: (n) => `Undeleted ${n} handles`,
      deletedOne: "Deleted forever",
      deletedMany: (n) => `Deleted ${n} handles forever`,
    },
    setStatus,
    onRemoved: clearFocusAfterRemoval,
    onDismissMenus: () => {
      setCtxMenu(null);
      setGroupsPanelPos(null);
    },
    onTrashed: (trashedHandles) => {
      pushHistory({
        type: "trashUnassignedHandles",
        handles: trashedHandles,
        label:
          trashedHandles.length === 1
            ? `Delete ${trashedHandles[0]}`
            : `Delete ${trashedHandles.length} unassigned handles`,
      });
    },
    afterPermanent: () => {
      clearHistory();
      router.refresh();
    },
  });

  const restoreFromTrash = useCallback(
    async (override?: string) => {
      if (mode !== "trash") return;
      await runMixedTrashRestoreOrDelete(getTrashTargets(override), false);
    },
    [mode, getTrashTargets, runMixedTrashRestoreOrDelete],
  );

  const permanentlyDeleteFromTrash = useCallback(
    async (override?: string) => {
      if (mode !== "trash") return;
      await runMixedTrashRestoreOrDelete(getTrashTargets(override), true);
    },
    [mode, getTrashTargets, runMixedTrashRestoreOrDelete],
  );

  const canSaveCreate =
    !!createDraft &&
    draftHasName(createDraft) &&
    (isEmailHandle(handle ?? "")
      ? phoneHandlesOnly(phonesForSave(createDraft.phones)).length > 0
      : phonesForSave(createDraft.phones).length > 0 || !!handle);

  const saving = assignSaving || trashSaving;

  const saveCreate = async () => {
    if (!createDraft || !handle || !draftHasName(createDraft)) return;
    const fromDraft = phonesForSave(createDraft.phones);
    const csvPhones = phoneHandlesOnly(fromDraft);
    if (csvPhones.length === 0) {
      setStatus(
        isEmailHandle(handle)
          ? "Add a phone number — emails alone cannot create a contact"
          : "At least one phone number is required",
      );
      return;
    }
    setSaving(true);
    try {
      // Keep the unassigned handle on the contact (phone or email); emails stay DB-only.
      const phones = fromDraft.includes(handle)
        ? fromDraft
        : isEmailHandle(handle)
          ? [...fromDraft, handle]
          : [handle, ...fromDraft];
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: createDraft.firstName.trim() || null,
          lastName: createDraft.lastName.trim() || null,
          phones,
          exclude: createDraft.exclude,
          contactGroups: createDraft.contactGroups,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "create failed");
      if (data.contact?.id != null) {
        pushHistory({
          type: "createContact",
          contactId: data.contact.id,
          label: `Create contact ${data.contact.displayName ?? handle}`,
        });
      }
      router.push(`/contacts?c=${data.contact.id}`);
      router.refresh();
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  };

  const assignMatches = useMemo(() => {
    const q = assignQuery.trim();
    const byFirst = (a: ContactListItem, b: ContactListItem) =>
      a.sortFirst.localeCompare(b.sortFirst, undefined, {
        sensitivity: "base",
      }) ||
      a.sortLast.localeCompare(b.sortLast, undefined, { sensitivity: "base" });
    if (!q) {
      return [...assignContacts].sort(byFirst);
    }
    return searchContacts(assignContacts, q);
  }, [assignContacts, assignQuery]);

  const assignFiltered = useMemo(
    () => assignMatches.slice(0, assignVisibleCount),
    [assignMatches, assignVisibleCount],
  );

  useEffect(() => {
    setAssignVisibleCount(ASSIGN_PAGE_SIZE);
  }, [assignQuery, assignMode]);

  const onAssignListScroll = useCallback(
    (e: UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      if (el.scrollTop + el.clientHeight < el.scrollHeight - 48) return;
      setAssignVisibleCount((n) =>
        n >= assignMatches.length
          ? n
          : Math.min(n + ASSIGN_PAGE_SIZE, assignMatches.length),
      );
    },
    [assignMatches.length],
  );

  useDismissible({
    open: assignMode != null,
    onDismiss: () => setAssignMode(null),
    refs: [assignRef],
  });

  useDismissible({
    open: moreMenuOpen,
    onDismiss: () => setMoreMenuOpen(false),
    refs: [moreMenuRef],
  });

  const closeGroupsPanel = useCallback(() => {
    if (groupsCloseTimerRef.current) {
      clearTimeout(groupsCloseTimerRef.current);
      groupsCloseTimerRef.current = null;
    }
    groupsCreatePinnedRef.current = false;
    setGroupsPanelPos(null);
  }, []);

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
    }, 160);
  }, [cancelCloseGroupsPanel]);

  const openCtxGroups = useCallback(
    (anchor: DOMRect) => {
      if (!createDraft || multiSelected || mode !== "unassigned") {
        return;
      }
      cancelCloseGroupsPanel();
      const x = Math.max(
        8,
        Math.min(anchor.right + 2, window.innerWidth - 272),
      );
      const y = Math.max(
        8,
        Math.min(anchor.top, window.innerHeight - 320),
      );
      setGroupsPanelPos({ x, y });
    },
    [createDraft, multiSelected, mode, cancelCloseGroupsPanel],
  );

  useDismissible({
    open: ctxMenu != null,
    onDismiss: () => {
      setCtxMenu(null);
      closeGroupsPanel();
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

  const assignToContact = async (contactId: number) => {
    const targets = actionTargets;
    if (targets.length === 0) return;
    setSaving(true);
    setCtxMenu(null);
    closeGroupsPanel();
    try {
      let displayName = "";
      for (const phone of targets) {
        const res = await fetch(`/api/contacts/${contactId}/handles`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle: phone }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "assign failed");
        displayName = data.contact.displayName;
      }
      pushHistory({
        type: "assignHandles",
        contactId,
        handles: targets,
        label:
          targets.length === 1
            ? `Add ${targets[0]} to ${displayName}`
            : `Add ${targets.length} handles to ${displayName}`,
      });
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

  const openCtxMenuAt = (
    x: number,
    y: number,
    nextHandle: string,
    menuH: number,
  ) => {
    closeGroupsPanel();
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

  const assignSearch = (
    <div className="w-72 rounded-lg border border-border bg-elevated shadow-xl">
      <input
        autoFocus
        value={assignQuery}
        onChange={(e) => setAssignQuery(e.target.value)}
        placeholder="Search contacts…"
        className="w-full border-b border-border bg-transparent px-3 py-2 text-[13px] text-text outline-none placeholder:text-muted"
      />
      <div
        className="max-h-64 overflow-y-auto py-1"
        onScroll={onAssignListScroll}
      >
        {assignFiltered.length === 0 ? (
          <p className="px-3 py-2 text-[12px] text-muted">No matches</p>
        ) : (
          <>
            {assignFiltered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => void assignToContact(c.id)}
                className="flex w-full flex-col px-3 py-1.5 text-left hover:bg-white/15"
              >
                <span className="truncate text-[13px] text-text">
                  {c.displayName}
                </span>
                {c.preferredHandle && (
                  <span className="truncate text-[11px] text-muted">
                    {c.preferredHandle}
                  </span>
                )}
              </button>
            ))}
            {assignFiltered.length < assignMatches.length && (
              <p className="px-3 py-1.5 text-center text-[11px] text-muted">
                Scroll for more…
              </p>
            )}
          </>
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
      attachmentCount: y.attachmentCount,
    };
  }, [activeYear, yearly]);

  return (
    <>
    <Group
      id="mv-browse-side"
      orientation="horizontal"
      className="h-full w-full"
      defaultLayout={sideLayout.defaultLayout}
      onLayoutChanged={sideLayout.onLayoutChanged}
    >
      <Panel
        id="list"
        defaultSize={272}
        minSize={100}
        maxSize={720}
        className="min-h-0"
      >
        {mode === "trash" ? (
          <TrashContactList
            tabBar={trashTabBar}
            selectAllRef={selectAllRef}
            allSelected={allHandlesSelected}
            query={trashQuery}
            onQueryChange={setTrashQuery}
            grouped={trashGrouped}
            sortedCount={trashFilteredHandles.length}
            handle={handle}
            selectedHandles={selectedHandles}
            saving={saving}
            canDeleteForever={actionTargets.length > 0}
            sortBy={trashSortBy}
            sortOrder={trashSortOrder}
            onSortChange={setTrashSort}
            onToggleSelectAll={toggleSelectAll}
            onSelectColumnClick={onSelectColumnClick}
            onRowClick={onRowClick}
            onRestore={(h) => void restoreFromTrash(h)}
            onDeleteForever={(h) => void permanentlyDeleteFromTrash(h)}
            onDeleteForeverHeader={() => void permanentlyDeleteFromTrash()}
          />
        ) : (
          <UnassignedContactList
            selectAllRef={selectAllRef}
            allHandlesSelected={allHandlesSelected}
            handleCount={handles.length}
            sortedHandles={sortedHandles}
            handle={handle}
            selectedHandles={selectedHandles}
            multiSelected={multiSelected}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={setUnassignedSort}
            onToggleSelectAll={toggleSelectAll}
            onSelectColumnClick={onSelectColumnClick}
            onRowClick={onRowClick}
            onOpenCtxMenu={openCtxMenuAt}
          />
        )}
      </Panel>

      <PaneSeparator orientation="vertical" />

      <Panel id="right" minSize="30%" className="min-h-0 min-w-0">
        <div className="flex h-full min-h-0 min-w-0 flex-col">
        <div className="relative flex h-[45px] shrink-0 items-center gap-2 border-b border-border bg-panel px-2">
          {multiSelected && mode === "unassigned" && (
            <>
              <div className="relative">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setAssignQuery("");
                    setAssignMode((m) => (m === "header" ? null : "header"));
                  }}
                  className="inline-flex h-7 items-center rounded-md bg-elevated px-2.5 text-[12px] leading-none text-text transition-colors hover:bg-white/18"
                >
                  Add to existing contact
                </button>
                {assignMode === "header" && (
                  <div ref={assignRef} className="absolute left-0 z-30 mt-1">
                    {assignSearch}
                  </div>
                )}
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => void moveToTrash()}
                className="inline-flex h-7 items-center rounded-md bg-elevated px-2.5 text-[12px] leading-none text-text transition-colors hover:bg-red-500/15 hover:text-red-300"
              >
                Delete
              </button>
            </>
          )}
          {creating && createDraft && !multiSelected && mode === "unassigned" ? (
            <>
              <button
                type="button"
                disabled={saving || !canSaveCreate}
                onClick={() => void saveCreate()}
                className="inline-flex h-7 items-center rounded-md bg-elevated px-2.5 text-[12px] leading-none text-text transition-colors hover:bg-white/18 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={cancelCreate}
                className="inline-flex h-7 items-center rounded-md bg-white/8 px-2.5 text-[12px] leading-none text-muted transition-colors hover:bg-white/14 hover:text-text disabled:opacity-50"
              >
                Cancel
              </button>
            </>
          ) : (
            !multiSelected &&
            mode === "unassigned" && (
              <>
                <button
                  type="button"
                  disabled={!selected || saving}
                  onClick={beginCreate}
                  className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-elevated px-2.5 text-[12px] leading-none text-muted transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <PencilIcon className="size-4 shrink-0" />
                  Edit
                </button>
                <GroupsMenu
                  allGroups={menuGroups}
                  checks={draftGroupChecks}
                  excludedCheck={draftExcludedCheck}
                  disabled={!createDraft || !selected || saving}
                  onToggle={toggleDraftGroup}
                  onToggleExcluded={toggleDraftExcluded}
                  onCreate={createAndAssignDraftGroup}
                />
                <div
                  ref={moreMenuRef}
                  className="relative inline-flex shrink-0 items-center"
                >
                  <button
                    type="button"
                    disabled={!selected || saving}
                    aria-expanded={moreMenuOpen}
                    onClick={() => setMoreMenuOpen((v) => !v)}
                    className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      moreMenuOpen
                        ? "bg-accent/20 text-accent"
                        : "bg-elevated text-muted hover:text-text"
                    }`}
                  >
                    More
                    <ChevronDownIcon className="size-3.5 shrink-0 opacity-70" />
                  </button>
                  {moreMenuOpen && (
                    <div className="absolute top-full left-0 z-50 mt-1 min-w-[200px] rounded-lg border border-border bg-[#2c2c2e] py-1 shadow-xl">
                      <button
                        type="button"
                        disabled={saving}
                        className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-text hover:bg-white/20 disabled:opacity-50"
                        onClick={() => {
                          setMoreMenuOpen(false);
                          setAssignQuery("");
                          setAssignMode("header");
                        }}
                      >
                        Add to existing contact
                      </button>
                      <div className="my-1 border-t border-border/60" />
                      <button
                        type="button"
                        disabled={saving}
                        className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-text hover:bg-red-500/15 hover:text-red-300 disabled:opacity-50"
                        onClick={() => {
                          setMoreMenuOpen(false);
                          void moveToTrash();
                        }}
                      >
                        <XIcon className="size-5 shrink-0 opacity-80" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
                {assignMode === "header" && (
                  <div ref={assignRef} className="absolute left-2 top-[45px] z-30">
                    {assignSearch}
                  </div>
                )}
              </>
            )
          )}
          <span className="min-w-0 flex-1" aria-hidden />
          {status && (
            <span className="truncate text-[12px] text-muted">{status}</span>
          )}
        </div>

        <div className="flex h-[45px] shrink-0 items-center border-b border-border bg-panel px-5">
          {multiSelected ? (
            <h1 className="truncate text-xl font-semibold tracking-tight text-text">
              {selectedHandles.size} contact
              {selectedHandles.size === 1 ? "" : "s"} selected
            </h1>
          ) : selected ? (
            <h1 className="truncate text-xl font-semibold tracking-tight text-text">
              {selected.unverified ? (
                <>
                  {selected.displayName}
                  <span className="font-normal text-muted"> (Unverified)</span>
                </>
              ) : selected.displayName !== selected.handle ? (
                selected.displayName
              ) : (
                selected.handle
              )}
            </h1>
          ) : (
            <span className="text-[13px] text-muted">
              {mode === "trash"
                ? "Choose a trashed contact or number"
                : "Choose an unassigned number or email"}
            </span>
          )}
        </div>

        {multiSelected ? (
          <div className="min-h-0 flex-1">
            <UnassignedDetailPane
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
          </div>
        ) : (
          <Group
            id="mv-unassigned-threads"
            orientation="vertical"
            className="min-h-0 flex-1"
            defaultLayout={threadsLayout.defaultLayout}
            onLayoutChanged={threadsLayout.onLayoutChanged}
          >
            <Panel
              id="detail"
              defaultSize="40%"
              minSize="25%"
              maxSize="75%"
              className="min-h-0"
            >
              <UnassignedDetailPane
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
            </Panel>

            <PaneSeparator orientation="horizontal" />

            <Panel id="messages" minSize="25%" className="min-h-0">
              <UnassignedMessagesPane
                multiSelected={multiSelected}
                activeYear={activeYear}
                loadingMessages={loadingMessages}
                messages={messages}
                activeYearMeta={activeYearMeta}
              />
            </Panel>
          </Group>
        )}
        </div>
      </Panel>
    </Group>

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
                Delete forever
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
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-text hover:bg-red-500/15 hover:text-red-300 disabled:opacity-50"
                onClick={() => void moveToTrash()}
              >
                <XIcon className="size-5 shrink-0 opacity-80" />
                Delete
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={saving || creating}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-text hover:bg-white/20 disabled:opacity-40"
                onMouseEnter={scheduleCloseGroupsPanel}
                onClick={() => {
                  setCtxMenu(null);
                  closeGroupsPanel();
                  beginCreate();
                }}
              >
                <PencilIcon className="size-5 shrink-0 opacity-80" />
                Edit
              </button>
              <button
                type="button"
                disabled={saving || !createDraft || creating}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-text hover:bg-white/20 disabled:opacity-40"
                onMouseEnter={(e) => {
                  if (saving || !createDraft || creating) return;
                  openCtxGroups(e.currentTarget.getBoundingClientRect());
                }}
                onMouseLeave={scheduleCloseGroupsPanel}
              >
                <PeopleGroupIcon className="size-5 shrink-0 opacity-80" />
                <span className="min-w-0 flex-1">Groups</span>
                <ChevronRightIcon className="size-3.5 shrink-0 opacity-70" />
              </button>
              <button
                type="button"
                disabled={saving || creating}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-text hover:bg-white/20 disabled:opacity-50"
                onMouseEnter={scheduleCloseGroupsPanel}
                onClick={() => {
                  const pos = clampMenu(ctxMenu.x, ctxMenu.y, 288, 280);
                  setCtxMenu(null);
                  closeGroupsPanel();
                  setAssignQuery("");
                  setAssignMode(pos);
                }}
              >
                Add to existing contact
              </button>
              <div className="my-1 border-t border-border/60" />
              <button
                type="button"
                disabled={saving || creating}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-text hover:bg-red-500/15 hover:text-red-300 disabled:opacity-50"
                onMouseEnter={scheduleCloseGroupsPanel}
                onClick={() => void moveToTrash()}
              >
                <XIcon className="size-5 shrink-0 opacity-80" />
                Delete
              </button>
            </>
          )}
        </div>
      )}

      {groupsPanelPos && createDraft && (
        <div
          ref={groupsPanelWrapRef}
          onMouseEnter={cancelCloseGroupsPanel}
          onMouseLeave={scheduleCloseGroupsPanel}
        >
          <GroupsMenu
            fixedPosition={groupsPanelPos}
            allGroups={menuGroups}
            checks={draftGroupChecks}
            excludedCheck={draftExcludedCheck}
            onToggle={toggleDraftGroup}
            onToggleExcluded={toggleDraftExcluded}
            onCreate={createAndAssignDraftGroup}
            onModeChange={(next) => {
              groupsCreatePinnedRef.current = next === "create";
              if (next === "create") cancelCloseGroupsPanel();
            }}
            onOpenChange={(open) => {
              if (!open) closeGroupsPanel();
            }}
          />
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
    </>
  );
}
