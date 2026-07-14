import { AppShell } from "@/components/AppShell";
import { listGroups } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell active="/settings" groups={listGroups()}>
      <main className="h-full min-h-0 min-w-0 overflow-y-auto bg-bg px-8 py-10">
        {children}
      </main>
    </AppShell>
  );
}
