import { SettingsAccountForm } from "@/components/SettingsAccountForm";

export default function SettingsAccountPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Web Account</h1>
      <div className="mt-8">
        <SettingsAccountForm />
      </div>
    </>
  );
}
