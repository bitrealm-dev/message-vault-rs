import { BrowsePageLayout } from "@/components/BrowsePageLayout";
import { TrashShell } from "@/components/TrashShell";
import {
  listContactsForPicker,
  listGroups,
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
  const initialGroupId = Number.isFinite(rawG) ? rawG : null;
  const rawY = sp.y ? Number(sp.y) : null;
  const initialYear = Number.isFinite(rawY) ? rawY : null;
  const initialTab = sp.tab === "group-chats" ? "group-chats" : "unassigned";
  const handles = listTrashedHandles();
  const groups = listTrashedGroupYearRows();
  const assignContacts = listContactsForPicker();
  const contactGroups = listGroups();

  return (
    <BrowsePageLayout active="/trash" groups={contactGroups}>
      <TrashShell
        handles={handles}
        groups={groups}
        assignContacts={assignContacts}
        initialHandle={initialHandle}
        initialGroupId={initialGroupId}
        initialYear={initialYear}
        initialTab={initialTab}
      />
    </BrowsePageLayout>
  );
}
