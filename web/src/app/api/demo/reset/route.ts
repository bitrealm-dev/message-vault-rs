import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { resetDb } from "@/lib/db";
import { configTomlPath, repoRoot } from "@/lib/paths";
import { NextResponse } from "next/server";
import { parse } from "smol-toml";

export const dynamic = "force-dynamic";

function demoBundleEnabled(): boolean {
  const bundleConfig = path.join(repoRoot(), "demo", "config", "config.toml");
  if (fs.existsSync(bundleConfig)) {
    return true;
  }
  try {
    const cfg = parse(fs.readFileSync(configTomlPath(), "utf8")) as {
      demo?: { enabled?: boolean };
    };
    return cfg.demo?.enabled === true;
  } catch {
    return false;
  }
}

function vaultBinary(): string {
  const release = path.join(repoRoot(), "target", "release", "message-vault-rs");
  if (fs.existsSync(release)) {
    return release;
  }
  return "cargo";
}

function runResetDemo(): { ok: boolean; stdout: string; stderr: string; code: number } {
  const bin = vaultBinary();
  const args =
    bin === "cargo"
      ? ["run", "--release", "--", "reset-demo"]
      : ["reset-demo"];

  const result = spawnSync(bin, args, {
    cwd: repoRoot(),
    encoding: "utf8",
    timeout: 5 * 60 * 1000,
  });

  return {
    ok: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    code: result.status ?? 1,
  };
}

function parseStats(stdout: string) {
  const pick = (label: string) => {
    const m = stdout.match(new RegExp(`${label}:\\s*(\\d+)`, "m"));
    return m ? Number(m[1]) : 0;
  };
  return {
    conversations: pick("conversations"),
    messages: pick("messages"),
    attachments: pick("attachments"),
    contacts: pick("contacts"),
    assetsMissing: pick("assets missing"),
  };
}

export async function GET() {
  return NextResponse.json({ available: demoBundleEnabled() });
}

export async function POST() {
  if (!demoBundleEnabled()) {
    return NextResponse.json(
      { ok: false, error: "Demo reset is not available (missing demo/ bundle)." },
      { status: 403 },
    );
  }

  resetDb();

  const started = Date.now();
  const result = runResetDemo();
  const durationMs = Date.now() - started;

  if (!result.ok) {
    const err = (result.stderr || result.stdout || "reset-demo failed").trim();
    return NextResponse.json(
      { ok: false, error: err.slice(0, 2000), durationMs },
      { status: 500 },
    );
  }

  resetDb();

  return NextResponse.json({
    ok: true,
    durationMs,
    stats: parseStats(result.stdout),
  });
}
