"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * SSR-safe enum persisted in localStorage.
 * First paint uses `fallback`; client hydrates from storage in an effect.
 * Optional `legacyKeys` are read once and migrated to `key`.
 */
export function usePersistedEnum<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
  legacyKeys?: readonly string[],
): [T, (next: T) => void] {
  const [value, setValueState] = useState<T>(fallback);
  const allowedKey = allowed.join("\0");
  const legacyKey = legacyKeys?.join("\0") ?? "";

  useEffect(() => {
    let raw = window.localStorage.getItem(key);
    if (raw == null && legacyKeys?.length) {
      for (const legacy of legacyKeys) {
        const legacyRaw = window.localStorage.getItem(legacy);
        if (legacyRaw != null) {
          raw = legacyRaw;
          window.localStorage.setItem(key, legacyRaw);
          window.localStorage.removeItem(legacy);
          break;
        }
      }
    }
    if (raw != null && (allowed as readonly string[]).includes(raw)) {
      setValueState(raw as T);
    }
    // allowed identity varies; allowedKey/legacyKey are the stable membership signals
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, allowedKey, legacyKey]);

  const setValue = useCallback(
    (next: T) => {
      setValueState(next);
      window.localStorage.setItem(key, next);
    },
    [key],
  );

  return [value, setValue];
}
