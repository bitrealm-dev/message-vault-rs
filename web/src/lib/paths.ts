import fs from "fs";
import path from "path";

/** Repo root (parent of web/). */
export function repoRoot(): string {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, "data", "imessage.db"))) {
    return cwd;
  }
  const parent = path.resolve(cwd, "..");
  if (fs.existsSync(path.join(parent, "data", "imessage.db"))) {
    return parent;
  }
  return parent;
}

export function dbPath(): string {
  return path.join(repoRoot(), "data", "imessage.db");
}

export function assetsRoot(): string {
  return path.join(repoRoot(), "data", "assets");
}

export function configTomlPath(): string {
  return path.join(repoRoot(), "config", "config.toml");
}
