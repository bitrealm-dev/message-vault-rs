"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SIDEBAR_MIN = 120;
const SIDEBAR_MAX = 448;
const SIDEBAR_DEFAULT = 272;

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

export function useResizablePanes(storagePrefix: string) {
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const [threadsPct, setThreadsPct] = useState(40);
  const sidebarRef = useRef(SIDEBAR_DEFAULT);
  const threadsRef = useRef(40);
  const shellRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<"side" | "threads" | null>(null);

  useEffect(() => {
    const w = clampSidebar(
      readStored(`${storagePrefix}:sidebarWidth`, SIDEBAR_DEFAULT),
    );
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
        const el = document.getElementById(`${storagePrefix}-split`);
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
          `${storagePrefix}:sidebarWidth`,
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
  }, [storagePrefix]);

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

  return { sidebarWidth, threadsPct, startSide, startThreads, shellRef };
}
