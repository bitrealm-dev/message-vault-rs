import { AppSidebar } from "@/components/AppSidebar";
import { UnmatchedShell } from "@/components/UnmatchedShell";
import {
  listContactsForPicker,
  listTags,
  listTrashedHandles,
} from "@/lib/db";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default async function UnmatchedTrashPage({
  searchParams,
}: {
  searchParams: Promise<{ h?: string }>;
}) {
  const sp = await searchParams;
  const initialHandle = sp.h?.trim() || null;
  const handles = listTrashedHandles();
  const assignContacts = listContactsForPicker();
  const tags = listTags();

  return (
    <div className="flex h-full min-h-0">
      <AppSidebar active="/unmatched/trash" tags={tags} />
      <div className="min-h-0 min-w-0 flex-1">
        <Suspense
          fallback={<div className="p-4 text-sm text-muted">Loading…</div>}
        >
          <UnmatchedShell
            mode="trash"
            handles={handles}
            assignContacts={assignContacts}
            initialHandle={initialHandle}
          />
        </Suspense>
      </div>
    </div>
  );
}
