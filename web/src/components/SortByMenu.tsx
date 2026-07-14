"use client";

import { useRef, useState } from "react";
import { IconHoverTarget } from "./IconHoverLabel";
import { useDismissible } from "./useDismissible";

export type SortMode = "first" | "last" | "messages";
export type UnassignedSortBy = "phone" | "date" | "messages";
export type SortOrder = "asc" | "desc";

type SortField<T extends string> = { id: T; label: string };

/** Config-driven sort field + ascending/descending menu. */
export function SortMenu<T extends string>({
  fields,
  sort,
  order,
  onChange,
  ariaLabel = "Sort by",
}: {
  fields: SortField<T>[];
  sort: T;
  order: SortOrder;
  onChange: (next: { sort: T; order: SortOrder }) => void;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useDismissible({
    open,
    onDismiss: () => setOpen(false),
    refs: [rootRef],
  });

  const sortLabel =
    fields.find((field) => field.id === sort)?.label ?? String(sort);
  const orderLabel = order === "asc" ? "Ascending" : "Descending";

  return (
    <div className="relative" ref={rootRef}>
      <IconHoverTarget
        label={`${sortLabel}, ${orderLabel}`}
        placement="bottom"
      >
        <button
          type="button"
          aria-label={ariaLabel}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-elevated text-muted hover:text-text"
        >
          <SortIcon />
        </button>
      </IconHoverTarget>
      {open && (
        <div className="absolute top-full right-0 z-50 mt-1 min-w-[10.5rem] rounded-xl border border-border bg-[#2c2c2e] py-2 shadow-xl">
          <div className="px-3 pb-1.5 text-[12px] font-semibold text-text">
            Sort By
          </div>
          {fields.map((field) => (
            <SortOption
              key={field.id}
              label={field.label}
              selected={sort === field.id}
              onSelect={() => {
                onChange({ sort: field.id, order });
                setOpen(false);
              }}
            />
          ))}
          <div className="my-1.5 border-t border-border" />
          <div className="px-3 pb-1.5 text-[12px] font-semibold text-text">
            Order
          </div>
          <SortOption
            label="Ascending"
            selected={order === "asc"}
            onSelect={() => {
              onChange({ sort, order: "asc" });
              setOpen(false);
            }}
          />
          <SortOption
            label="Descending"
            selected={order === "desc"}
            onSelect={() => {
              onChange({ sort, order: "desc" });
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

const CONTACT_SORT_FIELDS: SortField<SortMode>[] = [
  { id: "first", label: "First Name" },
  { id: "last", label: "Last Name" },
  { id: "messages", label: "Message Count" },
];

export function SortByMenu({
  sort,
  order,
  onChange,
}: {
  sort: SortMode;
  order: SortOrder;
  onChange: (next: { sort: SortMode; order: SortOrder }) => void;
}) {
  return (
    <SortMenu
      fields={CONTACT_SORT_FIELDS}
      sort={sort}
      order={order}
      onChange={onChange}
      ariaLabel="Sort by"
    />
  );
}

const UNASSIGNED_SORT_FIELDS: SortField<UnassignedSortBy>[] = [
  { id: "phone", label: "Phone number" },
  { id: "date", label: "Date" },
  { id: "messages", label: "Message Count" },
];

/** Phone/date/messages + ascending/descending for Unassigned. */
export function UnassignedSortMenu({
  sortBy,
  order,
  onChange,
}: {
  sortBy: UnassignedSortBy;
  order: SortOrder;
  onChange: (next: { sortBy: UnassignedSortBy; order: SortOrder }) => void;
}) {
  return (
    <SortMenu
      fields={UNASSIGNED_SORT_FIELDS}
      sort={sortBy}
      order={order}
      onChange={({ sort, order: nextOrder }) =>
        onChange({ sortBy: sort, order: nextOrder })
      }
      ariaLabel="Sort unassigned"
    />
  );
}

export type TrashSortBy = "phone" | "first" | "last" | "count";

const TRASH_SORT_FIELDS: SortField<TrashSortBy>[] = [
  { id: "phone", label: "Phone number" },
  { id: "first", label: "First" },
  { id: "last", label: "Last" },
  { id: "count", label: "Count" },
];

/** Phone / first / last / count + ascending/descending for Trash contacts. */
export function TrashSortMenu({
  sortBy,
  order,
  onChange,
}: {
  sortBy: TrashSortBy;
  order: SortOrder;
  onChange: (next: { sortBy: TrashSortBy; order: SortOrder }) => void;
}) {
  return (
    <SortMenu
      fields={TRASH_SORT_FIELDS}
      sort={sortBy}
      order={order}
      onChange={({ sort, order: nextOrder }) =>
        onChange({ sortBy: sort, order: nextOrder })
      }
      ariaLabel="Sort trash"
    />
  );
}

export type GroupTrashSortBy = "start" | "end" | "people" | "messages";

const GROUP_TRASH_SORT_FIELDS: SortField<GroupTrashSortBy>[] = [
  { id: "start", label: "Start date" },
  { id: "end", label: "End date" },
  { id: "people", label: "People" },
  { id: "messages", label: "Messages" },
];

/** Start/end date, people, messages for Trash group chats. */
export function GroupTrashSortMenu({
  sortBy,
  order,
  onChange,
}: {
  sortBy: GroupTrashSortBy;
  order: SortOrder;
  onChange: (next: { sortBy: GroupTrashSortBy; order: SortOrder }) => void;
}) {
  return (
    <SortMenu
      fields={GROUP_TRASH_SORT_FIELDS}
      sort={sortBy}
      order={order}
      onChange={({ sort, order: nextOrder }) =>
        onChange({ sortBy: sort, order: nextOrder })
      }
      ariaLabel="Sort trashed groups"
    />
  );
}

function SortOption({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-text hover:bg-white/20"
    >
      <span className="flex w-4 justify-center text-accent">
        {selected ? <CheckIcon /> : null}
      </span>
      {label}
    </button>
  );
}

function SortIcon() {
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

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M2 6.2L4.6 9 10 3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
