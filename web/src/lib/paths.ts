import fs from "fs";
import path from "path";
import { parse } from "smol-toml";

const DEFAULT_DB = "data/vault.db";
const DEFAULT_DATA_DIR = "data";
const DEFAULT_ASSETS_DIR = "assets";
const DEFAULT_ASSETS_CONVERTED_DIR = "assets_converted";

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

export type SourcePaths = {
  id: string;
  exportDir: string;
  assetsDir: string;
  assetsConvertedDir: string;
};

type RawConfig = {
  paths?: {
    db?: string;
    data_dir?: string;
    assets_dir?: string;
    assets_converted_dir?: string;
    export_dir?: string;
  };
  sources?: Array<{
    id?: string;
    export_dir?: string;
    assets_dir?: string;
    assets_converted_dir?: string;
  }>;
};

function loadRawConfig(): RawConfig {
  const configPath = configTomlPath();
  if (!fs.existsSync(configPath)) {
    return {};
  }
  try {
    const text = fs.readFileSync(configPath, "utf8");
    return parse(text) as RawConfig;
  } catch {
    return {};
  }
}

export function dbPath(): string {
  const cfg = loadRawConfig();
  return resolveConfiguredPath(cfg.paths?.db, DEFAULT_DB);
}

export function dataDir(): string {
  const cfg = loadRawConfig();
  return resolveConfiguredPath(cfg.paths?.data_dir, DEFAULT_DATA_DIR);
}

export function assetsDirName(): string {
  return loadRawConfig().paths?.assets_dir?.trim() || DEFAULT_ASSETS_DIR;
}

export function assetsConvertedDirName(): string {
  return (
    loadRawConfig().paths?.assets_converted_dir?.trim() ||
    DEFAULT_ASSETS_CONVERTED_DIR
  );
}

/** Configured import sources with resolved asset roots. */
export function loadSources(): SourcePaths[] {
  const cfg = loadRawConfig();
  const root = repoRoot();
  const data = dataDir();
  const assetsName = assetsDirName();
  const convertedName = assetsConvertedDirName();

  const raw = cfg.sources ?? [];
  if (!raw.length && cfg.paths?.export_dir) {
    const id = "default";
    return [
      {
        id,
        exportDir: resolveConfiguredPath(cfg.paths.export_dir, "staging/default"),
        assetsDir: path.join(data, id, assetsName),
        assetsConvertedDir: path.join(data, id, convertedName),
      },
    ];
  }

  return raw
    .filter((s) => s.id?.trim())
    .map((s) => {
      const id = s.id!.trim();
      const resolveOptional = (p: string | undefined, fallback: string) => {
        if (!p?.trim()) return fallback;
        return path.isAbsolute(p) ? p : path.join(root, p);
      };
      return {
        id,
        exportDir: resolveConfiguredPath(s.export_dir, `staging/${id}`),
        assetsDir: resolveOptional(s.assets_dir, path.join(data, id, assetsName)),
        assetsConvertedDir: resolveOptional(
          s.assets_converted_dir,
          path.join(data, id, convertedName),
        ),
      };
    });
}

export function sourceById(id: string): SourcePaths | undefined {
  return loadSources().find((s) => s.id === id);
}
