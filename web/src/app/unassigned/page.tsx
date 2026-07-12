import { BrowsePageLayout } from "@/components/BrowsePageLayout";
import { UnassignedShell } from "@/components/UnassignedShell";
import {
  listContactsForPicker,
  listTags,
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
  const tags = listTags();

  return (
    <BrowsePageLayout active="/unassigned" tags={tags}>
      <UnassignedShell
        handles={handles}
        assignContacts={assignContacts}
        initialHandle={initialHandle}
        tags={tags}
      />
    </BrowsePageLayout>
  );
}
