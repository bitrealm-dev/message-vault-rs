#!/usr/bin/env npx tsx
/**
 * Generate low-def derived media beside originals.
 *
 * Usage (from web/):
 *   npm run process-assets -- [--force] [--dry-run] [--skip-image] [--skip-video] [--skip-audio]
 *     [--db PATH] [--assets-dir PATH] [--derived-dir PATH]
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { compressJpeg, Transformer } from "@napi-rs/image";
import { parse } from "smol-toml";

const JPEG_MIN_BYTES = 500 * 1024;
const MP3_MIN_BYTES = 100 * 1024;
const MP4_MIN_BYTES = 10 * 1024 * 1024;
const JPEG_QUALITY = 85;

const IMAGE_EXTS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".bmp",
  ".tif",
  ".tiff",
  ".heic",
  ".heif",
]);
const VIDEO_EXTS = new Set([
  ".mp4",
  ".m4v",
  ".mov",
  ".3gp",
  ".3gpp",
  ".webm",
  ".mpeg",
  ".mpg",
  ".mkv",
]);
const AUDIO_EXTS = new Set([
  ".mp3",
  ".m4a",
  ".aac",
  ".caf",
  ".amr",
  ".wav",
  ".ogg",
]);

type Flags = {
  force: boolean;
  dryRun: boolean;
  skipImage: boolean;
  skipVideo: boolean;
  skipAudio: boolean;
  db?: string;
  assetsDir?: string;
  derivedDir?: string;
};

type AssetRow = {
  sha256: string;
  assets_path: string;
  mime_type: string | null;
  derived_sha256: string | null;
  derived_assets_path: string | null;
};

type DerivedBlob = {
  sha256: string;
  assetsPath: string;
  mimeType: string;
};

function repoRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // web/scripts -> repo root
  return path.resolve(here, "../..");
}

function loadPaths(flags: Flags) {
  const root = repoRoot();
  const configPath = path.join(root, "config", "config.toml");
  const text = fs.readFileSync(configPath, "utf8");
  const cfg = parse(text) as {
    paths?: {
      db?: string;
      assets_dir?: string;
      derived_dir?: string;
    };
  };
  const resolve = (rel: string | undefined, fallback: string) => {
    const value = (rel?.trim() || fallback).trim();
    return path.isAbsolute(value) ? value : path.join(root, value);
  };
  return {
    db: flags.db
      ? path.resolve(flags.db)
      : resolve(cfg.paths?.db, "data/imessage.db"),
    assetsDir: flags.assetsDir
      ? path.resolve(flags.assetsDir)
      : resolve(cfg.paths?.assets_dir, "data/assets"),
    derivedDir: flags.derivedDir
      ? path.resolve(flags.derivedDir)
      : resolve(cfg.paths?.derived_dir, "data/derived"),
  };
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    force: argv.includes("--force"),
    dryRun: argv.includes("--dry-run"),
    skipImage: argv.includes("--skip-image"),
    skipVideo: argv.includes("--skip-video"),
    skipAudio: argv.includes("--skip-audio"),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--db" && next) {
      flags.db = next;
      i++;
    } else if (a === "--assets-dir" && next) {
      flags.assetsDir = next;
      i++;
    } else if (a === "--derived-dir" && next) {
      flags.derivedDir = next;
      i++;
    }
  }
  return flags;
}

function extOf(p: string): string {
  return path.extname(p).toLowerCase();
}

function kindOf(assetsPath: string, mime: string | null): "image" | "video" | "audio" | "other" {
  const ext = extOf(assetsPath);
  if (IMAGE_EXTS.has(ext) || mime?.startsWith("image/")) return "image";
  if (VIDEO_EXTS.has(ext) || mime?.startsWith("video/")) return "video";
  if (AUDIO_EXTS.has(ext) || mime?.startsWith("audio/")) return "audio";
  return "other";
}

function sha256File(filePath: string): string {
  const hash = createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function sha256Buf(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function storeDerived(derivedDir: string, buf: Buffer, ext: string): DerivedBlob {
  const sha = sha256Buf(buf);
  const normalizedExt = ext === ".jpeg" ? ".jpg" : ext;
  const rel = `${sha.slice(0, 2)}/${sha}${normalizedExt}`;
  const dest = path.join(derivedDir, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (!fs.existsSync(dest)) {
    fs.writeFileSync(dest, buf);
  }
  const mime =
    normalizedExt === ".jpg"
      ? "image/jpeg"
      : normalizedExt === ".mp4"
        ? "video/mp4"
        : normalizedExt === ".mp3"
          ? "audio/mpeg"
          : "application/octet-stream";
  return { sha256: sha, assetsPath: rel, mimeType: mime };
}

function storeDerivedFile(derivedDir: string, filePath: string, ext: string): DerivedBlob {
  const buf = fs.readFileSync(filePath);
  return storeDerived(derivedDir, buf, ext);
}

function runFfmpeg(args: string[]): void {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "ffmpeg failed");
  }
}

function ffmpegAvailable(): boolean {
  const result = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  return result.status === 0;
}

function isLinux(): boolean {
  return process.platform === "linux";
}

function heicNeedsFfmpeg(): boolean {
  // @napi-rs/image HEIC works on macOS & Windows via OS codecs; Linux needs ffmpeg.
  return isLinux() || process.platform === "android";
}

async function deriveImage(sourcePath: string): Promise<Buffer | null> {
  const ext = extOf(sourcePath);
  const size = fs.statSync(sourcePath).size;
  const isJpeg = ext === ".jpg" || ext === ".jpeg";
  const isHeic = ext === ".heic" || ext === ".heif";

  if (isJpeg && size <= JPEG_MIN_BYTES) {
    return null;
  }

  let inputBytes: Buffer = fs.readFileSync(sourcePath);

  if (isHeic && heicNeedsFfmpeg()) {
    if (!ffmpegAvailable()) {
      throw new Error("ffmpeg required for HEIC on Linux");
    }
    const tmp = path.join(os.tmpdir(), `mv-heic-${process.pid}-${Date.now()}.jpg`);
    try {
      runFfmpeg(["-i", sourcePath, "-frames:v", "1", tmp]);
      inputBytes = fs.readFileSync(tmp);
    } finally {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
  }

  if (isJpeg && !isHeic) {
    return Buffer.from(await compressJpeg(inputBytes, { quality: JPEG_QUALITY }));
  }

  try {
    return Buffer.from(await new Transformer(inputBytes).rotate().jpeg(JPEG_QUALITY));
  } catch (err) {
    // HEIC on macOS/Windows goes through Transformer; if it fails, try ffmpeg once.
    if (isHeic && ffmpegAvailable()) {
      const tmp = path.join(os.tmpdir(), `mv-heic-fb-${process.pid}-${Date.now()}.jpg`);
      try {
        runFfmpeg(["-i", sourcePath, "-frames:v", "1", tmp]);
        const decoded = fs.readFileSync(tmp);
        return Buffer.from(await new Transformer(decoded).rotate().jpeg(JPEG_QUALITY));
      } finally {
        try {
          fs.unlinkSync(tmp);
        } catch {
          /* ignore */
        }
      }
    }
    throw err;
  }
}

