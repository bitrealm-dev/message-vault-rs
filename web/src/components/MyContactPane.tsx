"use client";

import type { VaultOwner } from "@/lib/vaultOwner";
import { useMemo, useState } from "react";
import { IconHoverTarget } from "./IconHoverLabel";
import {
  EllipsisIcon,
  GroupMessagesOutlineIcon,
  MessageIcon,
  PencilIcon,
  PeopleGroupIcon,
} from "./icons";

/** Contact-list chrome for vault owner — visual match to Panel 2, fully read-only. */
export function MyContactPane({
  owner,
  groupMessageCount = 0,
}: {
  owner: VaultOwner;
  /** Distinct group chats (shown like contacts list counts). */
  groupMessageCount?: number;
}) {
  const [query, setQuery] = useState("");
  const displayName = owner.display_name || "Me";
  const preferredHandle = owner.phones[0] ?? "";
  const letter = (displayName.trim().charAt(0) || "#").toUpperCase();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const qDigits = q.replace(/\D/g, "");
    if (displayName.toLowerCase().includes(q)) return true;
    if (preferredHandle.toLowerCase().includes(q)) return true;
    if (
      qDigits.length > 0 &&
      owner.phones.some((p) => p.replace(/\D/g, "").includes(qDigits))
    ) {
      return true;
    }
    return owner.emails.some((e) => e.toLowerCase().includes(q));
  }, [query, displayName, preferredHandle, owner.phones, owner.emails]);

  const toolbarBtn =
    "flex h-7 w-7 items-center justify-center rounded-md border border-border bg-elevated text-muted opacity-40";

  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-sidebar">
      <div className="flex h-[45px] shrink-0 items-center border-b border-border px-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or phone…"
          className="w-full rounded-md border border-border bg-elevated px-2.5 py-1.5 text-[13px] text-text outline-none placeholder:text-muted focus:border-accent"
        />
      </div>
      <div className="flex h-[45px] shrink-0 items-center justify-between overflow-visible border-b border-border px-3">
        <label className="flex min-w-0 items-center gap-2">
          <IconHoverTarget label="Select all (unavailable)" placement="bottom">
            <input
              type="checkbox"
              checked={false}
              disabled
              aria-label="Select all (unavailable)"
              className="checkbox-list opacity-40"
            />
          </IconHoverTarget>
        </label>
        <div className="flex shrink-0 items-center gap-1.5 overflow-visible">
          <IconHoverTarget label="Groups (unavailable)" placement="bottom">
            <span className={toolbarBtn} aria-hidden>
              <PeopleGroupIcon className="size-5 shrink-0" />
            </span>
          </IconHoverTarget>
          <IconHoverTarget label="Edit (unavailable)" placement="bottom">
            <span className={toolbarBtn} aria-hidden>
              <PencilIcon className="size-4" />
            </span>
          </IconHoverTarget>
          <IconHoverTarget label="Sort (unavailable)" placement="bottom">
            <span className={toolbarBtn} aria-hidden>
              <SortArrowsIcon />
            </span>
          </IconHoverTarget>
          <IconHoverTarget label="Actions (unavailable)" placement="bottom">
            <span className={toolbarBtn} aria-hidden>
              <EllipsisIcon className="size-5" />
            </span>
          </IconHoverTarget>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {!visible ? (
          <p className="px-3 py-4 text-[12px] text-muted">No matches</p>
        ) : (
          <div>
            <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-sidebar px-3 py-1 text-[11px] font-semibold text-muted">
              <span>{letter}</span>
              <span
                className="inline-flex items-center gap-1 font-normal"
                title="Group chats | 1:1 messages"
                aria-label="Group chats | 1:1 messages"
              >
                <GroupMessagesOutlineIcon className="size-3.5 opacity-80" />
                <span className="opacity-50">|</span>
                <MessageIcon className="size-3.5 opacity-80" />
              </span>
            </div>
            <div
              className="relative flex w-full items-start gap-1.5 bg-accent/20 py-2 pr-3 pl-0 select-none"
              aria-label={`My contact information: ${displayName}`}
            >
              <span
                aria-hidden
                className="absolute top-1 bottom-1 left-0 w-1 rounded-full bg-accent/80"
              />
              <span className="flex w-10 shrink-0 items-center justify-center self-stretch -my-2">
                <input
                  type="checkbox"
                  checked={false}
                  disabled
                  tabIndex={-1}
                  aria-hidden
                  className="checkbox-list opacity-40"
                />
              </span>
              <span className="flex min-w-0 flex-1 items-start justify-between gap-2 text-left">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-text">
                    {displayName}
                  </span>
                  {preferredHandle && preferredHandle !== displayName ? (
                    <span className="block truncate text-[12px] text-muted">
                      {preferredHandle}
                    </span>
                  ) : (
                    <span
                      className="block h-[1.5rem] text-[12px]"
                      aria-hidden
                    />
                  )}
                </span>
                {groupMessageCount > 0 && (
                  <span
                    className="shrink-0 pt-0.5 text-[12px] text-muted"
                    title="Group chats"
                  >
                    {groupMessageCount.toLocaleString()}
                  </span>
                )}
              </span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function SortArrowsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M5 3v10M5 3l-2.5 2.5M5 3l2.5 2.5M11 13V3M11 13l-2.5-2.5M11 13l2.5-2.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
