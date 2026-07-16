import { useId } from "react";

/** Shared SVG icons used across shells and menus. */

export function PeopleGroupIcon({ className }: { className?: string }) {
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
      <circle cx="9" cy="8" r="3.25" />
      <path d="M2.75 19.25c.6-3.1 2.85-4.75 6.25-4.75s5.65 1.65 6.25 4.75" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M14.5 19.25c.35-1.85 1.55-3.1 3.5-3.55" />
    </svg>
  );
}

/** Side-by-side pair for participant counts (not the Groups menu mark). */
export function PeopleCountIcon({ className }: { className?: string }) {
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
      <circle cx="8" cy="8.5" r="2.75" />
      <circle cx="16" cy="8.5" r="2.75" />
      <path d="M2.75 19.25c.55-2.85 2.55-4.5 5.25-4.5s4.7 1.65 5.25 4.5" />
      <path d="M10.75 19.25c.55-2.85 2.55-4.5 5.25-4.5s4.7 1.65 5.25 4.5" />
    </svg>
  );
}

export function PersonDetailIcon({ className }: { className?: string }) {
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
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5 19.25c.85-3.2 3.4-5 7-5s6.15 1.8 7 5" />
    </svg>
  );
}

export function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M6.62 10.79a15.15 15.15 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.4 21 3 13.6 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.25 1.02l-2.2 2.19Z" />
    </svg>
  );
}

export function EllipsisIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
    >
      <circle cx="3.5" cy="8" r="1.25" />
      <circle cx="8" cy="8" r="1.25" />
      <circle cx="12.5" cy="8" r="1.25" />
    </svg>
  );
}

export function UndoIcon({ className }: { className?: string }) {
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
      <path d="M9.5 7.5 5.5 11.5 9.5 15.5" />
      <path d="M5.5 11.5h9.25a4.75 4.75 0 0 1 0 9.5H12" />
    </svg>
  );
}

export function RedoIcon({ className }: { className?: string }) {
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
      <path d="M14.5 7.5 18.5 11.5 14.5 15.5" />
      <path d="M18.5 11.5H9.25a4.75 4.75 0 0 0 0 9.5H12" />
    </svg>
  );
}

export function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M8 3.25v9.5M3.25 8h9.5" />
    </svg>
  );
}

export function AddressBookIcon({ className }: { className?: string }) {
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
      <path d="M6.5 3.5h11A1.5 1.5 0 0 1 19 5v14a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5Z" />
      <path d="M5 7.5h2M5 12h2M5 16.5h2" />
      <circle cx="13" cy="10" r="2.25" />
      <path d="M9.75 16.25c.55-1.85 1.95-2.75 3.25-2.75s2.7.9 3.25 2.75" />
    </svg>
  );
}

export function ProhibitedIcon({ className }: { className?: string }) {
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
      <circle cx="12" cy="12" r="8.25" />
      <path d="M6.2 6.2 17.8 17.8" />
    </svg>
  );
}

export function EmptyChatIcon({ className }: { className?: string }) {
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
      <path d="M5 4.5h14A2.5 2.5 0 0 1 21.5 7v8A2.5 2.5 0 0 1 19 17.5h-5.75L8.5 21v-3.5H5A2.5 2.5 0 0 1 2.5 15V7A2.5 2.5 0 0 1 5 4.5Z" />
      <path d="M9 8.5 15 14.5M15 8.5 9 14.5" />
    </svg>
  );
}

export function MessageIcon({ className }: { className?: string }) {
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
      <path d="M5 4.5h14A2.5 2.5 0 0 1 21.5 7v8A2.5 2.5 0 0 1 19 17.5h-5.75L8.5 21v-3.5H5A2.5 2.5 0 0 1 2.5 15V7A2.5 2.5 0 0 1 5 4.5Z" />
    </svg>
  );
}

/**
 * Rounded rect + bottom-left tail. Shared by ChatBubbleIcon and
 * GroupMessagesOutlineIcon (front position; back is this path translated).
 */