function probeVideoEfficient(sourcePath: string): boolean {
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_name,width,height,avg_frame_rate",
      "-of",
      "json",
      sourcePath,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0 || !result.stdout) return false;
  try {
    const data = JSON.parse(result.stdout) as {
      streams?: Array<{
        codec_name?: string;
        width?: number;
        height?: number;
        avg_frame_rate?: string;
      }>;
    };
    const s = data.streams?.[0];
    if (!s || s.codec_name !== "h264") return false;
    const w = s.width ?? 0;
    const h = s.height ?? 0;
    if (Math.min(w, h) > 720) return false;
    const rate = s.avg_frame_rate ?? "0/1";
    const [num, den] = rate.split("/").map(Number);
    const fps = den ? num / den : 0;
    return fps > 0 && fps <= 30.01;
  } catch {
    return false;
  }
}

function deriveVideo(sourcePath: string, workDir: string): string | null {
  const ext = extOf(sourcePath);
  const size = fs.statSync(sourcePath).size;
  const isMp4 = ext === ".mp4";

  if (isMp4) {
    if (size <= MP4_MIN_BYTES) return null;
    if (probeVideoEfficient(sourcePath)) return null;
  }

  if (!ffmpegAvailable()) {
    throw new Error("ffmpeg required for video derived media");
  }

  const out = path.join(workDir, `out-${sha256File(sourcePath).slice(0, 12)}.mp4`);
  // 720p scale (no upscale); fps cap 30; H.264 CRF 28; AAC 96k
  runFfmpeg([
    "-i",
    sourcePath,
    "-vf",
    "scale='if(gt(iw,ih),-2,min(720,iw))':'if(gt(iw,ih),min(720,ih),-2)',fps=30",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "28",
    "-c:a",
    "aac",
    "-b:a",
    "96k",
    "-movflags",
    "+faststart",
    out,
  ]);
  return out;
}

