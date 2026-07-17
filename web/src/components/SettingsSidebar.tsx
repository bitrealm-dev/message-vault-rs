"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { IconHoverTarget } from "./IconHoverLabel";
import { PanelCollapseIcon, PanelExpandIcon } from "./icons";
import { useVaultTitleActions } from "./useVaultTitleActions";
import { VaultTitleMenu } from "./VaultTitleMenu";

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
  const {
    demoResetAvailable,
    resettingDemo,
    resetError,
    logout,
    resetDemo,
    confirmDialog,
  } = useVaultTitleActions();

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
            <button
              type="button"
              aria-label="Back"
              onClick={() => router.push("/")}
              className="ml-auto shrink-0 rounded-md px-2 py-1 text-[13px] text-muted transition-colors hover:bg-white/15 hover:text-text"
            >
              Back
            </button>
          </>
        )}
      </div>

      <div className="h-[45px] shrink-0 border-b border-border" aria-hidden />

      {!collapsed && resetError && (
        <p className="px-3 py-2 text-[12px] text-red-400" role="alert">
          {resetError}
        </p>
      )}

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
        </nav>
      )}
      {confirmDialog}
    </aside>
  );
}
