"use client";

import {
  DEFAULT_SHOW_CONTACT_INITIALS,
  DEFAULT_SHOW_GROUP_MESSAGE_BADGE,
  DEFAULT_SHOW_MESSAGE_BADGE,
  readBadgeVisibility,
  SHOW_CONTACT_INITIALS_KEY,
  SHOW_GROUP_MESSAGE_BADGE_KEY,
  SHOW_MESSAGE_BADGE_KEY,
  type BadgeVisibility,
} from "@/lib/messageBadgePrefs";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type MessageBadgePrefs = {
  showMessageBadge: boolean;
  showGroupMessageBadge: boolean;
  showContactInitials: boolean;
  setShowMessageBadge: (on: boolean) => void;
  setShowGroupMessageBadge: (on: boolean) => void;
  setShowContactInitials: (on: boolean) => void;
};

const MessageBadgePrefsContext = createContext<MessageBadgePrefs | null>(null);

function toBool(v: BadgeVisibility): boolean {
  return v === "on";
}

function fromBool(on: boolean): BadgeVisibility {
  return on ? "on" : "off";
}

export function MessageBadgePrefsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [showMessageBadge, setShowMessageBadgeState] = useState(true);
  const [showGroupMessageBadge, setShowGroupMessageBadgeState] = useState(true);
  const [showContactInitials, setShowContactInitialsState] = useState(true);

  useEffect(() => {
    setShowMessageBadgeState(
      toBool(
        readBadgeVisibility(SHOW_MESSAGE_BADGE_KEY, DEFAULT_SHOW_MESSAGE_BADGE),
      ),
    );
    setShowGroupMessageBadgeState(
      toBool(
        readBadgeVisibility(
          SHOW_GROUP_MESSAGE_BADGE_KEY,
          DEFAULT_SHOW_GROUP_MESSAGE_BADGE,
        ),
      ),
    );
    setShowContactInitialsState(
      toBool(
        readBadgeVisibility(
          SHOW_CONTACT_INITIALS_KEY,
          DEFAULT_SHOW_CONTACT_INITIALS,
        ),
      ),
    );
  }, []);

  const setShowMessageBadge = useCallback((on: boolean) => {
    setShowMessageBadgeState(on);
    window.localStorage.setItem(SHOW_MESSAGE_BADGE_KEY, fromBool(on));
  }, []);

  const setShowGroupMessageBadge = useCallback((on: boolean) => {
    setShowGroupMessageBadgeState(on);
    window.localStorage.setItem(SHOW_GROUP_MESSAGE_BADGE_KEY, fromBool(on));
  }, []);

  const setShowContactInitials = useCallback((on: boolean) => {
    setShowContactInitialsState(on);
    window.localStorage.setItem(SHOW_CONTACT_INITIALS_KEY, fromBool(on));
  }, []);

  const value = useMemo(
    () => ({
      showMessageBadge,
      showGroupMessageBadge,
      showContactInitials,
      setShowMessageBadge,
      setShowGroupMessageBadge,
      setShowContactInitials,
    }),
    [
      showMessageBadge,
      showGroupMessageBadge,
      showContactInitials,
      setShowMessageBadge,
      setShowGroupMessageBadge,
      setShowContactInitials,
    ],
  );

  return (
    <MessageBadgePrefsContext.Provider value={value}>
      {children}
    </MessageBadgePrefsContext.Provider>
  );
}

export function useMessageBadgePrefs(): MessageBadgePrefs {
  const ctx = useContext(MessageBadgePrefsContext);
  if (!ctx) {
    throw new Error(
      "useMessageBadgePrefs must be used within MessageBadgePrefsProvider",
    );
  }
  return ctx;
}
