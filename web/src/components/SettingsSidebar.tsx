"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navHeadingClass = "px-3 pb-1";
const navItemPad = "pl-6 pr-3";

function SettingsNavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      className={`relative block py-1 ${navItemPad} text-[14px] transition-colors ${
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

export function SettingsSidebar({ collapsed }: { collapsed: boolean }) {
  return (
    <aside className="flex h-full min-h-0 w-full flex-col bg-sidebar">
      {!collapsed && (
        <div className="flex h-[45px] shrink-0 items-center border-b border-border px-3">
          <span className="truncate text-[13px] font-medium text-text">
            Settings
          </span>
        </div>
      )}

      {!collapsed && (
        <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto py-2">
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
    </aside>
  );
}
