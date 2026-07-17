"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { IconHoverTarget } from "./IconHoverLabel";
import { PanelCollapseIcon, PanelExpandIcon } from "./icons";

const navHeadingClass = "px-3 pb-1";
const navItemPad = "pl-6 pr-3";

function SettingsNavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      className={`relative block py-1.5 ${navItemPad} text-[14px] transition-colors ${
        active
          ? "bg-elevated text-text"
          : "text-muted hover:bg-white/20 hover:text-text"
      }`}
    >
      {active && (
        <span
          aria-hidden
          className="absolute top-1 bottom-1 left-0 w-[3px] rounded-full bg-[#c8c8c8]"
        />
      )}
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function SettingsSidebar({
  collapsed,
  onHideNav,
  onShowNav,
}: {
  collapsed: boolean;
  onHideNav?: () => void;
  onShowNav?: () => void;
}) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <aside className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-sidebar">
      <div className="flex h-[45px] shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        {collapsed ? (
          <IconHoverTarget label="Show navigation" placement="right">
            <button
              type="button"
              aria-label="Show navigation"
              onClick={onShowNav}
              className="rounded-md p-1.5 text-muted transition-colors hover:bg-white/15 hover:text-text"
            >
              <PanelExpandIcon className="size-5" />
            </button>
          </IconHoverTarget>
        ) : (
          <>
            <span className="truncate text-[13px] font-medium text-text">
              Settings
            </span>
            {onHideNav && (
              <IconHoverTarget label="Hide navigation" placement="bottom">
                <button
                  type="button"
                  aria-label="Hide navigation"
                  onClick={onHideNav}
                  className="rounded-md p-1.5 text-muted transition-colors hover:bg-white/15 hover:text-text"
                >
                  <PanelCollapseIcon className="size-5" />
                </button>
              </IconHoverTarget>
            )}
          </>
        )}
      </div>

      <div className="h-[45px] shrink-0 border-b border-border" aria-hidden />

      {!collapsed && (
        <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-2">
          <div className={`mt-3 ${navHeadingClass}`}>
            <span className="text-[12px] font-semibold tracking-wider text-muted uppercase">
              Admin
            </span>
          </div>
          <SettingsNavLink href="/settings/account" label="Web Account" />

          <div className={`mt-3 ${navHeadingClass}`}>
            <span className="text-[12px] font-semibold tracking-wider text-muted uppercase">
              Preferences
            </span>
          </div>
          <SettingsNavLink href="/settings/display" label="Display options" />

          <div className="mt-auto px-3 pt-4 pb-2">
            <button
              type="button"
              onClick={() => void signOut()}
              disabled={signingOut}
              className="w-full rounded-md border border-border px-3 py-2 text-left text-[14px] text-muted transition-colors hover:bg-white/20 hover:text-text disabled:opacity-50"
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </nav>
      )}
    </aside>
  );
}
