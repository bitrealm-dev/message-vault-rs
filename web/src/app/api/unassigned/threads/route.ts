import { unassignedThreadsBundle } from "@/lib/db";
import {
  unauthorizedResponse,
  withAccountHandler,
} from "@/lib/accountContext";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function authError(err: unknown): NextResponse | null {
  if (err instanceof Error && err.message === "Not signed in") {
    return unauthorizedResponse();
  }
  return null;
}

export async function GET(req: Request) {
  const handle = new URL(req.url).searchParams.get("handle")?.trim() ?? "";
  if (!handle) {
    return NextResponse.json({ error: "handle required" }, { status: 400 });
  }
  const source = new URL(req.url).searchParams.get("source");
  const includeTrashed =
    new URL(req.url).searchParams.get("trashed") === "1";

  try {
    return await withAccountHandler(async () => {
      const bundle = unassignedThreadsBundle(handle, source, { includeTrashed });
      if (!bundle) {
        return NextResponse.json({ error: "not found" }, { status: 404 });
      }
      return NextResponse.json(bundle);
    });
  } catch (err) {
    const auth = authError(err);
    if (auth) return auth;
    const message = err instanceof Error ? err.message : "load failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
