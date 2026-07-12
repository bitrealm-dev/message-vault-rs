import { BrowsePageLayout } from "@/components/BrowsePageLayout";
import { UnmatchedShell } from "@/components/UnmatchedShell";
import {
  listContactsForPicker,
  listTags,
  listUnmatchedHandles,
} from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function UnmatchedPage({
  searchParams,
}: {
  searchParams: Promise<{ h?: string }>;
}) {
  const sp = await searchParams;
  const initialHandle = sp.h?.trim() || null;
  const handles = listUnmatchedHandles();
  const assignContacts = listContactsForPicker();
  const tags = listTags();

  return (
    <BrowsePageLayout active="/unmatched" tags={tags}>
      <UnmatchedShell
        handles={handles}
        assignContacts={assignContacts}
        initialHandle={initialHandle}
        tags={tags}
      />
    </BrowsePageLayout>
  );
}
