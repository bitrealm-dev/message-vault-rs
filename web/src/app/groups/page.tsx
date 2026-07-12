import { BrowsePageLayout } from "@/components/BrowsePageLayout";
import { GroupsShell } from "@/components/GroupsShell";
import { listGroupYearRows, listTags } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ g?: string; y?: string }>;
}) {
  const sp = await searchParams;
  const rawG = sp.g ? Number(sp.g) : null;
  const groupId = Number.isFinite(rawG) ? rawG : null;
  const rawY = sp.y ? Number(sp.y) : null;
  const year = Number.isFinite(rawY) ? rawY : null;
  const groups = listGroupYearRows();
  const tags = listTags();

  return (
    <BrowsePageLayout active="/groups" tags={tags}>
      <GroupsShell
        groups={groups}
        initialGroupId={groupId}
        initialYear={year}
      />
    </BrowsePageLayout>
  );
}
