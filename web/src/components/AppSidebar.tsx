"use client";

import { labelSlug } from "@/lib/labelSlug";
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
import { createPortal } from "react-dom";
import {
  AddressBookIcon,
  EllipsisIcon,
  GroupMessagesOutlineIcon,
  PanelCollapseIcon,
  PanelExpandIcon,
  PeopleGroupIcon,
  PersonDetailIcon,
  PlusIcon,
  ProhibitedIcon,
  TrashIcon,
} from "./icons";
import { IconHoverTarget } from "./IconHoverLabel";
import { useHistory } from "./history";
import { useConfirmDialog } from "./useConfirmDialog";
import { useDismissible } from "./useDismissible";
import { VaultTitleMenu } from "./VaultTitleMenu";

const navHeadingClass = "px-3 pb-1";
const navItemPl = "pl-6";
const navItemPad = `${navItemPl} pr-3`;

function NavLink({
  href,
  label,
  active,
  icon,
  compact = false,
}: {
  href: string;
  label: string;
  active: boolean;
  icon?: ReactNode;
  /** Icon-only rail mode: keep the same box, hide the label. */
  compact?: boolean;
}) {
  return (
    <IconHoverTarget
      label={label}
      placement="right"
      hidden={!compact}
      className="block w-full"
    >
      <Link
        href={href}
        aria-label={compact ? label : undefined}
        className={`relative flex h-8 items-center gap-2 ${navItemPad} text-[14px] transition-colors ${
          active
            ? "bg-accent/35 text-text hover:bg-accent/40"
            : "text-muted hover:bg-white/20 hover:text-text"
        }`}
      >
        {active && (
          <span
            aria-hidden
            className="absolute top-0.5 bottom-0.5 left-0 w-1 rounded-full bg-accent"
          />
        )}
        {icon}
        <span className={compact ? "sr-only" : "truncate"}>{label}</span>
      </Link>
    </IconHoverTarget>
  );
}

