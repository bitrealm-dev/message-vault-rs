import { BrowsePageLayout } from "@/components/BrowsePageLayout";
import { UnassignedShell } from "@/components/UnassignedShell";
import {
  listContactsForPicker,
  listGroups,
  listUnassignedHandles,
} from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function UnassignedPage({
  searchParams,
}: {
  searchParams: Promise<{ h?: string }>;
}) {
  const sp = await searchParams;
  const initialHandle = sp.h?.trim() || null;
  const handles = listUnassignedHandles();
  const assignContacts = listContactsForPicker();
  const groups = listGroups();

  return (
    <BrowsePageLayout active="/unassigned" groups={groups}>
      <UnassignedShell
        handles={handles}
        assignContacts={assignContacts}
        initialHandle={initialHandle}
        groups={groups}
      />
    </BrowsePageLayout>
  );
}
