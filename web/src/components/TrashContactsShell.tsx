"use client";

import type { UnassignedHandle, YearThread } from "@/lib/types";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type SortOrder, type TrashSortBy } from "./SortByMenu";
import { TrashContactList } from "./TrashContactList";
import { TrashContactsDetailPane } from "./TrashContactsDetailPane";
import { TrashContactsMessagesPane } from "./TrashContactsMessagesPane";
import { useHistory } from "./history";
import { useSourceFilter } from "./SourceFilter";
import { useDismissible } from "./useDismissible";
import { useListSelection } from "./useListSelection";
import { usePersistedEnum } from "./usePersistedEnum";
import { PaneSeparator } from "./PaneSeparator";
import { usePanelLayoutStorage } from "./panelLayoutStorage";
import { useThreadMessages } from "./useThreadMessages";
import { useConfirmDialog } from "./useConfirmDialog";
import { Group, Panel, useDefaultLayout } from "react-resizable-panels";

const TRASH_SORT_BY_KEY = "mv-trash-sort-by";
const TRASH_SORT_ORDER_KEY = "mv-trash-sort-order";
const TRASH_SORT_BY_ALLOWED = ["phone", "first", "last", "count"] as const;
const TRASH_SORT_ORDER_ALLOWED = ["asc", "desc"] as const;