function LabelNamePopover({
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

function LabelsNav({
  labels,
  compact = false,
  hideItems = false,
  onExpandLabels,
}: {
  labels: string[];
  compact?: boolean;
  /** Hide group rows while the drawer is animating/collapsed so they don’t flash in the rail. */
  hideItems?: boolean;
  onExpandLabels?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { push: pushHistory } = useHistory();
  const [create, setCreate] = useState<{ x: number; y: number } | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(
    null,
  );
  const [rename, setRename] = useState<{
    name: string;
    x: number;
    y: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  /** Names created this session before props catch up via refresh. */
  const [pendingLabels, setPendingLabels] = useState<string[]>([]);
  const headerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const openRowRef = useRef<HTMLDivElement>(null);
  const createPanelRef = useRef<HTMLDivElement>(null);
  const renamePanelRef = useRef<HTMLDivElement>(null);

  const displayLabels = useMemo(() => {
    const names = new Set([...labels, ...pendingLabels]);
    return [...names].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [labels, pendingLabels]);

  useEffect(() => {
    setPendingLabels((prev) => {
      if (prev.length === 0) return prev;
      const known = new Set(labels.map((g) => g.toLowerCase()));
      const next = prev.filter((n) => !known.has(n.toLowerCase()));
      return next.length === prev.length ? prev : next;
    });
  }, [labels]);

  useDismissible({
    open: create != null,
    onDismiss: () => setCreate(null),
    refs: [createPanelRef, headerRef],
  });
  useDismissible({
    open: menuFor != null,
    onDismiss: () => setMenuFor(null),
    // Click-opened menu: close on outside click / Escape only (not pointer leave).
    refs: [menuRef, openRowRef],
  });
  useDismissible({
    open: rename != null,
    onDismiss: () => setRename(null),
    refs: [renamePanelRef],
  });

  const createLabel = async (name: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/contact-labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "create failed");
      setCreate(null);
      setPendingLabels((prev) =>
        prev.some((n) => n.toLowerCase() === data.name.toLowerCase())
          ? prev
          : [...prev, data.name],
      );
      pushHistory({
        type: "createLabel",
        name: data.name,
        label: `Create label ${data.name}`,
      });
      router.refresh();
      router.push(`/label/${labelSlug(data.name)}`);
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  const renameLabel = async (from: string, to: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/contact-labels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "rename failed");
      setRename(null);
      setMenuFor(null);
      router.refresh();
      if (pathname === `/label/${labelSlug(from)}`) {
        router.push(`/label/${labelSlug(data.name)}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  const deleteLabel = async (name: string) => {
    setBusy(true);
    try {
      const membersRes = await fetch(
        `/api/contact-labels/members?name=${encodeURIComponent(name)}`,
      );
      const membersData = await membersRes.json();
      if (!membersRes.ok) {
        throw new Error(membersData.error ?? "lookup failed");
      }
      const memberContactIds: number[] = Array.isArray(
        membersData.memberContactIds,
      )
        ? membersData.memberContactIds
        : [];

      const res = await fetch("/api/contact-labels", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "delete failed");
      pushHistory({
        type: "deleteLabel",
        name,
        memberContactIds,
        label: `Delete label ${name}`,
      });
      setMenuFor(null);
      router.refresh();
      if (pathname === `/label/${labelSlug(name)}`) {
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

  const pathnameLabelActive = pathname.startsWith("/label/");

  return (
    <div id="nav-labels">
      <div className="relative mt-3" ref={headerRef}>
        {compact ? (
          <IconHoverTarget label="Labels" placement="right" className="block w-full">
            <button
              type="button"
              aria-label="Labels"
              onClick={onExpandLabels}
              className={`relative flex h-8 w-full items-center gap-2 ${navItemPad} text-[14px] transition-colors ${
                pathnameLabelActive
                  ? "bg-accent/35 text-text"
                  : "text-muted hover:bg-white/20 hover:text-text"
              }`}
            >
              {pathnameLabelActive && (
                <span
                  aria-hidden
                  className="absolute top-0.5 bottom-0.5 left-0 w-1 rounded-full bg-accent"
                />
              )}
              {groupIcon}
            </button>
          </IconHoverTarget>
        ) : (
          <div
            className={`flex h-8 items-center justify-between ${navHeadingClass}`}
          >
            <span className="text-[12px] font-semibold tracking-wider text-muted uppercase">
              Labels
            </span>
            <button
              type="button"
              aria-label="Create label"
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
              <PlusIcon className="size-4" />
            </button>
          </div>
        )}
      </div>

      {!hideItems &&
        displayLabels.length > 0 &&
        displayLabels.map((name) => {
          const href = `/label/${labelSlug(name)}`;
          const active = pathname === href;
          const menuOpen = menuFor === name;

          return (
            <div
              key={name}
              ref={menuOpen ? openRowRef : undefined}
              className="relative"
            >
              <div
                className={`group relative flex items-center text-[14px] transition-colors ${
                  active
                    ? "bg-accent/35 text-text hover:bg-accent/40"
                    : "text-muted hover:bg-white/20 hover:text-text"
                }`}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute top-0.5 bottom-0.5 left-0 w-1 rounded-full bg-accent"
                  />
                )}
                <Link
                  href={href}
                  className={`flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-1 ${navItemPl}`}
                >
                  {groupIcon}
                  <span className="truncate">{name}</span>
                </Link>
                <button
                  type="button"
                  aria-label={`Label options for ${name}`}
                  aria-expanded={menuOpen}
                  disabled={busy}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCreate(null);
                    setRename(null);
                    if (menuFor === name) {
                      setMenuFor(null);
                      return;
                    }
                    const rect = e.currentTarget.getBoundingClientRect();
                    setMenuPos({
                      top: rect.bottom + 4,
                      right: window.innerWidth - rect.right,
                    });
                    setMenuFor(name);
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

              {menuOpen &&
                menuPos &&
                createPortal(
                  <div
                    ref={menuRef}
                    className="fixed z-[100] min-w-[120px] rounded-lg border border-border bg-[#2c2c2e] py-1 shadow-xl"
                    style={{ top: menuPos.top, right: menuPos.right }}
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
                      onClick={() => void deleteLabel(name)}
                    >
                      Delete
                    </button>
                  </div>,
                  document.body,
                )}
            </div>
          );
        })}

      {!hideItems && (
        <NavLink
          href="/no-label"
          label="No label"
          active={pathname === "/no-label"}
          icon={<PersonDetailIcon className="size-5 shrink-0 opacity-80" />}
        />
      )}

      {!hideItems && create && (
        <LabelNamePopover
          title="Create label"
          anchor={{ x: create.x, y: create.y }}
          panelRef={createPanelRef}
          onSave={createLabel}
          onCancel={() => setCreate(null)}
        />
      )}

      {rename && (
        <LabelNamePopover
          title="Rename"
          initial={rename.name}
          anchor={{ x: rename.x, y: rename.y }}
          panelRef={renamePanelRef}
          onSave={(to) => renameLabel(rename.name, to)}
          onCancel={() => setRename(null)}
        />
      )}
    </div>
  );
}

export function AppSidebar({
  active,
  labels = [],
  collapsed,
  animating = false,
  onHideNav,
  onShowNav,
  onExpandLabels,
  focusLabelsToken = 0,
}: {
  active: string;
  labels?: string[];
  collapsed: boolean;
  /** True while the drawer width is animating. */
  animating?: boolean;
  onHideNav?: () => void;
  onShowNav?: () => void;
  onExpandLabels?: () => void;
  /** Increment to scroll the Labels section into view after expand. */
  focusLabelsToken?: number;
}) {
  const [demoResetAvailable, setDemoResetAvailable] = useState(false);
  const [resettingDemo, setResettingDemo] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/demo/reset")
      .then((r) => r.json())
      .then((data: { available?: boolean }) => {
        if (!cancelled) setDemoResetAvailable(data.available === true);
      })
      .catch(() => {
        if (!cancelled) setDemoResetAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (collapsed || focusLabelsToken === 0) return;
    const el = document.getElementById("nav-labels");
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }, [collapsed, focusLabelsToken]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }, [router]);

  const resetDemo = useCallback(async () => {
    const ok = await confirm(
      "Restore all messages, contacts, labels, and trash to the committed demo dataset. Your edits will be lost.",
      "Reset demo",
    );
    if (!ok) return;

    setResettingDemo(true);
    setResetError(null);
    try {
      const res = await fetch("/api/demo/reset", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Reset failed");
      }
      await logout();
    } catch (e) {
      setResetError(e instanceof Error ? e.message : "Reset failed");
      setResettingDemo(false);
    }
  }, [confirm, logout]);

  const groupMessagesIcon = (
    <GroupMessagesOutlineIcon className="size-5 shrink-0 opacity-80" />
  );

  return (
    <aside className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-sidebar">
      <div className="flex h-[45px] shrink-0 items-center gap-1 border-b border-border px-3">
        {collapsed ? (
          <IconHoverTarget label="Show navigation" placement="right">
            <button
              type="button"
              aria-label="Show navigation"
              onClick={onShowNav}
              className="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-white/15 hover:text-text"
            >
              <PanelExpandIcon className="size-5" />
            </button>
          </IconHoverTarget>
        ) : (
          <>
            {onHideNav && (
              <IconHoverTarget label="Hide navigation" placement="bottom">
                <button
                  type="button"
                  aria-label="Hide navigation"
                  onClick={onHideNav}
                  className="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-white/15 hover:text-text"
                >
                  <PanelCollapseIcon className="size-5" />
                </button>
              </IconHoverTarget>
            )}
            <VaultTitleMenu
              demoResetAvailable={demoResetAvailable}
              resettingDemo={resettingDemo}
              onResetDemo={() => void resetDemo()}
              onLogout={() => void logout()}
            />
          </>
        )}
      </div>

      {/* Aligns nav with contact-list body (search + toolbar are both 45px). */}
      <div className="h-[45px] shrink-0 border-b border-border" aria-hidden />

      {!collapsed && resetError && (
        <p className="shrink-0 px-3 py-1.5 text-[11px] text-red-400" role="alert">
          {resetError}
        </p>
      )}

      <nav className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto pb-2">
        {!collapsed && (
          <div className={`flex h-8 items-center ${navHeadingClass}`}>
            <span className="text-[12px] font-semibold tracking-wider text-muted uppercase">
              View
            </span>
          </div>
        )}
        <NavLink
          href="/all"
          label="All"
          active={active === "/all"}
          compact={collapsed}
          icon={<PersonDetailIcon className="size-5 shrink-0 opacity-80" />}
        />
        <NavLink
          href="/contacts"
          label="Active"
          active={active === "/contacts"}
          compact={collapsed}
          icon={<AddressBookIcon className="size-5 shrink-0 opacity-80" />}
        />
        <NavLink
          href="/excluded"
          label="Inactive"
          active={active === "/excluded"}
          compact={collapsed}
          icon={<ProhibitedIcon className="size-5 shrink-0 opacity-80" />}
        />
        <NavLink
          href="/group-messages"
          label="Group Messages"
          active={active === "/group-messages"}
          compact={collapsed}
          icon={groupMessagesIcon}
        />

        <div className="mt-3" aria-hidden />

        <NavLink
          href="/trash"
          label="Trash"
          active={active === "/trash"}
          compact={collapsed}
          icon={<TrashIcon className="size-5 shrink-0 opacity-80" />}
        />

        <LabelsNav
          labels={labels}
          compact={collapsed}
          hideItems={collapsed || animating}
          onExpandLabels={onExpandLabels}
        />
      </nav>
      {confirmDialog}
    </aside>
  );
}