const OUTLINE_BUBBLE_PATH =
  "M2.75 9.5h12.25A2.4 2.4 0 0 1 17.4 11.9v4.75A2.4 2.4 0 0 1 15 19.05H9.1L5.75 22.25V19.05H2.75A2.4 2.4 0 0 1 0.35 16.65V11.9A2.4 2.4 0 0 1 2.75 9.5Z";

const OUTLINE_BUBBLE_STROKE = 1.75;
/** Diagonal offset for the back bubble (~25–30% of body size). */
const OUTLINE_BUBBLE_BACK_DX = 5;
const OUTLINE_BUBBLE_BACK_DY = -4.5;
/** Mask stroke wider than visible stroke so a clear gap remains between outlines. */
const OUTLINE_BUBBLE_GAP_MASK_STROKE = 4;

/** Single outlined message bubble (front bubble only). */
export function ChatBubbleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={OUTLINE_BUBBLE_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={OUTLINE_BUBBLE_PATH} />
    </svg>
  );
}

/**
 * Two identical outlined bubbles — back translated up-right, masked so it
 * never touches the front (group messages mark).
 */
export function GroupMessagesOutlineIcon({
  className,
}: {
  className?: string;
}) {
  const maskId = useId();
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={OUTLINE_BUBBLE_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <mask
        id={maskId}
        maskUnits="userSpaceOnUse"
        x="0"
        y="0"
        width="24"
        height="24"
      >
        <rect width="24" height="24" fill="white" />
        {/* Front fill + expanded stroke hide the back bubble behind/under the front */}
        <path
          d={OUTLINE_BUBBLE_PATH}
          fill="black"
          stroke="black"
          strokeWidth={OUTLINE_BUBBLE_GAP_MASK_STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </mask>
      <g mask={`url(#${maskId})`}>
        <path
          d={OUTLINE_BUBBLE_PATH}
          transform={`translate(${OUTLINE_BUBBLE_BACK_DX} ${OUTLINE_BUBBLE_BACK_DY})`}
        />
      </g>
      <path d={OUTLINE_BUBBLE_PATH} fill="black" />
    </svg>
  );
}

/** Two solid overlapping bubbles (front lower-left, back upper-right). */
export function GroupMessagesIcon({ className }: { className?: string }) {
  const maskId = useId();
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <mask id={maskId}>
        <rect width="24" height="24" fill="white" />
        {/* Expanded front bubble cuts a gap out of the back bubble */}
        <path
          fill="black"
          d="M1.75 8.1h13.1A3.15 3.15 0 0 1 18 11.25v5.7a3.15 3.15 0 0 1-3.15 3.15H9.55L5.2 23.4v-3.3H4.9A3.15 3.15 0 0 1 1.75 16.95V11.25A3.15 3.15 0 0 1 4.9 8.1Z"
        />
      </mask>
      {/* Back bubble */}
      <path
        mask={`url(#${maskId})`}
        d="M7.25 2.5h10.5A2.75 2.75 0 0 1 20.5 5.25v6.25a2.75 2.75 0 0 1-2.75 2.75h-1.85l2.35 3.15-1.1-3.15H9.75A2.75 2.75 0 0 1 7 11.5V5.25A2.75 2.75 0 0 1 9.75 2.5Z"
      />
      {/* Front bubble */}
      <path d="M2.5 8.75h12.25A2.75 2.75 0 0 1 17.5 11.5v5.25a2.75 2.75 0 0 1-2.75 2.75H9.85L5.75 22.85v-3.35H5.25A2.75 2.75 0 0 1 2.5 16.75V11.5A2.75 2.75 0 0 1 5.25 8.75Z" />
    </svg>
  );
}

