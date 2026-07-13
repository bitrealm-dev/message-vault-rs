import { BrowsePageLayout } from "@/components/BrowsePageLayout";
import { TrashShell } from "@/components/TrashShell";
import {
  listContactsForPicker,
  listGroups,
  listTrashedContactMessages,
  listTrashedContacts,
  listTrashedGroupYearRows,
  listTrashedHandles,
} from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function TrashPage({
  searchParams,
}: {
  searchParams: Promise<{ h?: string; g?: string; y?: string; tab?: string }>;
}) {
  const sp = await searchParams;
  const initialHandle = sp.h?.trim() || null;
  const rawG = sp.g ? Number(sp.g) : null;
  const initialConversationId = Number.isFinite(rawG) ? rawG : null;
  const rawY = sp.y ? Number(sp.y) : null;
  const initialYear = Number.isFinite(rawY) ? rawY : null;
  const handles = listTrashedHandles();
  const groupChats = listTrashedGroupYearRows();
  const trashedContacts = listTrashedContacts();
  const trashedContactMessages = listTrashedContactMessages();
  const assignContacts = listContactsForPicker();
  const contactGroups = listGroups();

  return (
    <BrowsePageLayout active="/trash" groups={contactGroups}>
      <TrashShell
        handles={handles}
        groupChats={groupChats}
        trashedContacts={trashedContacts}
        trashedContactMessages={trashedContactMessages}
        assignContacts={assignContacts}
        initialHandle={initialHandle}
        initialConversationId={initialConversationId}
        initialYear={initialYear}
      />
    </BrowsePageLayout>
  );
}
