"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { IconHoverTarget } from "./IconHoverLabel";
import {
  GearIcon,
  PanelCollapseIcon,
  PanelExpandIcon,
  VaultIcon,
} from "./icons";

function RailIconLink({
  href,
  label,
  active,
  icon: Icon,
  iconClassName,
}: {
  href: string;
  label: string;
  active?: boolean;
  icon: ComponentType<{ className?: string }>;
  iconClassName: string;
}) {
  return (
    <IconHoverTarget label={label} placement="right">
      <Link
        href={href}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        className={`block rounded-md p-1 transition-colors ${
          active
            ? "bg-elevated text-text"
            : "text-muted hover:bg-white/15 hover:text-text"
        }`}
      >
        <Icon className={iconClassName} />
      </Link>
    </IconHoverTarget>
  );
}

/** Fixed 56px left rail for nav toggle and vertical app shortcuts. */
export function NavRail({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const vaultActive =
    pathname !== "/" && !pathname.startsWith("/settings");
  const settingsActive = pathname.startsWith("/settings");
  const drawerLabel = collapsed ? "Show navigation" : "Hide navigation";

  return (
    <aside className="flex h-full w-14 shrink-0 flex-col items-center overflow-visible border-r border-border bg-sidebar">
      <div className="flex h-[45px] shrink-0 items-center justify-center overflow-visible border-b border-border">
        <IconHoverTarget label={drawerLabel} placement="right">
          <button
            type="button"
            onClick={onToggle}
            aria-label={drawerLabel}
            className="rounded-md p-2 text-muted transition-colors hover:bg-white/15 hover:text-text"
          >
            {collapsed ? (
              <PanelExpandIcon className="size-5" />
            ) : (
              <PanelCollapseIcon className="size-5" />
            )}
          </button>
        </IconHoverTarget>
      </div>
      <div className="flex flex-col items-center gap-3 overflow-visible py-3">
        <RailIconLink
          href="/contacts"
          label="Vault"
          active={vaultActive}
          icon={VaultIcon}
          iconClassName="size-10"
        />
        <RailIconLink
          href="/settings"
          label="Settings"
          active={settingsActive}
          icon={GearIcon}
          iconClassName="size-7"
        />
      </div>
    </aside>
  );
}
