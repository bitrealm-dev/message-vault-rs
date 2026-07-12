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
import {
  EllipsisIcon,
  PeopleGroupIcon,
} from "./icons";
import { useDismissible } from "./useDismissible";

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

function AddressBookIcon({ className }: { className?: string }) {
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
      <path d="M6.5 3.5h11A1.5 1.5 0 0 1 19 5v14a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5Z" />
      <path d="M5 7.5h2M5 12h2M5 16.5h2" />
      <circle cx="13" cy="10" r="2.25" />
      <path d="M9.75 16.25c.55-1.85 1.95-2.75 3.25-2.75s2.7.9 3.25 2.75" />
    </svg>
  );
}

function ProhibitedIcon({ className }: { className?: string }) {
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
      <path d="M6.2 6.2 17.8 17.8" />
    </svg>
  );
}

function EmptyChatIcon({ className }: { className?: string }) {
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
      <path d="M5.5 18.5 4 21l3.2-1.2A8.5 8.5 0 1 0 5.5 18.5Z" />
      <path d="M9 11h6M9 14h3.5" opacity="0.45" />
    </svg>
  );
}

function QuestionHandleIcon({ className }: { className?: string }) {
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
      <path d="M9.6 9.4a2.4 2.4 0 1 1 3.5 2.1c-.7.4-1.1.9-1.1 1.7" />
      <path d="M12 16.2h.01" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
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
      <path d="M4.5 7.5h15" />
      <path d="M9.5 7.5V5.75A1.25 1.25 0 0 1 10.75 4.5h2.5A1.25 1.25 0 0 1 14.5 5.75V7.5" />
      <path d="M6.75 7.5l.75 11.25A1.5 1.5 0 0 0 9 20h6a1.5 1.5 0 0 0 1.5-1.25L17.25 7.5" />
      <path d="M10 11v5.5M14 11v5.5" />
    </svg>
  );
}

function PanelCollapseIcon({ className }: { className?: string }) {
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
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M9.5 4.5v15" />
      <path d="M14.25 9.75 11.75 12l2.5 2.25" />
    </svg>
  );
}

function PanelExpandIcon({ className }: { className?: string }) {
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
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M9.5 4.5v15" />
      <path d="M11.75 9.75 14.25 12l-2.5 2.25" />
    </svg>
  );
}

