"use client";

import { useEffect, useState } from "react";
import type { LayoutStorage } from "react-resizable-panels";

const noopStorage: LayoutStorage = {
  getItem: () => null,
  setItem: () => {},
};

/**
 * SSR-safe storage for `useDefaultLayout`.
 * That hook defaults `storage` to bare `localStorage` when omitted/undefined,
 * which throws during Next.js server render.
 * Keep noop through first client paint so SSR and hydration match, then enable
 * localStorage after mount (brief restore from saved sizes is fine).
 */
export function usePanelLayoutStorage(): LayoutStorage {
  const [storage, setStorage] = useState<LayoutStorage>(() => noopStorage);
  useEffect(() => {
    setStorage(localStorage);
  }, []);
  return storage;
}
