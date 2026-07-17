import { StyleGuidePreview } from "@/components/StyleGuidePreview";
import { ThemeSettings } from "@/components/ThemeSettings";

export default function SettingsDisplayPage() {
  return (
    <>
      <h2 className="text-2xl font-semibold tracking-tight">Display options</h2>
      <p className="mt-2 max-w-xl text-[14px] text-muted">
        Customize how Message Vault looks and feels.
      </p>
      <div className="mt-8">
        <ThemeSettings />
      </div>
      <StyleGuidePreview />
    </>
  );
}
