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
  const conversationId = Number.isFinite(rawG) ? rawG : null;
  const rawY = sp.y ? Number(sp.y) : null;
  const year = Number.isFinite(rawY) ? rawY : null;
  const groupChats = listGroupYearRows();
  const contactGroups = listGroups();

  return (
    <BrowsePageLayout active="/group-chats" groups={contactGroups}>
      <GroupChatsShell
        groupChats={groupChats}
        initialConversationId={conversationId}
        initialYear={year}
      />
    </BrowsePageLayout>
  );
}
