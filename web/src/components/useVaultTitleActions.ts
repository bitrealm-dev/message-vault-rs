"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useConfirmDialog } from "./useConfirmDialog";

/** Shared logout / demo-reset actions for Message Vault title menus. */
export function useVaultTitleActions() {
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [demoResetAvailable, setDemoResetAvailable] = useState(false);
  const [resettingDemo, setResettingDemo] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/demo/reset")
      .then((r) => r.json())
      .then((data: { available?: boolean }) => {
        if (!cancelled) setDemoResetAvailable(data.available === true);
      })
      .catch(() => {
        if (!cancelled) setDemoResetAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }, [router]);

  const resetDemo = useCallback(async () => {
    const ok = await confirm(
      "Restore all messages, contacts, labels, and trash to the committed demo dataset. Your edits will be lost.",
      "Reset demo",
    );
    if (!ok) return;

    setResettingDemo(true);
    setResetError(null);
    try {
      const res = await fetch("/api/demo/reset", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Reset failed");
      }
      await logout();
    } catch (e) {
      setResetError(e instanceof Error ? e.message : "Reset failed");
      setResettingDemo(false);
    }
  }, [confirm, logout]);

  return {
    demoResetAvailable,
    resettingDemo,
    resetError,
    logout,
    resetDemo,
    confirmDialog,
  };
}
