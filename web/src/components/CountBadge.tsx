/** Tall rounded count chip (contact / group list chrome). */
export function CountBadge({
  count,
  title,
}: {
  count: number;
  title?: string;
}) {
  return (
    <span
      title={title}
      className="inline-flex min-h-[1.375rem] min-w-[1.25rem] items-center justify-center rounded-md bg-elevated px-1.5 py-0.5 text-[12px] leading-none font-medium text-text tabular-nums"
    >
      {count.toLocaleString()}
    </span>
  );
}
