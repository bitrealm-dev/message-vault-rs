"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SIDEBAR_MIN = 160;
const SIDEBAR_MAX = 720;
const SIDEBAR_DEFAULT = 272;
const THREADS_PCT_DEFAULT = 40;

/** Shared across All / No Messages / Excluded / Unassigned / contact groups / group chats. */
const SHARED_SIDEBAR_KEY = "browse:sidebarWidth";

/** Last client-known widths so remounts (nav / refresh) don't snap to defaults. */
let cachedSidebarWidth: number | null = null;
const cachedThreadsPct = new Map<string, number>();

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

function initialSidebarWidth(): number {
  return cachedSidebarWidth ?? SIDEBAR_DEFAULT;
}

function initialThreadsPct(storagePrefix: string): number {
  return cachedThreadsPct.get(storagePrefix) ?? THREADS_PCT_DEFAULT;
}

export function useResizablePanes(
  storagePrefix: string,
  options?: { splitId?: string },
) {
  const splitId = options?.splitId ?? `${storagePrefix}-split`;
  // Prefer in-memory cache after first client read; SSR/first paint still use defaults
  // so hydration matches. Avoids remount jitter when switching groups.
  const [sidebarWidth, setSidebarWidth] = useState(initialSidebarWidth);
  const [threadsPct, setThreadsPct] = useState(() =>
    initialThreadsPct(storagePrefix),
  );
  const sidebarRef = useRef(sidebarWidth);
  const threadsRef = useRef(threadsPct);
  const shellRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<"side" | "threads" | null>(null);

  useEffect(() => {
    const w = readSharedSidebarWidth(storagePrefix);
    const t = readStored(`${storagePrefix}:threadsPct`, THREADS_PCT_DEFAULT);
    cachedSidebarWidth = w;
    cachedThreadsPct.set(storagePrefix, t);
    sidebarRef.current = w;
    threadsRef.current = t;
    setSidebarWidth((prev) => (prev === w ? prev : w));
    setThreadsPct((prev) => (prev === t ? prev : t));
  }, [storagePrefix]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragging.current === "side") {
        e.preventDefault();
        const left = shellRef.current?.getBoundingClientRect().left ?? 0;
        const next = clampSidebar(e.clientX - left);
        sidebarRef.current = next;
        cachedSidebarWidth = next;
        setSidebarWidth(next);
      } else if (dragging.current === "threads") {
        e.preventDefault();
        const el = document.getElementById(splitId);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (rect.height <= 0) return;
        const pct = ((e.clientY - rect.top) / rect.height) * 100;
        const next = Math.min(75, Math.max(25, pct));
        threadsRef.current = next;
        cachedThreadsPct.set(storagePrefix, next);
        setThreadsPct(next);
      }
    };
    const onUp = () => {
      if (!dragging.current) return;
      if (dragging.current === "side") {
        cachedSidebarWidth = sidebarRef.current;
        window.localStorage.setItem(
          SHARED_SIDEBAR_KEY,
          String(sidebarRef.current),
        );
      } else if (dragging.current === "threads") {
        cachedThreadsPct.set(storagePrefix, threadsRef.current);
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
      if (dragging.current) {
        dragging.current = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
  }, [storagePrefix, splitId]);

  const startSide = useCallback((e: { preventDefault(): void; stopPropagation(): void }) => {
    e.preventDefault();
    e.stopPropagation();
    dragging.current = "side";
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const startThreads = useCallback((e: { preventDefault(): void; stopPropagation(): void }) => {
    e.preventDefault();
    e.stopPropagation();
    dragging.current = "threads";
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  }, []);

  return { sidebarWidth, threadsPct, startSide, startThreads, shellRef, splitId };
}
