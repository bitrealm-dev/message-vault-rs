import { BrowsePageLayout } from "@/components/BrowsePageLayout";
import { GroupMessagesShell } from "@/components/GroupMessagesShell";
import { listGroupYearRows, listGroups } from "@/lib/db";
import { currentAccountId } from "@/lib/accountScope";
import { withServerAccount } from "@/lib/serverAccount";
import { loadVaultOwner } from "@/lib/vaultOwner";

export const dynamic = "force-dynamic";

export default async function GroupChats2Page({
  searchParams,
}: {
  searchParams: Promise<{ g?: string; y?: string }>;
}) {
  const sp = await searchParams;
  const rawG = sp.g ? Number(sp.g) : null;
  const conversationId = Number.isFinite(rawG) ? rawG : null;
  const rawY = sp.y ? Number(sp.y) : null;
  const year = Number.isFinite(rawY) ? rawY : null;

  return withServerAccount(async () => {
    const groupChats = listGroupYearRows();
    const contactGroups = listGroups();
    const owner = loadVaultOwner(currentAccountId());

    return (
      <BrowsePageLayout active="/group-chats-2" groups={contactGroups}>
        <GroupMessagesShell
          owner={owner}
          groupChats={groupChats}
          initialConversationId={conversationId}
          initialYear={year}
        />
      </BrowsePageLayout>
    );
  });
}
