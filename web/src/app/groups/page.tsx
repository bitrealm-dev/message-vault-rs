import { AppSidebar } from "@/components/AppSidebar";
import { GroupsShell } from "@/components/GroupsShell";
import { listGroups, listTags } from "@/lib/db";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ g?: string }>;
}) {
  const sp = await searchParams;
  const raw = sp.g ? Number(sp.g) : null;
  const groupId = Number.isFinite(raw) ? raw : null;
  const groups = listGroups();
  const tags = listTags();

  return (
    <div className="flex h-full min-h-0">
      <AppSidebar active="/groups" tags={tags} />
      <div className="min-h-0 min-w-0 flex-1">
        <Suspense fallback={<div className="p-4 text-sm text-muted">Loading…</div>}>
          <GroupsShell groups={groups} initialGroupId={groupId} />
        </Suspense>
      </div>
    </div>
  );
}