function NavLink({
  href,
  label,
  active,
  icon,
}: {
  href: string;
  label: string;
  active: boolean;
  icon?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`relative flex items-center gap-2 py-1 pl-10 pr-3 text-[14px] transition-colors ${
        active ? "bg-elevated text-text" : "text-muted hover:bg-white/20 hover:text-text"
      }`}
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
  const [create, setCreate] = useState<{ x: number; y: number } | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [rename, setRename] = useState<{
    name: string;
    x: number;
    y: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const createPanelRef = useRef<HTMLDivElement>(null);
  const renamePanelRef = useRef<HTMLDivElement>(null);

  useDismissible({
    open: create != null,
    onDismiss: () => setCreate(null),
    refs: [createPanelRef, headerRef],
  });
  useDismissible({
    open: menuFor != null,
    onDismiss: () => setMenuFor(null),
    refs: [menuRef],
  });
  useDismissible({
    open: rename != null,
    onDismiss: () => setRename(null),
    refs: [renamePanelRef],
  });

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
      setCreate(null);
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
        router.push("/all");
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
      <div className="relative mt-3" ref={headerRef}>
        <div className="flex items-center justify-between pl-10 pr-1.5 pb-1">
          <span className="text-[12px] font-semibold tracking-wider text-muted uppercase">
            Groups
          </span>
          <button
            type="button"
            aria-label="Create group"
            disabled={busy}
            onClick={(e) => {
              setMenuFor(null);
              setRename(null);
              setCreate((v) =>
                v ? null : { x: e.clientX, y: e.clientY },
              );
            }}
            className="rounded p-0.5 text-muted hover:bg-elevated hover:text-text disabled:opacity-40"
          >
            <PlusIcon className="size-3.5" />
          </button>
        </div>
      </div>

      {tags.length === 0 ? (
        <p className="pl-10 pr-3 py-1 text-[13px] text-muted">No groups</p>
      ) : (
        tags.map((name) => {
          const href = `/tag/${tagSlug(name)}`;
          const active = pathname === href;
          const menuOpen = menuFor === name;

          return (
            <div key={href} className="relative">
              <div
                className={`group relative flex items-center text-[14px] transition-colors ${
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
                  className="flex min-w-0 flex-1 items-center gap-2 py-1 pr-1 pl-10"
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
                    setCreate(null);
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
        icon={<PersonIcon className="size-3.5 shrink-0 opacity-80" />}
      />

      {create && (
        <GroupNamePopover
          title="Create group"
          anchor={{ x: create.x, y: create.y }}
          panelRef={createPanelRef}
          onSave={createGroup}
          onCancel={() => setCreate(null)}
        />
      )}

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

const NAV_COLLAPSED_KEY = "message-vault:navCollapsed";
const NAV_WIDTH_KEY = "message-vault:navWidth";
const NAV_WIDTH_DEFAULT = 200;
const NAV_WIDTH_MIN = 160;
const NAV_WIDTH_MAX = 360;
/** Collapse nav when the viewport is narrower than this. */
const NAV_AUTO_COLLAPSE_BELOW = 900;

/** Last client-known nav width so remounts don't snap to the default. */
let cachedNavWidth: number | null = null;

function clampNavWidth(w: number): number {
  return Math.min(NAV_WIDTH_MAX, Math.max(NAV_WIDTH_MIN, w));
}

function readStoredNavWidth(): number {
  if (typeof window === "undefined") return NAV_WIDTH_DEFAULT;
  const raw = window.localStorage.getItem(NAV_WIDTH_KEY);
  if (!raw) return NAV_WIDTH_DEFAULT;
  const n = Number(raw);
  return Number.isFinite(n) ? clampNavWidth(n) : NAV_WIDTH_DEFAULT;
}

function initialNavWidth(): number {
  return cachedNavWidth ?? NAV_WIDTH_DEFAULT;
}

export function AppSidebar({
  active,
  tags = [],
}: {
  active: string;
  tags?: string[];
}) {
  const [userCollapsed, setUserCollapsed] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [forceExpand, setForceExpand] = useState(false);
  // Cache after first client read; SSR/first paint use default for hydration match.
  const [navWidth, setNavWidth] = useState(initialNavWidth);
  const navWidthRef = useRef(initialNavWidth());
  const wasNarrowRef = useRef(false);
  const dragging = useRef(false);

  const collapsed = narrow ? !forceExpand : userCollapsed;

  useEffect(() => {
    setUserCollapsed(window.localStorage.getItem(NAV_COLLAPSED_KEY) === "1");
    const w = readStoredNavWidth();
    cachedNavWidth = w;
    navWidthRef.current = w;
    setNavWidth((prev) => (prev === w ? prev : w));

    const syncNarrow = () => {
      const next = window.innerWidth < NAV_AUTO_COLLAPSE_BELOW;
      if (next && !wasNarrowRef.current) setForceExpand(false);
      wasNarrowRef.current = next;
      setNarrow(next);
    };
    syncNarrow();
    window.addEventListener("resize", syncNarrow);
    return () => window.removeEventListener("resize", syncNarrow);
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const next = clampNavWidth(e.clientX);
      navWidthRef.current = next;
      cachedNavWidth = next;
      setNavWidth(next);
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      cachedNavWidth = navWidthRef.current;
      window.localStorage.setItem(NAV_WIDTH_KEY, String(navWidthRef.current));
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const toggleCollapsed = () => {
    if (narrow) {
      setForceExpand((prev) => !prev);
      return;
    }
    setUserCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(NAV_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  };

  const startResize = () => {
    if (collapsed) return;
    dragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const groupIcon = (
    <PeopleGroupIcon className="size-3.5 shrink-0 opacity-80" />
  );

  return (
    <aside
      className="relative flex h-full shrink-0 flex-col border-r border-border bg-sidebar"
      style={{ width: collapsed ? 40 : navWidth }}
    >
      <div className="flex h-[45px] shrink-0 items-center gap-1 border-b border-border px-2">
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Show navigation" : "Hide navigation"}
          title={collapsed ? "Show navigation" : "Hide navigation"}
          className="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-white/15 hover:text-text"
        >
          {collapsed ? (
            <PanelExpandIcon className="size-4" />
          ) : (
            <PanelCollapseIcon className="size-4" />
          )}
        </button>
        {!collapsed && (
          <span className="truncate text-[13px] font-medium text-text">
            Message Vault
          </span>
        )}
      </div>

      {!collapsed && (
        <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto py-2">
          <div className="pl-10 pr-1.5 pb-1">
            <span className="text-[12px] font-semibold tracking-wider text-muted uppercase">
              Contacts
            </span>
          </div>
          <NavLink
            href="/all"
            label="All"
            active={active === "/all"}
            icon={<AddressBookIcon className="size-3.5 shrink-0 opacity-80" />}
          />
          <NavLink
            href="/no-messages"
            label="No Messages"
            active={active === "/no-messages"}
            icon={<EmptyChatIcon className="size-3.5 shrink-0 opacity-80" />}
          />
          <NavLink
            href="/excluded"
            label="Excluded"
            active={active === "/excluded"}
            icon={<ProhibitedIcon className="size-3.5 shrink-0 opacity-80" />}
          />

          <div className="mt-3 pl-10 pr-1.5 pb-1">
            <span className="text-[12px] font-semibold tracking-wider text-muted uppercase">
              Messages
            </span>
          </div>
          <NavLink
            href="/unassigned"
            label="Unassigned"
            active={active === "/unassigned"}
            icon={<QuestionHandleIcon className="size-3.5 shrink-0 opacity-80" />}
          />
          <NavLink
            href="/groups"
            label="Group Chats"
            active={active === "/groups"}
            icon={groupIcon}
          />
          <NavLink
            href="/unassigned/trash"
            label="Trash"
            active={active === "/unassigned/trash"}
            icon={<TrashIcon className="size-3.5 shrink-0 opacity-80" />}
          />

          <GroupsNav tags={tags} />
        </nav>
      )}
      {!collapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize navigation"
          onMouseDown={startResize}
          className="absolute top-0 right-0 z-10 h-full w-1 cursor-col-resize bg-transparent hover:bg-accent/60"
        />
      )}
    </aside>
  );
}
