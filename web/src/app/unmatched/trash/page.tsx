import { AppSidebar } from "@/components/AppSidebar";
import { TrashShell } from "@/components/TrashShell";
import {
  listContactsForPicker,
  listTags,
  listTrashedGroupYearRows,
  listTrashedHandles,
} from "@/lib/db";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default async function UnmatchedTrashPage({
  searchParams,
}: {
  searchParams: Promise<{ h?: string; g?: string; y?: string; tab?: string }>;
}) {
  const sp = await searchParams;
  const initialHandle = sp.h?.trim() || null;
  const rawG = sp.g ? Number(sp.g) : null;
  const initialGroupId = Number.isFinite(rawG) ? rawG : null;
  const rawY = sp.y ? Number(sp.y) : null;
  const initialYear = Number.isFinite(rawY) ? rawY : null;
  const initialTab = sp.tab === "groups" ? "groups" : "individuals";
  const handles = listTrashedHandles();
  const groups = listTrashedGroupYearRows();
  const assignContacts = listContactsForPicker();
  const tags = listTags();

  return (
    <div className="flex h-full min-h-0">
      <AppSidebar active="/unmatched/trash" tags={tags} />
      <div className="min-h-0 min-w-0 flex-1">
        <Suspense
          fallback={<div className="p-4 text-sm text-muted">Loading…</div>}
        >
          <TrashShell
            handles={handles}
            groups={groups}
            assignContacts={assignContacts}
            initialHandle={initialHandle}
            initialGroupId={initialGroupId}
            initialYear={initialYear}
            initialTab={initialTab}
          />
        </Suspense>
      </div>
    </div>
  );
}
