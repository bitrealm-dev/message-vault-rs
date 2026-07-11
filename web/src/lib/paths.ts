import fs from "fs";
import path from "path";
import { parse } from "smol-toml";

const DEFAULT_DB = "data/imessage.db";
const DEFAULT_ASSETS_HQ = "data/assets_hq";
const DEFAULT_ASSETS_LQ = "data/assets_lq";

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
  assets_hq?: string;
  assets_lq?: string;
  /** @deprecated use assets_hq */
  assets_dir?: string;
  /** @deprecated use assets_lq */
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

/** High-quality / original attachment root. */
export function assetsHqRoot(): string {
  const paths = loadPathsConfig();
  return resolveConfiguredPath(
    paths.assets_hq ?? paths.assets_dir,
    DEFAULT_ASSETS_HQ,
  );
}

/** Low-quality / derived attachment root. */
export function assetsLqRoot(): string {
  const paths = loadPathsConfig();
  return resolveConfiguredPath(
    paths.assets_lq ?? paths.derived_dir,
    DEFAULT_ASSETS_LQ,
  );
}

/** @deprecated use assetsHqRoot */
export function assetsRoot(): string {
  return assetsHqRoot();
}

/** @deprecated use assetsLqRoot */
export function derivedRoot(): string {
  return assetsLqRoot();
}

/** Prefer LQ media when present unless MEDIA_VARIANT=hq (or original). */
export function mediaVariant(): "lq" | "hq" {
  const raw = (process.env.MEDIA_VARIANT ?? "lq").trim().toLowerCase();
  if (raw === "hq" || raw === "original") return "hq";
  return "lq";
}
