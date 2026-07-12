"use client";

import type { MessageRow } from "@/lib/types";
import {
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

/** Fetch messages for one or more conversations in a given year. */
export async function fetchThreadMessages(
  conversationIds: number[],
  year: number,
  sourceQuery: string,
): Promise<MessageRow[]> {
  const ids = conversationIds.join(",");
  const res = await fetch(
    `/api/messages?conversationIds=${ids}&year=${year}${sourceQuery}`,
  );
  const data = await res.json();
  return data.messages ?? [];
}

export function useThreadMessages(options: {
  conversationIds: number[] | null;
  year: number | null;
  /** Includes leading `&` when present, e.g. `"&source=x"` or `""`. */
  sourceQuery: string;
  enabled?: boolean;
}): {
  messages: MessageRow[];
  loading: boolean;
  setMessages: Dispatch<SetStateAction<MessageRow[]>>;
} {
  const { conversationIds, year, sourceQuery, enabled = true } = options;
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(false);

  const idsKey = conversationIds?.join(",") ?? "";
  const canFetch =
    enabled && conversationIds != null && conversationIds.length > 0 && year != null;

  useEffect(() => {
    if (!canFetch || conversationIds == null || year == null) {
      setMessages([]);
      setLoading(false);
      return;
    }
    const ids = conversationIds;
    let cancelled = false;
    setLoading(true);
    fetchThreadMessages(ids, year, sourceQuery)
      .then((next) => {
        if (!cancelled) setMessages(next);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // idsKey stands in for conversationIds identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canFetch, idsKey, year, sourceQuery]);

  return { messages, loading, setMessages };
}
