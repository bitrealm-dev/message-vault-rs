"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SIDEBAR_MIN = 160;
const SIDEBAR_MAX = 720;
const SIDEBAR_DEFAULT = 272;

/** Shared across All / No Messages / Excluded / Unassigned / tag groups / group chats. */
const SHARED_SIDEBAR_KEY = "browse:sidebarWidth";

function readStored(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function clampSidebar(w: number): number {
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w));
}

function readSharedSidebarWidth(storagePrefix: string): number {
  if (typeof window === "undefined") return SIDEBAR_DEFAULT;
  const shared = window.localStorage.getItem(SHARED_SIDEBAR_KEY);
  if (shared != null) {
    const n = Number(shared);
    if (Number.isFinite(n)) return clampSidebar(n);
  }
  // Migrate from older per-section keys.
  return clampSidebar(
    readStored(`${storagePrefix}:sidebarWidth`, SIDEBAR_DEFAULT),
  );
}

export function useResizablePanes(
  storagePrefix: string,
  options?: { splitId?: string },
) {
  const splitId = options?.splitId ?? `${storagePrefix}-split`;
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    readSharedSidebarWidth(storagePrefix),
  );
  const [threadsPct, setThreadsPct] = useState(() =>
    readStored(`${storagePrefix}:threadsPct`, 40),
  );
  const sidebarRef = useRef(sidebarWidth);
  const threadsRef = useRef(threadsPct);
  const shellRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<"side" | "threads" | null>(null);

  useEffect(() => {
    const w = readSharedSidebarWidth(storagePrefix);
    const t = readStored(`${storagePrefix}:threadsPct`, 40);
    sidebarRef.current = w;
    threadsRef.current = t;
    setSidebarWidth(w);
    setThreadsPct(t);
  }, [storagePrefix]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragging.current === "side") {
        const left = shellRef.current?.getBoundingClientRect().left ?? 0;
        const next = clampSidebar(e.clientX - left);
        sidebarRef.current = next;
        setSidebarWidth(next);
      } else if (dragging.current === "threads") {
        const el = document.getElementById(splitId);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (rect.height <= 0) return;
        const pct = ((e.clientY - rect.top) / rect.height) * 100;
        const next = Math.min(75, Math.max(25, pct));
        threadsRef.current = next;
        setThreadsPct(next);
      }
    };
    const onUp = () => {
      if (!dragging.current) return;
      if (dragging.current === "side") {
        window.localStorage.setItem(
          SHARED_SIDEBAR_KEY,
          String(sidebarRef.current),
        );
      } else if (dragging.current === "threads") {
        window.localStorage.setItem(
          `${storagePrefix}:threadsPct`,
          String(threadsRef.current),
        );
      }
      dragging.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [storagePrefix, splitId]);

  const startSide = useCallback(() => {
    dragging.current = "side";
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const startThreads = useCallback(() => {
    dragging.current = "threads";
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }, []);

  return { sidebarWidth, threadsPct, startSide, startThreads, shellRef, splitId };
}