/** Two solid bubbles on a diagonal (front top-left, back bottom-right). */
export function GroupMessagesDiagonalIcon({
  className,
}: {
  className?: string;
}) {
  const maskId = useId();
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <mask id={maskId}>
        <rect width="24" height="24" fill="white" />
        <path
          fill="black"
          d="M1.6 2.35h12.9A3 3 0 0 1 17.5 5.35v6.1a3 3 0 0 1-3 3H9.2L5 17.85v-3.4H4.6A3 3 0 0 1 1.6 11.45V5.35A3 3 0 0 1 4.6 2.35Z"
        />
      </mask>
      {/* Back bubble (bottom-right) */}
      <path
        mask={`url(#${maskId})`}
        d="M8.75 7.75h10.5A2.75 2.75 0 0 1 22 10.5v6a2.75 2.75 0 0 1-2.75 2.75h-1.55l2.2 3.05-1.05-3.05H11.5A2.75 2.75 0 0 1 8.75 16.5v-6A2.75 2.75 0 0 1 11.5 7.75Z"
      />
      {/* Front bubble (top-left) */}
      <path d="M2.25 3h11.5A2.75 2.75 0 0 1 16.5 5.75v5.5a2.75 2.75 0 0 1-2.75 2.75H9.15L5.25 17.55v-3.55H5A2.75 2.75 0 0 1 2.25 11.25v-5.5A2.75 2.75 0 0 1 5 3Z" />
    </svg>
  );
}

/** Outlined front bubble with typing dots over a solid back bubble. */
export function GroupMessagesTypingIcon({
  className,
}: {
  className?: string;
}) {
  const maskId = useId();
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <mask id={maskId}>
        <rect width="24" height="24" fill="white" />
        <path
          fill="black"
          d="M1.5 3.25h13.25A3.25 3.25 0 0 1 18 6.5v6.75a3.25 3.25 0 0 1-3.25 3.25H9.35L4.85 20.9v-4.4H4.75A3.25 3.25 0 0 1 1.5 13.25V6.5A3.25 3.25 0 0 1 4.75 3.25Z"
        />
      </mask>
      {/* Back bubble (solid) */}
      <path
        mask={`url(#${maskId})`}
        d="M7.5 5.5h11A2.75 2.75 0 0 1 21.25 8.25v7a2.75 2.75 0 0 1-2.75 2.75h-1.4l2.15 3-1-3H10.25A2.75 2.75 0 0 1 7.5 15.25v-7A2.75 2.75 0 0 1 10.25 5.5Z"
      />
      {/* Front bubble (outline) */}
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
        d="M3.25 4h11.25A2.5 2.5 0 0 1 17 6.5v6a2.5 2.5 0 0 1-2.5 2.5H9.4L5.75 18.75v-3.75H5.75A2.5 2.5 0 0 1 3.25 12.5V6.5A2.5 2.5 0 0 1 5.75 4Z"
      />
      {/* Typing dots */}
      <circle cx="7.25" cy="9.5" r="1.05" />
      <circle cx="10.75" cy="9.5" r="1.05" />
      <circle cx="14.25" cy="9.5" r="1.05" />
    </svg>
  );
}

export function QuestionHandleIcon({ className }: { className?: string }) {
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
      <circle cx="12" cy="12" r="8.25" />
      <path d="M9.6 9.4a2.4 2.4 0 1 1 3.5 2.1c-.7.4-1.1.9-1.1 1.7" />
      <path d="M12 16.2h.01" />
    </svg>
  );
}

export function TrashIcon({ className }: { className?: string }) {
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
      <path d="M4.5 7.5h15" />
      <path d="M9.5 7.5V5.75A1.25 1.25 0 0 1 10.75 4.5h2.5A1.25 1.25 0 0 1 14.5 5.75V7.5" />
      <path d="M6.75 7.5l.75 11.25A1.5 1.5 0 0 0 9 20h6a1.5 1.5 0 0 0 1.5-1.25L17.25 7.5" />
      <path d="M10 11v5.5M14 11v5.5" />
    </svg>
  );
}

