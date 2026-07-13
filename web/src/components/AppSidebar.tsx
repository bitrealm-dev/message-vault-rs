"use client";

import { groupSlug } from "@/lib/groupSlug";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import {
  AddressBookIcon,
  EllipsisIcon,
  EmptyChatIcon,
  PanelCollapseIcon,
  PanelExpandIcon,
  PeopleGroupIcon,
  PersonDetailIcon,
  PlusIcon,
  ProhibitedIcon,
  QuestionHandleIcon,
  TrashIcon,
} from "./icons";
import { useDismissible } from "./useDismissible";

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

function GroupsNav({ groups }: { groups: string[] }) {
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
  /** Names created this session before props catch up via refresh. */
  const [pendingGroups, setPendingGroups] = useState<string[]>([]);
  const headerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const createPanelRef = useRef<HTMLDivElement>(null);
  const renamePanelRef = useRef<HTMLDivElement>(null);
  const menuCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelCloseGroupMenu = useCallback(() => {
    if (menuCloseTimerRef.current) {
      clearTimeout(menuCloseTimerRef.current);
      menuCloseTimerRef.current = null;
    }
  }, []);

  const scheduleCloseGroupMenu = useCallback(() => {
    cancelCloseGroupMenu();
    menuCloseTimerRef.current = setTimeout(() => {
      menuCloseTimerRef.current = null;
      setMenuFor(null);
    }, 120);
  }, [cancelCloseGroupMenu]);

  useEffect(() => {
    return () => cancelCloseGroupMenu();
  }, [cancelCloseGroupMenu]);

  const displayGroups = useMemo(() => {
    const names = new Set([...groups, ...pendingGroups]);
    return [...names].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [groups, pendingGroups]);

  useEffect(() => {
    setPendingGroups((prev) => {
      if (prev.length === 0) return prev;
      const known = new Set(groups.map((g) => g.toLowerCase()));
      const next = prev.filter((n) => !known.has(n.toLowerCase()));
      return next.length === prev.length ? prev : next;
    });
  }, [groups]);

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
      const res = await fetch("/api/contact-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "create failed");
      setCreate(null);
      setPendingGroups((prev) =>
        prev.some((n) => n.toLowerCase() === data.name.toLowerCase())
          ? prev
          : [...prev, data.name],
      );
      router.refresh();
      router.push(`/group/${groupSlug(data.name)}`);
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  const renameGroup = async (from: string, to: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/contact-groups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "rename failed");
      setRename(null);
      setMenuFor(null);
      router.refresh();
      if (pathname === `/group/${groupSlug(from)}`) {
        router.push(`/group/${groupSlug(data.name)}`);
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
      const res = await fetch("/api/contact-groups", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "delete failed");
      setMenuFor(null);
      router.refresh();
      if (pathname === `/group/${groupSlug(name)}`) {
        router.push("/all");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  const groupIcon = (
    <PeopleGroupIcon className="size-5 shrink-0 opacity-80" />
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
            <PlusIcon className="size-5" />
          </button>
        </div>
      </div>

      {displayGroups.length === 0 ? (
        <p className="pl-10 pr-3 py-1 text-[13px] text-muted">No groups</p>
      ) : (
        displayGroups.map((name) => {
          const href = `/group/${groupSlug(name)}`;
          const active = pathname === href;
          const menuOpen = menuFor === name;

          return (
            <div
              key={href}
              className="relative"
              onMouseEnter={() => {
                if (menuFor === name) cancelCloseGroupMenu();
              }}
              onMouseLeave={() => {
                if (menuFor === name) scheduleCloseGroupMenu();
              }}
            >
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
                    cancelCloseGroupMenu();
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
                  <EllipsisIcon className="size-5" />
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
        icon={<PersonDetailIcon className="size-5 shrink-0 opacity-80" />}
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
/** Collapse nav when the viewport is narrower than this. */
const NAV_AUTO_COLLAPSE_BELOW = 900;

export function AppSidebar({
  active,
  groups = [],
  navPanelRef,
  onCollapsedChange,
}: {
  active: string;
  groups?: string[];
  /** When set, collapse/expand drives the parent resizable Panel. */
  navPanelRef?: RefObject<PanelImperativeHandle | null>;
  onCollapsedChange?: (collapsed: boolean) => void;
}) {
  const [userCollapsed, setUserCollapsed] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [forceExpand, setForceExpand] = useState(false);
  const wasNarrowRef = useRef(false);

  const collapsed = narrow ? !forceExpand : userCollapsed;

  useEffect(() => {
    onCollapsedChange?.(collapsed);
  }, [collapsed, onCollapsedChange]);

  useEffect(() => {
    if (!navPanelRef?.current) return;
    if (collapsed) navPanelRef.current.collapse();
    else navPanelRef.current.expand();
  }, [collapsed, navPanelRef]);

  useEffect(() => {
    setUserCollapsed(window.localStorage.getItem(NAV_COLLAPSED_KEY) === "1");

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

  const groupIcon = (
    <PeopleGroupIcon className="size-5 shrink-0 opacity-80" />
  );

  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-sidebar">
      <div className="flex h-[45px] shrink-0 items-center gap-1 border-b border-border px-2">
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Show navigation" : "Hide navigation"}
          title={collapsed ? "Show navigation" : "Hide navigation"}
          className="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-white/15 hover:text-text"
        >
          {collapsed ? (
            <PanelExpandIcon className="size-5" />
          ) : (
            <PanelCollapseIcon className="size-5" />
          )}
        </button>
        {!collapsed && (
          <Link
            href="/"
            className="truncate text-[13px] font-medium text-text transition-colors hover:text-accent"
          >
            Message Vault
          </Link>
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
            href="/contacts"
            label="Contacts"
            active={active === "/contacts"}
            icon={<AddressBookIcon className="size-5 shrink-0 opacity-80" />}
          />
          <NavLink
            href="/all"
            label="All"
            active={active === "/all"}
            icon={<PersonDetailIcon className="size-5 shrink-0 opacity-80" />}
          />
          <NavLink
            href="/no-messages"
            label="No Messages"
            active={active === "/no-messages"}
            icon={<EmptyChatIcon className="size-5 shrink-0 opacity-80" />}
          />
          <NavLink
            href="/excluded"
            label="Excluded"
            active={active === "/excluded"}
            icon={<ProhibitedIcon className="size-5 shrink-0 opacity-80" />}
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
            icon={<QuestionHandleIcon className="size-5 shrink-0 opacity-80" />}
          />
          <NavLink
            href="/group-chats"
            label="Group Chats"
            active={active === "/group-chats"}
            icon={groupIcon}
          />
          <NavLink
            href="/trash"
            label="Trash"
            active={active === "/trash"}
            icon={<TrashIcon className="size-5 shrink-0 opacity-80" />}
          />

          <GroupsNav groups={groups} />
        </nav>
      )}
    </aside>
  );
}
