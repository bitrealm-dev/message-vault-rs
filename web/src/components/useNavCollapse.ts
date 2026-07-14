"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";

const NAV_COLLAPSED_KEY = "message-vault:navCollapsed";
/** Collapse nav when the viewport is narrower than this. */
const NAV_AUTO_COLLAPSE_BELOW = 900;

export function useNavCollapse(
  navPanelRef: RefObject<PanelImperativeHandle | null>,
  onCollapsedChange?: (collapsed: boolean) => void,
) {
  const [userCollapsed, setUserCollapsed] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [forceExpand, setForceExpand] = useState(false);
  const wasNarrowRef = useRef(false);

  const collapsed = narrow ? !forceExpand : userCollapsed;

  useEffect(() => {
    onCollapsedChange?.(collapsed);
  }, [collapsed, onCollapsedChange]);

  useEffect(() => {
    if (!navPanelRef.current) return;
    if (collapsed) navPanelRef.current.collapse();
    else navPanelRef.current.expand();
  }, [collapsed, navPanelRef]);

  useEffect(() => {
    setUserCollapsed(window.localStorage.getItem(NAV_COLLAPSED_KEY) === "1");

    const syncNarrow = () => {
      const next = window.innerWidth < NAV_AUTO_COLLAPSE_BELOW;
      if (next && !wasNarrowRef.current) setForceExpand(false);
      wasNarrowRef.current = next;
      setNarrow(next);
    };
    syncNarrow();
    window.addEventListener("resize", syncNarrow);
    return () => window.removeEventListener("resize", syncNarrow);
  }, []);

  const toggleCollapsed = useCallback(() => {
    if (narrow) {
      setForceExpand((prev) => !prev);
      return;
    }
    setUserCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(NAV_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  }, [narrow]);

  return { collapsed, toggleCollapsed };
}
