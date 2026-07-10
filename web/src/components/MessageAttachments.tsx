import type { AttachmentRow } from "@/lib/types";

function isImageMime(mime: string | null): boolean {
  return Boolean(mime?.startsWith("image/"));
}

function isVideoMime(mime: string | null): boolean {
  return Boolean(mime?.startsWith("video/"));
}

function MissingMediaPlaceholder({
  attachment,
}: {
  attachment: AttachmentRow;
}) {
  const label = attachment.originalName?.trim() || "Attachment";
  const kind = isImageMime(attachment.mimeType)
    ? "image"
    : isVideoMime(attachment.mimeType)
      ? "video"
      : "file";
  const tall = kind === "image" || kind === "video";

  return (
    <div
      role="img"
      aria-label={`Missing ${kind}: ${label}`}
      title={`Missing ${kind}: ${label}`}
      className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/25 bg-black/20 px-3 text-center ${
        tall ? "min-h-[7.5rem] w-full max-w-xs py-5" : "min-h-[3.25rem] py-2.5"
      }`}
    >
      {kind === "image" ? (
        <BrokenImageIcon className="size-7 opacity-55" />
      ) : kind === "video" ? (
        <BrokenVideoIcon className="size-7 opacity-55" />
      ) : (
        <BrokenFileIcon className="size-5 opacity-55" />
      )}
      <div className="min-w-0">
        <div className="text-[11px] font-medium tracking-wide uppercase opacity-70">
          Missing {kind}
        </div>
        <div className="mt-0.5 truncate text-[12px] opacity-80">{label}</div>
      </div>
    </div>
  );
}

export function MessageAttachments({
  attachments,
  hasBody,
}: {
  attachments: AttachmentRow[];
  hasBody?: boolean;
}) {
  if (attachments.length === 0) return null;

  return (
    <div className={`${hasBody ? "mt-2" : ""} space-y-1.5`}>
      {attachments.map((a) =>
        a.assetsPath && isImageMime(a.mimeType) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={a.id}
            src={`/api/assets/${a.assetsPath}`}
            alt={a.originalName ?? "attachment"}
            className="max-h-64 max-w-full rounded-lg"
          />
        ) : a.assetsPath ? (
          <a
            key={a.id}
            href={`/api/assets/${a.assetsPath}`}
            className="block text-[12px] underline opacity-90"
            target="_blank"
            rel="noreferrer"
          >
            {a.originalName ?? a.assetsPath}
          </a>
        ) : (
          <MissingMediaPlaceholder key={a.id} attachment={a} />
        ),
      )}
    </div>
  );
}

function BrokenImageIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.75" />
      <path d="m6.5 17.5 4-4 2.5 2.5 2-2 2.5 3.5" />
      <path d="m4 4 16 16" />
    </svg>
  );
}

function BrokenVideoIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3.5" y="5.5" width="13" height="13" rx="2" />
      <path d="m16.5 10 4-2.25v8.5L16.5 14" />
      <path d="m4 4 16 16" />
    </svg>
  );
}

function BrokenFileIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 3.5H8A1.5 1.5 0 0 0 6.5 5v14A1.5 1.5 0 0 0 8 20.5h8A1.5 1.5 0 0 0 17.5 19V8.5Z" />
      <path d="M14 3.5V8h4.5" />
      <path d="m5 5 14 14" />
    </svg>
  );
}
