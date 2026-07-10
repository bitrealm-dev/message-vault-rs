"use client";

import { useEffect, useRef, useState } from "react";

export type SortMode = "first" | "last";

export function SortByMenu({
  sort,
  onChange,
}: {
  sort: SortMode;
  onChange: (mode: SortMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label="Sort by"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-elevated text-muted hover:text-text"
      >
        <SortIcon />
      </button>
      {open && (
        <div className="absolute top-full right-0 z-50 mt-1 min-w-[10.5rem] rounded-xl border border-border bg-[#2c2c2e] py-2 shadow-xl">
          <div className="px-3 pb-1.5 text-[12px] font-semibold text-text">
            Sort By
          </div>
          <SortOption
            label="First Name"
            selected={sort === "first"}
            onSelect={() => {
              onChange("first");
              setOpen(false);
            }}
          />
          <SortOption
            label="Last Name"
            selected={sort === "last"}
            onSelect={() => {
              onChange("last");
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
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
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
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
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
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
