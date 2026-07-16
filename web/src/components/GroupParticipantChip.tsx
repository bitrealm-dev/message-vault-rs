"use client";

/** Hoverable group-header participant chip (highlight + trailing chevron). */
export function GroupParticipantChip({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="group/chip inline-flex max-w-full items-center gap-0.5 whitespace-nowrap rounded-md px-1.5 py-0.5 text-inherit transition-colors hover:bg-white/12 hover:text-text"
    >
      <span className="truncate">{label}</span>
      <span
        aria-hidden
        className="inline-block w-0 overflow-hidden opacity-0 transition-all group-hover/chip:ml-0.5 group-hover/chip:w-2.5 group-hover/chip:opacity-70"
      >
        ›
      </span>
    </button>
  );
}

export function GroupParticipantNameSep() {
  return (
    <span className="px-1.5 font-normal opacity-70" aria-hidden>
      ·
    </span>
  );
}
