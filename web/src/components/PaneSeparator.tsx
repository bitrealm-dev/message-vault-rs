"use client";

import { Separator } from "react-resizable-panels";

const verticalClass =
  "w-1.5 bg-border transition-colors hover:bg-accent/60 active:bg-accent/70";
const horizontalClass =
  "h-1.5 bg-border transition-colors hover:bg-accent/60 active:bg-accent/70";

/** Shared styled separator for react-resizable-panels. */
export function PaneSeparator({
  orientation = "horizontal",
  disabled,
  id,
}: {
  orientation?: "horizontal" | "vertical";
  disabled?: boolean;
  id?: string;
}) {
  return (
    <Separator
      id={id}
      disabled={disabled}
      className={orientation === "vertical" ? verticalClass : horizontalClass}
    />
  );
}
