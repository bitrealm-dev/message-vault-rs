"use client";

import { tagSlug } from "@/lib/tagSlug";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

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

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M8 3.25v9.5M3.25 8h9.5" />
    </svg>
  );
}

function PersonIcon({ className }: { className?: string }) {
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

/** Clockwise cycle with check — Current. Flip horizontally for Historical. */
function CycleCheckIcon({
  className,
  flipped = false,
}: {
  className?: string;
  flipped?: boolean;
}) {
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
      style={flipped ? { transform: "scaleX(-1)" } : undefined}
    >
      <path d="M19.5 12a7.5 7.5 0 1 1-2.05-5.2" />
      <path d="M19.5 4.75v4.1h-4.1" />
      <path d="M8.75 12.25 11.1 14.6 15.4 9.75" />
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

function NavLink({
  href,
  label,
  active,
  indent = false,
  icon,
}: {
  href: string;
  label: string;
  active: boolean;
  indent?: boolean;
  icon?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`relative flex items-center gap-2 py-1.5 text-[13px] transition-colors ${
        indent ? "pl-4 pr-3" : "px-3"
      } ${active ? "bg-elevated text-text" : "text-muted hover:bg-white/20 hover:text-text"}`}
    >
      {active && (
        <span
          aria-hidden
          className="absolute top-1 bottom-1 left-0 w-[3px] rounded-full bg-[#c8c8c8]"
        />
      )}
      {icon}
      <span className="truncate">{label}</span>
    </Link>
  );
}

function GroupNamePopover({
  title,
  initial = "",
  onSave,
  onCancel,
  anchor = null,
  panelRef,
}: {
  title: string;
  initial?: string;
  onSave: (name: string) => void | Promise<void>;
  onCancel: () => void;
  /** When set, render fixed at cursor (upper-left of the box). */
  anchor?: { x: number; y: number } | null;
  panelRef?: RefObject<HTMLDivElement | null>;
}) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, []);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onSave(trimmed);
    } finally {
      setBusy(false);
    }
  };

  const floating = Boolean(anchor);
  const className = floating
    ? "fixed z-[100] w-56 rounded-xl border border-border bg-[#2c2c2e] p-3 shadow-[0_12px_40px_rgba(0,0,0,0.55),0_2px_8px_rgba(0,0,0,0.35)]"
    : "absolute top-full left-0 z-50 mt-1 w-56 rounded-xl border border-border bg-[#2c2c2e] p-3 shadow-xl";

  return (
    <div
      ref={panelRef}
      className={className}
      style={
        floating && anchor
          ? { left: anchor.x, top: anchor.y }
          : undefined
      }
    >
      <h3 className="text-[14px] font-semibold text-text">{title}</h3>
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        placeholder="Name"
        disabled={busy}
        className="mt-2.5 w-full rounded-md border border-accent bg-elevated px-2.5 py-1.5 text-[13px] text-text outline-none placeholder:text-muted"
      />
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={() => void submit()}
          className="rounded-md bg-accent px-3 py-1 text-[13px] font-medium text-[#1c1c1e] transition-opacity disabled:opacity-40"
        >
          Save
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="rounded-md bg-elevated px-3 py-1 text-[13px] text-text hover:bg-white/10"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function GroupsNav({ tags }: { tags: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [createOpen, setCreateOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [rename, setRename] = useState<{
    name: string;
    x: number;
    y: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const renamePanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!createOpen && !menuFor && !rename) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (createOpen && !headerRef.current?.contains(t)) setCreateOpen(false);
      if (menuFor && !menuRef.current?.contains(t)) setMenuFor(null);
      if (rename && !renamePanelRef.current?.contains(t)) setRename(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setCreateOpen(false);
      setMenuFor(null);
      setRename(null);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [createOpen, menuFor, rename]);

  const createGroup = async (name: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "create failed");
      setCreateOpen(false);
      router.refresh();
      router.push(`/tag/${tagSlug(data.name)}`);
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  const renameGroup = async (from: string, to: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/tags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "rename failed");
      setRename(null);
      setMenuFor(null);
      router.refresh();
      if (pathname === `/tag/${tagSlug(from)}`) {
        router.push(`/tag/${tagSlug(data.name)}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  const deleteGroup = async (name: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/tags", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "delete failed");
      setMenuFor(null);
      router.refresh();
      if (pathname === `/tag/${tagSlug(name)}`) {
        router.push("/current");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  const groupIcon = (
    <PeopleGroupIcon className="size-3.5 shrink-0 opacity-80" />
  );

  return (
    <div>
      <div className="relative mt-4" ref={headerRef}>
        <div className="flex items-center justify-between px-3 pb-1">
          <span className="text-[11px] font-semibold tracking-wider text-muted uppercase">
            Groups
          </span>
          <button
            type="button"
            aria-label="Create group"
            disabled={busy}
            onClick={() => {
              setMenuFor(null);
              setRename(null);
              setCreateOpen((v) => !v);
            }}
            className="rounded p-0.5 text-muted hover:bg-elevated hover:text-text disabled:opacity-40"
          >
            <PlusIcon className="size-3.5" />
          </button>
        </div>
        {createOpen && (
          <GroupNamePopover
            title="Create group"
            onSave={createGroup}
            onCancel={() => setCreateOpen(false)}
          />
        )}
      </div>

      {tags.length === 0 ? (
        <p className="px-3 py-1 text-[12px] text-muted">No groups</p>
      ) : (
        tags.map((name) => {
          const href = `/tag/${tagSlug(name)}`;
          const active = pathname === href;
          const menuOpen = menuFor === name;

          return (
            <div key={href} className="relative">
              <div
                className={`group relative flex items-center text-[13px] transition-colors ${
                  active
                    ? "bg-elevated text-text hover:bg-white/18"
                    : "text-muted hover:bg-white/20 hover:text-text"
                }`}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute top-1 bottom-1 left-0 w-[3px] rounded-full bg-[#c8c8c8]"
                  />
                )}
                <Link
                  href={href}
                  className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-1 pl-4"
                >
                  {groupIcon}
                  <span className="truncate">{name}</span>
                </Link>
                <button
                  type="button"
                  aria-label={`Group options for ${name}`}
                  aria-expanded={menuOpen}
                  disabled={busy}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCreateOpen(false);
                    setRename(null);
                    setMenuFor((v) => (v === name ? null : name));
                  }}
                  className={`mr-1.5 shrink-0 rounded p-0.5 text-muted hover:bg-white/10 hover:text-text ${
                    active || menuOpen
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100"
                  }`}
                >
                  <EllipsisIcon className="size-3.5" />
                </button>
              </div>

              {menuOpen && (
                <div
                  ref={menuRef}
                  className="absolute top-full right-1 z-50 mt-0.5 min-w-[120px] rounded-lg border border-border bg-[#2c2c2e] py-1 shadow-xl"
                >
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-[13px] text-text hover:bg-white/20"
                    onClick={(e) => {
                      setMenuFor(null);
                      setRename({
                        name,
                        x: e.clientX,
                        y: e.clientY,
                      });
                    }}
                  >
                    Rename…
                  </button>
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-[13px] text-text hover:bg-white/20"
                    onClick={() => void deleteGroup(name)}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}

      <NavLink
        href="/no-group"
        label="No group"
        active={pathname === "/no-group"}
        indent
        icon={<PersonIcon className="size-3.5 shrink-0 opacity-80" />}
      />

      {rename && (
        <GroupNamePopover
          title="Rename"
          initial={rename.name}
          anchor={{ x: rename.x, y: rename.y }}
          panelRef={renamePanelRef}
          onSave={(to) => renameGroup(rename.name, to)}
          onCancel={() => setRename(null)}
        />
      )}
    </div>
  );
}

export function AppSidebar({
  active,
  tags = [],
}: {
  active: string;
  tags?: string[];
}) {
  const groupIcon = (
    <PeopleGroupIcon className="size-3.5 shrink-0 opacity-80" />
  );

  return (
    <aside className="flex h-full w-[200px] shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="flex h-[45px] shrink-0 items-center border-b border-border px-3">
        <Link
          href="/"
          className="text-[14px] font-semibold tracking-tight text-text hover:text-accent"
        >
          Message Vault
        </Link>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto py-2">
        <NavLink href="/all" label="All contacts" active={active === "/all"} />
        <NavLink
          href="/current"
          label="Current"
          active={active === "/current"}
          icon={<CycleCheckIcon className="size-3.5 shrink-0 opacity-80" />}
        />
        <NavLink
          href="/historical"
          label="Historical"
          active={active === "/historical"}
          icon={
            <CycleCheckIcon
              className="size-3.5 shrink-0 opacity-80"
              flipped
            />
          }
        />

        <GroupsNav tags={tags} />

        <div className="mt-auto border-t border-border pt-2">
          <NavLink
            href="/groups"
            label="Group chats"
            active={active === "/groups"}
            icon={groupIcon}
          />
        </div>
      </nav>
    </aside>
  );
}
