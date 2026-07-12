"use client";

import { AppShell } from "@/components/AppShell";
import { Suspense, type ReactNode } from "react";

/** Shared AppShell + Suspense scaffold for browse-style pages. */
export function BrowsePageLayout({
  active,
  groups,
  children,
}: {
  active: string;
  groups: string[];
  children: ReactNode;
}) {
  return (
    <AppShell active={active} groups={groups}>
      <div className="h-full min-h-0 min-w-0">
        <Suspense
          fallback={<div className="p-4 text-sm text-muted">Loading…</div>}
        >
          {children}
        </Suspense>
      </div>
    </AppShell>
  );
}
