import { AppShell } from "@/components/AppShell";
import { listGroups } from "@/lib/db";
import { withServerAccount } from "@/lib/serverAccount";

export const dynamic = "force-dynamic";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return withServerAccount(async () => {
    const groups = listGroups();
    return (
      <AppShell active="/settings" groups={groups}>
        <main className="h-full min-h-0 min-w-0 overflow-y-auto bg-bg px-8 py-10">
          {children}
        </main>
      </AppShell>
    );
  });
}