function trashLetterFor(h: UnassignedHandle, sortBy: TrashSortBy): string {
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

export function TrashContactsShell({
  handles: initialHandles,
  initialHandle,
  trashTabBar = null,
}: {
  handles: UnassignedHandle[];
  initialHandle: string | null;
  /** Contacts / Group chats tabs — sits in the list header (left of the pane split). */
  trashTabBar?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { clear: clearHistory } = useHistory();
  const { sources, source, setSource, sourceQuery } = useSourceFilter();
  const [handles, setHandles] = useState(initialHandles);
  const [trashSortBy, setTrashSortBy] = usePersistedEnum(
    TRASH_SORT_BY_KEY,
    TRASH_SORT_BY_ALLOWED,
    "phone",
  );
  const [trashSortOrder, setTrashSortOrder] = usePersistedEnum(
    TRASH_SORT_ORDER_KEY,
    TRASH_SORT_ORDER_ALLOWED,
    "asc",
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
  const [activeYear, setActiveYear] = useState<number | null>(null);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    handle?: string;
  } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);
  const storage = usePanelLayoutStorage();
  const sideLayout = useDefaultLayout({
    id: "mv-trash-contacts-side",
    panelIds: ["list", "right"],
    storage,
  });
  const threadsLayout = useDefaultLayout({
    id: "mv-trash-contacts-threads",
    panelIds: ["detail", "messages"],
    storage,
  });

  const selected = handles.find((h) => h.handle === handle) ?? null;
  const selectedTrashKind = selected?.trashKind;
  const selectedContactId = selected?.contactId;

  const sortedHandles = useMemo(() => {
    const copy = [...handles];
    copy.sort((a, b) => {
      let cmp = 0;
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
      return trashSortOrder === "desc" ? -cmp : cmp;
    });
    return copy;
  }, [handles, trashSortBy, trashSortOrder]);

  const trashFilteredHandles = useMemo(() => {
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
  }, [sortedHandles, trashQuery]);

  const trashGrouped = useMemo((): [string, UnassignedHandle[]][] => {
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
  }, [trashFilteredHandles, trashSortBy, trashQuery]);

  const orderedIds = useMemo(
    () => trashFilteredHandles.map((h) => h.handle),
    [trashFilteredHandles],
  );
  const validIds = useMemo(() => handles.map((h) => h.handle), [handles]);

  const selectHandleRef = useRef<(next: string) => void>(() => {});
  const dismissSelectionUi = useCallback(() => {
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
    escapeBlocked: () => ctxMenu != null,
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
      setActiveYear(null);
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

  const clampMenu = (x: number, y: number, w: number, h: number) => ({
    x: Math.max(8, Math.min(x, window.innerWidth - w - 8)),
    y: Math.max(8, Math.min(y, window.innerHeight - h - 8)),
  });

  useEffect(() => {
    setHandles(initialHandles);
    if (handle && !initialHandles.some((h) => h.handle === handle)) {
      setHandle(null);
      setYearly([]);
      setActiveYear(null);
    }
  }, [initialHandles, handle]);

  useEffect(() => {
    if (multiSelected) {
      setYearly([]);
      setActiveYear(null);
      setMessageSources([]);
      setSourceCounts({ all: 0, bySource: {} });
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
    qs.set("trashed", "1");
    const url =
      selectedTrashKind === "contact" && selectedContactId != null
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
          setActiveYear(null);
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

        if (nextYearly.length === 0) {
          setActiveYear(null);
          return;
        }
        setActiveYear((prev) => {
          if (prev != null && nextYearly.some((t) => t.year === prev)) {
            return prev;
          }
          return nextYearly[0]!.year;
        });
      })
      .finally(() => {
        if (!cancelled) setLoadingThreads(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    handle,
    selectedTrashKind,
    selectedContactId,
    source,
    setSource,
    multiSelected,
  ]);

  const threadConversationIds = useMemo(() => {
    if (activeYear == null) return null;
    const y = yearly.find((t) => t.year === activeYear);
    return y?.conversationIds?.length ? y.conversationIds : null;
  }, [yearly, activeYear]);

  const { messages, loading: loadingMessages } = useThreadMessages({
    conversationIds: threadConversationIds,
    year: activeYear,
    sourceQuery,
    enabled: !multiSelected && handle != null,
  });

  const loadYear = (year: number, _conversationIds: number[]) => {
    setActiveYear(year);
  };

  const clearFocus = useCallback(() => {
    setHandle(null);
    setYearly([]);
    setActiveYear(null);
    setMessageSources([]);
    setSourceCounts({ all: 0, bySource: {} });
    const params = new URLSearchParams(searchParams.toString());
    params.delete("h");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const clearFocusAfterRemoval = useCallback(
    (phones: string[]) => {
      const removed = new Set(phones);
      setHandles((prev) => prev.filter((h) => !removed.has(h.handle)));
      clearSelection();
      if (handle && removed.has(handle)) {
        clearFocus();
      }
    },
    [clearFocus, clearSelection, handle],
  );

  useEffect(() => {
    if (!handle) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (ctxMenu != null) return;
      e.preventDefault();
      clearFocus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [handle, ctxMenu, clearFocus]);

  const getTrashTargets = useCallback(
    (forHandle?: string) => {
      if (forHandle && !multiSelected) return [forHandle];
      return actionTargets;
    },
    [actionTargets, multiSelected],
  );

  const { confirm: askConfirm, dialog: permanentConfirmDialog } =
    useConfirmDialog();

  const runMixedTrashRestoreOrDelete = useCallback(
    async (targets: string[], permanent: boolean) => {
      if (targets.length === 0) return;
      if (permanent) {
        const msg =
          targets.length === 1
            ? "Delete forever?"
            : `Delete ${targets.length} items forever?`;
        if (!(await askConfirm(msg, "Delete"))) return;
      }
      setSaving(true);
      setCtxMenu(null);
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
    [askConfirm, handles, clearFocusAfterRemoval, clearHistory, router],
  );

  const restoreFromTrash = useCallback(
    async (override?: string) => {
      await runMixedTrashRestoreOrDelete(getTrashTargets(override), false);
    },
    [getTrashTargets, runMixedTrashRestoreOrDelete],
  );

  const permanentlyDeleteFromTrash = useCallback(
    async (override?: string) => {
      await runMixedTrashRestoreOrDelete(getTrashTargets(override), true);
    },
    [getTrashTargets, runMixedTrashRestoreOrDelete],
  );

  useDismissible({
    open: ctxMenu != null,
    onDismiss: () => setCtxMenu(null),
    refs: [ctxMenuRef],
    dismissOnPointerLeave: 0,
  });

  const openCtxMenuAt = (
    x: number,
    y: number,
    nextHandle: string,
    menuH: number,
  ) => {
    if (multiSelected && selectedHandles.has(nextHandle)) {
      setCtxMenu({ ...clampMenu(x, y, 200, menuH), handle: nextHandle });
      return;
    }
    if (multiSelected) {
      selectHandle(nextHandle);
      setCtxMenu({ ...clampMenu(x, y, 200, menuH), handle: nextHandle });
      return;
    }
    if (nextHandle !== handle) selectHandle(nextHandle);
    setCtxMenu({ ...clampMenu(x, y, 200, menuH), handle: nextHandle });
  };

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
        id="mv-trash-contacts-side"
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
            onDeleteForeverHeader={() => void permanentlyDeleteFromTrash()}
            onOpenCtxMenu={openCtxMenuAt}
          />
        </Panel>

        <PaneSeparator orientation="vertical" />

        <Panel id="right" minSize="30%" className="min-h-0 min-w-0">
          <div className="flex h-full min-h-0 min-w-0 flex-col">
            <div className="relative flex h-[45px] shrink-0 items-center gap-2 border-b border-border bg-panel px-2">
              <span className="min-w-0 flex-1" aria-hidden />
              {status && (
                <span className="truncate text-[12px] text-muted">{status}</span>
              )}
            </div>

            <div className="flex h-[45px] shrink-0 items-center border-b border-border bg-panel px-5">
              {selected && !multiSelected ? (
                <h1 className="truncate text-xl font-semibold tracking-tight text-text">
                  {selected.unverified ? (
                    <>
                      {selected.displayName}
                      <span className="font-normal text-muted">
                        {" "}
                        (Unverified)
                      </span>
                    </>
                  ) : selected.displayName !== selected.handle ? (
                    selected.displayName
                  ) : (
                    selected.handle
                  )}
                </h1>
              ) : (
                <span className="text-[13px] text-muted">
                  Choose a trashed contact or number
                </span>
              )}
            </div>

            {multiSelected ? (
              <div className="min-h-0 flex-1" />
            ) : (
              <Group
                id="mv-trash-contacts-threads"
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
                  <TrashContactsDetailPane
                    mode="trash"
                    multiSelected={multiSelected}
                    selected={selected}
                    selectedItems={selectedItems}
                    creating={false}
                    createDraft={null}
                    onDraftChange={() => {}}
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
                  <TrashContactsMessagesPane
                    multiSelected={multiSelected}
                    activeYear={activeYear}
                    loadingMessages={loadingMessages}
                    messages={messages}
                    activeYearMeta={activeYearMeta}
                    emptyHint={null}
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
        </div>
      )}

      {permanentConfirmDialog}
    </>
  );
}