/** Circular arrow — restore / undelete from trash. */
export function RestoreIcon({ className }: { className?: string }) {
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
      <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" />
      <path d="M3.5 4.5v4.5h4.5" />
    </svg>
  );
}

export function XIcon({ className }: { className?: string }) {
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
      <path d="M6 6 18 18M18 6 6 18" />
    </svg>
  );
}

export function PaperclipIcon({ className }: { className?: string }) {
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
      <path d="m21.44 11.05-8.49 8.49a5.25 5.25 0 0 1-7.43-7.43l8.49-8.49a3.5 3.5 0 0 1 4.95 4.95l-8.49 8.49a1.75 1.75 0 0 1-2.47-2.47l7.78-7.78" />
    </svg>
  );
}

export function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4.5 2.5 8 6 4.5 9.5" />
    </svg>
  );
}

export function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 4.5 6 7.5 9 4.5" />
    </svg>
  );
}

export function PencilIcon({ className }: { className?: string }) {
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
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

/** Tilted eraser block with a band and baseline (clear all). */
export function EraserIcon({ className }: { className?: string }) {
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
      <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l4.3 4.3c1 1 1 2.5 0 3.4L10.4 21" />
      <path d="M22 21H7" />
      <path d="m5 11 9 9" />
    </svg>
  );
}

/** Text message bubble with an X inside (delete messages). */
export function TrashMessagesIcon({ className }: { className?: string }) {
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
      {/* speech bubble */}
      <path d="M4 3.75h16A2.25 2.25 0 0 1 22.25 6v8.5A2.25 2.25 0 0 1 20 16.75h-6.4L9.25 20.5v-3.75H4A2.25 2.25 0 0 1 1.75 14.5V6A2.25 2.25 0 0 1 4 3.75Z" />
      {/* X */}
      <path d="M9 7.5 15 13.5M15 7.5 9 13.5" />
    </svg>
  );
}

export function PanelCollapseIcon({ className }: { className?: string }) {
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
      <path d="M9.5 4.5v15" />
      <path d="M14.25 9.75 11.75 12l2.5 2.25" />
    </svg>
  );
}

export function PanelExpandIcon({ className }: { className?: string }) {
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
      <path d="M9.5 4.5v15" />
      <path d="M11.75 9.75 14.25 12l-2.5 2.25" />
    </svg>
  );
}

const vaultKnockout =
  "fill-sidebar group-aria-[current=page]:fill-elevated";

/** Bank safe — flat two-tone (inverted for dark UI). */
export function VaultIcon({ className }: { className?: string }) {
  const dialCx = 12;
  const dialCy = 9.75;
  const spokes = [45, 135, 225, 315];

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <rect x="3.75" y="2.75" width="16.5" height="13.75" rx="2.25" />
      <rect x="5" y="17.25" width="3.25" height="1.75" rx="0.35" />
      <rect x="15.75" y="17.25" width="3.25" height="1.75" rx="0.35" />
      <rect
        x="5"
        y="4"
        width="14"
        height="11.25"
        rx="1.5"
        className={vaultKnockout}
      />
      <rect x="5.2" y="7.25" width="0.95" height="2.1" rx="0.45" />
      <rect x="5.2" y="11.25" width="0.95" height="2.1" rx="0.45" />
      <circle cx={dialCx} cy={dialCy} r="2.75" />
      <circle
        cx={dialCx}
        cy={dialCy}
        r="1.95"
        className={vaultKnockout}
      />
      {spokes.map((deg) => (
        <rect
          key={deg}
          x={dialCx - 0.2}
          y={dialCy - 2.75}
          width="0.4"
          height="5.5"
          rx="0.1"
          className={vaultKnockout}
          transform={`rotate(${deg} ${dialCx} ${dialCy})`}
        />
      ))}
      <circle cx={dialCx} cy={dialCy} r="0.85" />
    </svg>
  );
}

export function GearIcon({ className }: { className?: string }) {
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
      <path d="M12 15.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}
