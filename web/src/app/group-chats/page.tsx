import { BrowsePageLayout } from "@/components/BrowsePageLayout";
import { GroupChatsShell } from "@/components/GroupChatsShell";
import { listGroupYearRows, listGroups } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function GroupChatsPage({
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
  const contactGroups = listGroups();

  return (
    <BrowsePageLayout active="/group-chats" groups={contactGroups}>
      <GroupChatsShell
        groups={groups}
        initialGroupId={groupId}
        initialYear={year}
      />
    </BrowsePageLayout>
  );
}
