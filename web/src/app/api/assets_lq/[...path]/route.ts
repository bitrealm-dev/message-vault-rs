import { assetsLqRoot } from "@/lib/paths";
import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Params = { params: Promise<{ path: string[] }> };

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".pdf": "application/pdf",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
};

export async function GET(_req: Request, { params }: Params) {
  const { path: parts } = await params;
  const rel = parts.join("/");
  if (rel.includes("..") || path.isAbsolute(rel)) {
    return NextResponse.json({ error: "invalid path" }, { status: 400 });
  }
  const root = assetsLqRoot();
  const full = path.resolve(root, rel);
  if (!full.startsWith(path.resolve(root))) {
    return NextResponse.json({ error: "invalid path" }, { status: 400 });
  }
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const ext = path.extname(full).toLowerCase();
  const mime = MIME[ext] ?? "application/octet-stream";
  const buf = fs.readFileSync(full);
  return new NextResponse(buf, {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
