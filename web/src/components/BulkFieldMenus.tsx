"use client";

import { useEffect, useRef, useState } from "react";
import type { GroupCheckState } from "./GroupsMenu";

function useMenuOpen(onOpenChange?: (open: boolean) => void) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  const closeMenu = () => {
    setOpen(false);
    onOpenChangeRef.current?.(false);
  };

  const openMenu = () => {
    setOpen(true);
    onOpenChangeRef.current?.(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return { open, rootRef, closeMenu, openMenu };
}

function TriCheck({
  state,
  disabled,
  onToggle,
}: {
  state: GroupCheckState;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "mixed";
  }, [state]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={state === "on"}
      disabled={disabled}
      onChange={onToggle}
      className="size-3.5 rounded border-border accent-accent"
    />
  );
}

export function HiddenMenu({
  state,
  onToggle,
  onOpenChange,
  disabled = false,
}: {
  state: GroupCheckState;
  onToggle?: () => void;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
}) {
  const { open, rootRef, closeMenu, openMenu } = useMenuOpen(onOpenChange);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          if (open) closeMenu();
          else openMenu();
        }}
        className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] transition-colors disabled:opacity-50 ${
          open
            ? "bg-accent/20 text-accent"
            : "bg-elevated text-muted hover:text-text"
        }`}
      >
        <EyeOffIcon className="size-3.5" />
        Hidden
        <ChevronIcon className="size-3 opacity-70" />
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-52 rounded-xl border border-border bg-[#2c2c2e] py-1 shadow-xl">
          <label className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-[13px] text-text hover:bg-white/20">
            <TriCheck
              state={state}
              disabled={disabled}
              onToggle={() => onToggle?.()}
            />
            <span>Hidden</span>
          </label>
        </div>
      )}
    </div>
  );
}

export function StatusMenu({
  currentState,
  historicalState,
  onSelect,
  onOpenChange,
  disabled = false,
}: {
  currentState: GroupCheckState;
  historicalState: GroupCheckState;
  onSelect?: (status: "current" | "historical") => void;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
}) {
  const { open, rootRef, closeMenu, openMenu } = useMenuOpen(onOpenChange);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          if (open) closeMenu();
          else openMenu();
        }}
        className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] transition-colors disabled:opacity-50 ${
          open
            ? "bg-accent/20 text-accent"
            : "bg-elevated text-muted hover:text-text"
        }`}
      >
        <StatusBadgeIcon className="size-3.5" />
        Status
        <ChevronIcon className="size-3 opacity-70" />
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-52 rounded-xl border border-border bg-[#2c2c2e] py-1 shadow-xl">
          <label className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-[13px] text-text hover:bg-white/20">
            <TriCheck
              state={currentState}
              disabled={disabled}
              onToggle={() => onSelect?.("current")}
            />
            <span>Current</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-[13px] text-text hover:bg-white/20">
            <TriCheck
              state={historicalState}
              disabled={disabled}
              onToggle={() => onSelect?.("historical")}
            />
            <span>Historical</span>
          </label>
        </div>
      )}
    </div>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <path d="M3 4.5 6 7.5 9 4.5" />
    </svg>
  );
}

function EyeOffIcon({ className }: { className?: string }) {
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
      <path d="M3 3l18 18" />
      <path d="M10.6 10.7a2 2 0 0 0 2.8 2.8" />
      <path d="M9.9 5.1A9.8 9.8 0 0 1 12 5c5 0 8.5 4.5 9.5 6-.4.6-1.1 1.6-2.2 2.7" />
      <path d="M6.1 6.1C4.5 7.4 3.4 9 2.5 11c1 1.5 4.5 6 9.5 6 1.2 0 2.3-.2 3.3-.6" />
    </svg>
  );
}

function StatusBadgeIcon({ className }: { className?: string }) {
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
      <path d="M12 8v4.5l3 1.75" />
    </svg>
  );
}
