import { AppSidebar } from "@/components/AppSidebar";
import { Suspense, type ReactNode } from "react";

/** Shared AppSidebar + Suspense scaffold for browse-style pages. */
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
    <div className="flex h-full min-h-0">
      <AppSidebar active={active} groups={groups} />
      <div className="min-h-0 min-w-0 flex-1">
        <Suspense
          fallback={<div className="p-4 text-sm text-muted">Loading…</div>}
        >
          {children}
        </Suspense>
      </div>
    </div>
  );
}