function deriveAudio(sourcePath: string, workDir: string): string | null {
  const ext = extOf(sourcePath);
  const size = fs.statSync(sourcePath).size;
  const isMp3 = ext === ".mp3";

  if (isMp3 && size <= MP3_MIN_BYTES) {
    return null;
  }
  if (!ffmpegAvailable()) {
    throw new Error("ffmpeg required for audio derived media");
  }

  const out = path.join(workDir, `out-${path.basename(sourcePath)}.mp3`);
  runFfmpeg([
    "-i",
    sourcePath,
    "-vn",
    "-ac",
    "1",
    "-c:a",
    "libmp3lame",
    "-q:a",
    "6",
    out,
  ]);
  return out;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const { db: dbPath, assetsDir, derivedDir } = loadPaths(flags);

  if (!fs.existsSync(dbPath)) {
    throw new Error(`database not found: ${dbPath}`);
  }
  if (!fs.existsSync(assetsDir)) {
    throw new Error(`assets dir not found: ${assetsDir}`);
  }

  fs.mkdirSync(derivedDir, { recursive: true });

  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  const hasAttachments = db
    .prepare(
      `SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'attachments'`,
    )
    .get() as { n: number };
  if (!hasAttachments.n) {
    throw new Error(`no attachments table in ${dbPath} — run import first`);
  }

  // Ensure derived columns exist (for DBs created before this feature).
  const cols = db.prepare(`PRAGMA table_info(attachments)`).all() as Array<{ name: string }>;
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("derived_sha256")) {
    db.exec(`
      ALTER TABLE attachments ADD COLUMN derived_sha256 TEXT;
      ALTER TABLE attachments ADD COLUMN derived_assets_path TEXT;
      ALTER TABLE attachments ADD COLUMN derived_mime_type TEXT;
    `);
  }

  const rows = db
    .prepare(
      `
      SELECT DISTINCT sha256, assets_path, mime_type, derived_sha256, derived_assets_path
      FROM attachments
      WHERE sha256 IS NOT NULL AND sha256 != '' AND assets_path IS NOT NULL AND assets_path != ''
      ORDER BY sha256
    `,
    )
    .all() as AssetRow[];

  const update = db.prepare(`
    UPDATE attachments
    SET derived_sha256 = ?, derived_assets_path = ?, derived_mime_type = ?
    WHERE sha256 = ?
  `);

  let scanned = 0;
  let skipped = 0;
  let derived = 0;
  let errors = 0;

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "mv-derived-"));

  try {
    for (const row of rows) {
      scanned += 1;
      const kind = kindOf(row.assets_path, row.mime_type);

      if (kind === "image" && flags.skipImage) {
        skipped += 1;
        continue;
      }
      if (kind === "video" && flags.skipVideo) {
        skipped += 1;
        continue;
      }
      if (kind === "audio" && flags.skipAudio) {
        skipped += 1;
        continue;
      }
      if (kind === "other") {
        skipped += 1;
        continue;
      }

      if (
        !flags.force &&
        row.derived_assets_path &&
        fs.existsSync(path.join(derivedDir, row.derived_assets_path))
      ) {
        skipped += 1;
        continue;
      }

      const sourcePath = path.join(assetsDir, row.assets_path);
      if (!fs.existsSync(sourcePath)) {
        console.warn(`missing original: ${row.assets_path}`);
        errors += 1;
        continue;
      }

      try {
        let blob: DerivedBlob | null = null;

        if (kind === "image") {
          const jpeg = await deriveImage(sourcePath);
          if (!jpeg) {
            skipped += 1;
            continue;
          }
          if (flags.dryRun) {
            console.log(`[dry-run] image ${row.assets_path} -> jpeg ${jpeg.length} bytes`);
            derived += 1;
            continue;
          }
          blob = storeDerived(derivedDir, jpeg, ".jpg");
        } else if (kind === "video") {
          const out = deriveVideo(sourcePath, workDir);
          if (!out) {
            skipped += 1;
            continue;
          }
          if (flags.dryRun) {
            console.log(`[dry-run] video ${row.assets_path} -> mp4`);
            derived += 1;
            fs.unlinkSync(out);
            continue;
          }
          blob = storeDerivedFile(derivedDir, out, ".mp4");
          fs.unlinkSync(out);
        } else if (kind === "audio") {
          const out = deriveAudio(sourcePath, workDir);
          if (!out) {
            skipped += 1;
            continue;
          }
          if (flags.dryRun) {
            console.log(`[dry-run] audio ${row.assets_path} -> mp3`);
            derived += 1;
            fs.unlinkSync(out);
            continue;
          }
          blob = storeDerivedFile(derivedDir, out, ".mp3");
          fs.unlinkSync(out);
        }

        if (blob) {
          update.run(blob.sha256, blob.assetsPath, blob.mimeType, row.sha256);
          derived += 1;
          console.log(`${row.assets_path} -> ${blob.assetsPath}`);
        }
      } catch (err) {
        errors += 1;
        console.error(`failed ${row.assets_path}:`, err instanceof Error ? err.message : err);
      }
    }
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
    db.close();
  }

  console.log(
    `done: scanned=${scanned} derived=${derived} skipped=${skipped} errors=${errors}` +
      (flags.dryRun ? " (dry-run)" : ""),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
