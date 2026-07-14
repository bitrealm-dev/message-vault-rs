import type { HistoryCommand } from "./historyTypes";

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error ?? fallback;
  } catch {
    return fallback;
  }
}

async function jsonFetch(
  url: string,
  init: RequestInit,
  fallback: string,
): Promise<void> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(await readError(res, fallback));
}

async function trashUnassignedHandles(handles: string[]): Promise<void> {
  for (const handle of handles) {
    await jsonFetch(
      "/api/unassigned/trash",
      { method: "POST", body: JSON.stringify({ handle }) },
      "trash failed",
    );
  }
}

async function restoreUnassignedHandles(handles: string[]): Promise<void> {
  for (const handle of handles) {
    await jsonFetch(
      "/api/unassigned/trash",
      { method: "DELETE", body: JSON.stringify({ handle }) },
      "restore failed",
    );
  }
}

async function assignHandles(
  contactId: number,
  handles: string[],
): Promise<void> {
  for (const handle of handles) {
    await jsonFetch(
      `/api/contacts/${contactId}/handles`,
      { method: "POST", body: JSON.stringify({ handle }) },
      "assign failed",
    );
  }
}

async function unassignHandles(
  contactId: number,
  handles: string[],
): Promise<void> {
  for (const handle of handles) {
    await jsonFetch(
      `/api/contacts/${contactId}/handles`,
      { method: "DELETE", body: JSON.stringify({ handle }) },
      "unassign failed",
    );
  }
}

/** Run the inverse of a forward command (undo). */
export async function undoCommand(cmd: HistoryCommand): Promise<void> {
  switch (cmd.type) {
    case "assignHandles":
      await unassignHandles(cmd.contactId, cmd.handles);
      return;
    case "trashContacts":
      if (cmd.mode === "messages_only") {
        const handles = cmd.handles ?? [];
        if (handles.length === 0) {
          throw new Error("no handles to restore");
        }
        for (const handle of handles) {
          await jsonFetch(
            "/api/contacts/trash",
            {
              method: "DELETE",
              body: JSON.stringify({ handle }),
            },
            "restore failed",
          );
        }
        return;
      }
      await jsonFetch(
        "/api/contacts/trash",
        {
          method: "DELETE",
          body: JSON.stringify({ ids: cmd.contactIds }),
        },
        "restore failed",
      );
      return;
    case "trashGroupThread":
      for (const conversationId of cmd.conversationIds) {
        await jsonFetch(
          "/api/group-chats/trash",
          {
            method: "DELETE",
            body: JSON.stringify({ conversationId }),
          },
          "restore failed",
        );
      }
      return;
    case "createContact":
      await jsonFetch(
        "/api/contacts/trash",
        {
          method: "POST",
          body: JSON.stringify({
            ids: [cmd.contactId],
            mode: "contact_and_messages",
          }),
        },
        "undo create failed",
      );
      return;
    case "createGroup": {
      const res = await fetch(
        `/api/contact-groups/members?name=${encodeURIComponent(cmd.name)}`,
      );
      if (!res.ok) throw new Error(await readError(res, "group lookup failed"));
      const data = (await res.json()) as { memberContactIds?: number[] };
      const members = data.memberContactIds ?? [];
      if (members.length > 0) {
        throw new Error(
          "Group has members; undo create is unavailable",
        );
      }
      await jsonFetch(
        "/api/contact-groups",
        { method: "DELETE", body: JSON.stringify({ name: cmd.name }) },
        "delete group failed",
      );
      return;
    }
    case "deleteGroup":
      await jsonFetch(
        "/api/contact-groups/restore",
        {
          method: "POST",
          body: JSON.stringify({
            name: cmd.name,
            memberContactIds: cmd.memberContactIds,
          }),
        },
        "restore group failed",
      );
      return;
    case "trashUnassignedHandles":
      await restoreUnassignedHandles(cmd.handles);
      return;
    default: {
      const _exhaustive: never = cmd;
      void _exhaustive;
      throw new Error("unknown history command");
    }
  }
}

/** Re-apply a forward command (redo). */
export async function redoCommand(cmd: HistoryCommand): Promise<void> {
  switch (cmd.type) {
    case "assignHandles":
      await assignHandles(cmd.contactId, cmd.handles);
      return;
    case "trashContacts":
      await jsonFetch(
        "/api/contacts/trash",
        {
          method: "POST",
          body: JSON.stringify({
            ids: cmd.contactIds,
            mode: cmd.mode,
          }),
        },
        "trash failed",
      );
      return;
    case "trashGroupThread":
      for (const conversationId of cmd.conversationIds) {
        await jsonFetch(
          "/api/group-chats/trash",
          {
            method: "POST",
            body: JSON.stringify({ conversationId }),
          },
          "trash failed",
        );
      }
      return;
    case "createContact":
      await jsonFetch(
        "/api/contacts/trash",
        {
          method: "DELETE",
          body: JSON.stringify({ ids: [cmd.contactId] }),
        },
        "restore failed",
      );
      return;
    case "createGroup":
      await jsonFetch(
        "/api/contact-groups",
        { method: "POST", body: JSON.stringify({ name: cmd.name }) },
        "create group failed",
      );
      return;
    case "deleteGroup":
      await jsonFetch(
        "/api/contact-groups",
        { method: "DELETE", body: JSON.stringify({ name: cmd.name }) },
        "delete group failed",
      );
      return;
    case "trashUnassignedHandles":
      await trashUnassignedHandles(cmd.handles);
      return;
    default: {
      const _exhaustive: never = cmd;
      void _exhaustive;
      throw new Error("unknown history command");
    }
  }
}
