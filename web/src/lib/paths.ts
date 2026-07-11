import fs from "fs";
import path from "path";
import { parse } from "smol-toml";

const DEFAULT_DB = "data/imessage.db";
const DEFAULT_ASSETS_DIR = "data/assets";
const DEFAULT_DERIVED_DIR = "data/derived";

/** Repo root (parent of web/), detected via config/config.toml. */
export function repoRoot(): string {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, "config", "config.toml"))) {
    return cwd;
  }
  const parent = path.resolve(cwd, "..");
  if (fs.existsSync(path.join(parent, "config", "config.toml"))) {
    return parent;
  }
  return parent;
}

export function configTomlPath(): string {
  return path.join(repoRoot(), "config", "config.toml");
}

function resolveConfiguredPath(
  configured: string | undefined,
  fallback: string,
): string {
  const rel = configured?.trim() || fallback;
  if (path.isAbsolute(rel)) return rel;
  return path.join(repoRoot(), rel);
}

type PathsConfig = {
  db?: string;
  assets_dir?: string;
  derived_dir?: string;
};

function loadPathsConfig(): PathsConfig {
  const configPath = configTomlPath();
  if (!fs.existsSync(configPath)) {
    return {};
  }
  try {
    const text = fs.readFileSync(configPath, "utf8");
    const cfg = parse(text) as { paths?: PathsConfig };
    return cfg.paths ?? {};
  } catch {
    return {};
  }
}

export function dbPath(): string {
  const paths = loadPathsConfig();
  return resolveConfiguredPath(paths.db, DEFAULT_DB);
}

export function assetsRoot(): string {
  const paths = loadPathsConfig();
  return resolveConfiguredPath(paths.assets_dir, DEFAULT_ASSETS_DIR);
}

export function derivedRoot(): string {
  const paths = loadPathsConfig();
  return resolveConfiguredPath(paths.derived_dir, DEFAULT_DERIVED_DIR);
}

/** Prefer derived media when present unless MEDIA_VARIANT=original. */
export function mediaVariant(): "derived" | "original" {
  const raw = (process.env.MEDIA_VARIANT ?? "derived").trim().toLowerCase();
  return raw === "original" ? "original" : "derived";
}
