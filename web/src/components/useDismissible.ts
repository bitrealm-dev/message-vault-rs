"use client";

import { useEffect, useRef, type RefObject } from "react";

export type UseDismissibleOptions = {
  open: boolean;
  onDismiss: () => void;
  /** Click outside closes unless the event target is inside any of these. */
  refs: RefObject<HTMLElement | null>[];
  /** Listen for Escape. `"capture"` uses capture phase. */
  escape?: boolean | "capture";
  /**
   * Custom Escape handler. Return `false` to skip `onDismiss`
   * (e.g. step back from a create form inside the menu).
   */
  onEscape?: (e: KeyboardEvent) => void | false;
  eventTarget?: Document | Window;
};

/** Close on outside mousedown and/or Escape while `open`. */
export function useDismissible({
  open,
  onDismiss,
  refs,
  escape = true,
  onEscape,
  eventTarget,
}: UseDismissibleOptions): void {
  const refsRef = useRef(refs);
  refsRef.current = refs;
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!open) return;
    const target: Document | Window =
      eventTarget ?? (typeof document !== "undefined" ? document : window);

    const onDoc = (e: MouseEvent) => {
      const node = e.target as Node;
      for (const ref of refsRef.current) {
        if (ref.current?.contains(node)) return;
      }
      onDismissRef.current();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (onEscapeRef.current) {
        const result = onEscapeRef.current(e);
        if (result === false) return;
      }
      onDismissRef.current();
    };

    const useCapture = escape === "capture";
    target.addEventListener("mousedown", onDoc as EventListener);
    if (escape) {
      target.addEventListener("keydown", onKey as EventListener, useCapture);
    }
    return () => {
      target.removeEventListener("mousedown", onDoc as EventListener);
      if (escape) {
        target.removeEventListener(
          "keydown",
          onKey as EventListener,
          useCapture,
        );
      }
    };
  }, [open, escape, eventTarget]);
}
