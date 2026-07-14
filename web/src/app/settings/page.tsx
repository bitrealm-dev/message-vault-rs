import { AppShell } from "@/components/AppShell";
import { listGroups } from "@/lib/db";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <AppShell active="/settings" groups={listGroups()}>
      <main className="h-full min-h-0 min-w-0 overflow-y-auto bg-bg px-8 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-2 text-[14px] text-muted">Coming soon.</p>
      </main>
    </AppShell>
  );
}
