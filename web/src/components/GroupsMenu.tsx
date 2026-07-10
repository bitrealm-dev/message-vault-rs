"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export function GroupsMenu({
  allGroups,
  selected,
  onChange,
  disabled = false,
}: {
  allGroups: string[];
  selected: string[];
  onChange?: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"list" | "create">("list");
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [localGroups, setLocalGroups] = useState<string[]>(allGroups);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  useEffect(() => {
    setLocalGroups((prev) => {
      const merged = new Set([...allGroups, ...prev]);
      return [...merged].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" }),
      );
    });
  }, [allGroups]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return localGroups;
    return localGroups.filter((g) => g.toLowerCase().includes(q));
  }, [localGroups, query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setMode("list");
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (mode === "create") {
          setMode("list");
          setNewName("");
        } else {
          setOpen(false);
        }
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    if (mode === "list") {
      setQuery("");
      requestAnimationFrame(() => searchRef.current?.focus());
    } else {
      setNewName("");
      requestAnimationFrame(() => nameRef.current?.focus());
    }
  }, [open, mode]);

  const toggle = (name: string) => {
    if (disabled || !onChange) return;
    const next = selectedSet.has(name)
      ? selected.filter((g) => g !== name)
      : [...selected, name].sort((a, b) =>
          a.localeCompare(b, undefined, { sensitivity: "base" }),
        );
    onChange(next);
  };

  const saveNewGroup = () => {
    if (disabled || !onChange) return;
    const name = newName.trim();
    if (!name) return;

    const existing = localGroups.find(
      (g) => g.toLowerCase() === name.toLowerCase(),
    );
    const resolved = existing ?? name;

    if (!existing) {
      setLocalGroups((prev) =>
        [...prev, resolved].sort((a, b) =>
          a.localeCompare(b, undefined, { sensitivity: "base" }),
        ),
      );
    }

    if (!selectedSet.has(resolved)) {
      onChange(
        [...selected, resolved].sort((a, b) =>
          a.localeCompare(b, undefined, { sensitivity: "base" }),
        ),
      );
    }

    setNewName("");
    setMode("list");
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          setMode("list");
        }}
        className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] transition-colors ${
          open
            ? "bg-accent/20 text-accent"
            : "bg-elevated text-muted hover:text-text"
        }`}
      >
        <PeopleGroupIcon className="size-3.5" />
        Groups
        {selected.length > 0 && (
          <span className="tabular-nums text-muted">({selected.length})</span>
        )}
        <ChevronIcon className="size-3 opacity-70" />
      </button>

      {open && mode === "list" && (
        <div className="absolute top-full left-0 z-50 mt-1 w-64 rounded-xl border border-border bg-[#2c2c2e] shadow-xl">
          <div className="border-b border-border/80 p-2">
            <div className="flex items-center gap-2 rounded-md border border-accent bg-elevated px-2 py-1.5">
              <SearchIcon className="size-3.5 shrink-0 text-muted" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search groups…"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-text outline-none placeholder:text-muted"
              />
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-[12px] text-muted">No groups</p>
            ) : (
              filtered.map((name) => {
                const checked = selectedSet.has(name);
                return (
                  <label
                    key={name}
                    className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-[13px] text-text hover:bg-white/5"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggle(name)}
                      className="size-3.5 rounded border-border accent-accent"
                    />
                    <span className="truncate">{name}</span>
                  </label>
                );
              })
            )}
          </div>

          <div className="border-t border-border/80 px-3 py-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => setMode("create")}
              className="text-[13px] text-accent hover:underline disabled:opacity-50"
            >
              + Create group
            </button>
          </div>
        </div>
      )}

      {open && mode === "create" && (
        <div className="absolute top-full left-0 z-50 mt-1 w-64 rounded-xl border border-border bg-[#2c2c2e] p-3 shadow-xl">
          <h3 className="text-[14px] font-semibold text-text">Create group</h3>
          <input
            ref={nameRef}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                saveNewGroup();
              }
            }}
            placeholder="Name"
            disabled={disabled}
            className="mt-2.5 w-full rounded-md border border-accent bg-elevated px-2.5 py-1.5 text-[13px] text-text outline-none placeholder:text-muted"
          />
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              disabled={disabled || !newName.trim()}
              onClick={saveNewGroup}
              className="rounded-md bg-accent px-3 py-1 text-[13px] font-medium text-[#1c1c1e] transition-opacity disabled:opacity-40"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("list");
                setNewName("");
              }}
              className="rounded-md bg-elevated px-3 py-1 text-[13px] text-text hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
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

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16.5 16.5 4 4" />
    </svg>
  );
}
