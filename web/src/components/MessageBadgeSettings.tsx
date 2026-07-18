"use client";

import { useMessageBadgePrefs } from "./useMessageBadgePrefs";

export function MessageBadgeSettings() {
  const {
    showMessageBadge,
    showGroupMessageBadge,
    showContactInitials,
    setShowMessageBadge,
    setShowGroupMessageBadge,
    setShowContactInitials,
  } = useMessageBadgePrefs();

  return (
    <>
      <section className="max-w-xl">
        <h3 className="text-lg font-semibold tracking-wide text-muted uppercase">
          Messages
        </h3>
        <p className="mt-1 text-[14px] text-muted">
          Choose which count badges appear on contacts in the list.
        </p>

        <div className="mt-4 space-y-3">
          <label className="flex cursor-pointer items-center gap-2.5 text-[14px] text-text">
            <input
              type="checkbox"
              className="checkbox-list"
              checked={showMessageBadge}
              onChange={(e) => setShowMessageBadge(e.target.checked)}
            />
            Show message badge
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 text-[14px] text-text">
            <input
              type="checkbox"
              className="checkbox-list"
              checked={showGroupMessageBadge}
              onChange={(e) => setShowGroupMessageBadge(e.target.checked)}
            />
            Show group message badge
          </label>
        </div>
      </section>

      <section className="mt-10 max-w-xl">
        <h3 className="text-lg font-semibold tracking-wide text-muted uppercase">
          Contacts
        </h3>
        <p className="mt-1 text-[14px] text-muted">
          Colored circles with first and last name initials in the contact list.
        </p>

        <div className="mt-4 space-y-3">
          <label className="flex cursor-pointer items-center gap-2.5 text-[14px] text-text">
            <input
              type="checkbox"
              className="checkbox-list"
              checked={showContactInitials}
              onChange={(e) => setShowContactInitials(e.target.checked)}
            />
            Show contact initials
          </label>
        </div>
      </section>
    </>
  );
}
