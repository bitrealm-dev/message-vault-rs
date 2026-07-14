"use client";

import type {
  TrashedContactItem,
  TrashedContactMessagesItem,
} from "@/lib/types";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useHistory } from "./history";
import { useListSelection } from "./useListSelection";

type Row = TrashedContactItem | TrashedContactMessagesItem;

function rowKey(row: Row): string {
  return row.kind === "contact" ? `c:${row.contactId}` : `h:${row.handle}`;
}

export function ContactsTrashShell({
  contacts,
  messagesOnly,
}: {
  contacts: TrashedContactItem[];
  messagesOnly: TrashedContactMessagesItem[];
}) {
  const router = useRouter();
  const { clear: clearHistory } = useHistory();
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => [...contacts, ...messagesOnly]);

  const serverKey = useMemo(
    () =>
      `${contacts.map((c) => c.contactId).join(",")}|${messagesOnly.map((m) => m.handle).join(",")}`,
    [contacts, messagesOnly],
  );
  const [prevServerKey, setPrevServerKey] = useState(serverKey);
  if (serverKey !== prevServerKey) {
    setPrevServerKey(serverKey);
    setRows([...contacts, ...messagesOnly]);
  }

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) =>
        a.sortKey.localeCompare(b.sortKey, undefined, { sensitivity: "base" }),
      ),
    [rows],
  );

  const validIds = useMemo(() => sorted.map(rowKey), [sorted]);
  const {
    selectedIds,
    hasSelection,
    allSelected,
    selectAllRef,
    clearSelection,
    toggleSelectAll,
    onSelectColumnClick,
  } = useListSelection<string>({
    orderedIds: validIds,
    validIds,
    rangeMode: "selectionSpan",
    multiThreshold: "any",
    rowClickMode: "openWhenEmptyElseToggle",
    checkboxEvents: "preventAndStop",
    escapeToClear: true,
    selectAllSetsAnchor: false,
  });

  const selectedRows = useMemo(
    () => sorted.filter((r) => selectedIds.has(rowKey(r))),
    [sorted, selectedIds],
  );

  const contactTargets = useCallback((): number[] => {
    if (!hasSelection) return [];
    return selectedRows
      .filter((r): r is TrashedContactItem => r.kind === "contact")
      .map((r) => r.contactId);
  }, [hasSelection, selectedRows]);

  const handleTargets = useCallback((): string[] => {
    if (!hasSelection) return [];
    return selectedRows
      .filter(
        (r): r is TrashedContactMessagesItem => r.kind === "messages_only",
      )
      .map((r) => r.handle);
  }, [hasSelection, selectedRows]);

  const runContactBatch = useCallback(
    async (permanent: boolean) => {
      const ids = contactTargets();
      if (ids.length === 0) return;
      if (permanent) {
        const msg =
          ids.length === 1
            ? "Delete this contact and its 1:1 messages forever? This cannot be undone."
            : `Delete ${ids.length} contacts and their 1:1 messages forever? This cannot be undone.`;
        if (!window.confirm(msg)) return;
      }
      setSaving(true);
      try {
        const res = await fetch("/api/contacts/trash", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, permanent: permanent || undefined }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "action failed");
        const gone = new Set(ids);
        setRows((prev) =>
          prev.filter(
            (r) => !(r.kind === "contact" && gone.has(r.contactId)),
          ),
        );
        clearSelection();
        setStatus(
          permanent
            ? ids.length === 1
              ? "Deleted forever"
              : `Deleted ${ids.length} contacts forever`
            : ids.length === 1
              ? "Undeleted — contact restored"
              : `Undeleted ${ids.length} contacts`,
        );
        if (permanent) clearHistory();
        router.refresh();
      } catch (err) {
        console.error(err);
        setStatus(err instanceof Error ? err.message : "action failed");
        router.refresh();
      } finally {
        setSaving(false);
      }
    },
    [clearSelection, clearHistory, contactTargets, router],
  );

  const runHandleBatch = useCallback(
    async (permanent: boolean) => {
      const handles = handleTargets();
      if (handles.length === 0) return;
      if (permanent) {
        const msg =
          handles.length === 1
            ? "Delete these messages forever? This cannot be undone."
            : `Delete messages for ${handles.length} numbers/emails forever? This cannot be undone.`;
        if (!window.confirm(msg)) return;
      }
      setSaving(true);
      try {
        for (const handle of handles) {
          const res = await fetch("/api/contacts/trash", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              handle,
              permanent: permanent || undefined,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "action failed");
        }
        const gone = new Set(handles);
        setRows((prev) =>
          prev.filter(
            (r) => !(r.kind === "messages_only" && gone.has(r.handle)),
          ),
        );
        clearSelection();
        setStatus(
          permanent
            ? handles.length === 1
              ? "Deleted forever"
              : `Deleted ${handles.length} threads forever`
            : handles.length === 1
              ? "Undeleted — messages restored"
              : `Undeleted ${handles.length} threads`,
        );
        if (permanent) clearHistory();
        router.refresh();
      } catch (err) {
        console.error(err);
        setStatus(err instanceof Error ? err.message : "action failed");
        router.refresh();
      } finally {
        setSaving(false);
      }
    },
    [clearSelection, clearHistory, handleTargets, router],
  );

  const onRestore = useCallback(async () => {
    if (contactTargets().length) await runContactBatch(false);
    if (handleTargets().length) await runHandleBatch(false);
  }, [contactTargets, handleTargets, runContactBatch, runHandleBatch]);

  const onPermanent = useCallback(async () => {
    if (contactTargets().length) await runContactBatch(true);
    if (handleTargets().length) await runHandleBatch(true);
  }, [contactTargets, handleTargets, runContactBatch, runHandleBatch]);

  const canAct = hasSelection && !saving;
  const contactSection = sorted.filter((r) => r.kind === "contact");
  const messageSection = sorted.filter((r) => r.kind === "messages_only");

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-bg">
      <div className="shrink-0 border-b border-border/60 bg-bg px-5 pt-4 pb-3">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <label className="flex shrink-0 items-center gap-2">
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={allSelected}
                disabled={sorted.length === 0}
                aria-label="Select all trashed contacts"
                onChange={toggleSelectAll}
                className="checkbox-list"
              />
              <span className="text-[13px] text-muted tabular-nums">
                {selectedIds.size > 0 ? selectedIds.size : ""}
              </span>
            </label>
            <h2 className="text-[11px] font-semibold tracking-wider text-muted uppercase">
              Trashed contacts
            </h2>
            {status && (
              <span className="truncate text-[12px] text-muted">{status}</span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              disabled={!canAct}
              onClick={() => void onRestore()}
              className="inline-flex items-center rounded-md bg-white/8 px-2.5 py-1 text-[12px] text-muted transition-colors hover:bg-white/14 hover:text-text disabled:pointer-events-none disabled:opacity-40"
            >
              Undelete
            </button>
            <button
              type="button"
              disabled={!canAct}
              onClick={() => void onPermanent()}
              className="inline-flex items-center rounded-md bg-white/8 px-2.5 py-1 text-[12px] text-muted transition-colors hover:bg-red-500/15 hover:text-red-300 disabled:pointer-events-none disabled:opacity-40"
            >
              Delete forever
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
        {sorted.length === 0 ? (
          <p className="pt-8 text-center text-[13px] text-muted">
            Trash is empty for contacts.
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {contactSection.length > 0 && (
              <div>
                <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-muted uppercase">
                  Contacts &amp; messages
                </h3>
                <ul className="divide-y divide-border/50 rounded-lg border border-border/60 bg-[#2c2c2e]">
                  {contactSection.map((row) => {
                    const key = rowKey(row);
                    const selected = selectedIds.has(key);
                    return (
                      <li key={key}>
                        <div
                          className={`flex items-center gap-3 px-3 py-2.5 ${
                            selected ? "bg-accent/15" : "hover:bg-white/5"
                          }`}
                        >
                          <button
                            type="button"
                            aria-label={`Select ${row.displayName}`}
                            className="shrink-0"
                            onClick={(e) => onSelectColumnClick(key, e)}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              readOnly
                              tabIndex={-1}
                              className="checkbox-list pointer-events-none"
                            />
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[14px] text-text">
                              {row.displayName}
                            </div>
                            <div className="truncate text-[12px] text-muted">
                              {row.handleCount} handle
                              {row.handleCount === 1 ? "" : "s"}
                              {" · "}
                              {row.messageCount.toLocaleString()} messages
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {messageSection.length > 0 && (
              <div>
                <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-muted uppercase">
                  Messages only
                </h3>
                <ul className="divide-y divide-border/50 rounded-lg border border-border/60 bg-[#2c2c2e]">
                  {messageSection.map((row) => {
                    const key = rowKey(row);
                    const selected = selectedIds.has(key);
                    return (
                      <li key={key}>
                        <div
                          className={`flex items-center gap-3 px-3 py-2.5 ${
                            selected ? "bg-accent/15" : "hover:bg-white/5"
                          }`}
                        >
                          <button
                            type="button"
                            aria-label={`Select messages for ${row.handle}`}
                            className="shrink-0"
                            onClick={(e) => onSelectColumnClick(key, e)}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              readOnly
                              tabIndex={-1}
                              className="checkbox-list pointer-events-none"
                            />
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[14px] text-text">
                              {row.displayName}
                            </div>
                            <div className="truncate text-[12px] text-muted">
                              {row.handle}
                              {" · "}
                              {row.messageCount.toLocaleString()} messages
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
