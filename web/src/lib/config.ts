import fs from "fs";
import { parse } from "smol-toml";
import { configTomlPath } from "./paths";

/** Message / vault owner — whose backups this vault holds. */
export type OwnerConfig = {
  display_name: string;
  phones: string[];
  emails: string[];
};

type ConfigToml = {
  owner?: {
    display_name?: string;
    phones?: string[];
    emails?: string[];
  };
};

function readConfigToml(): ConfigToml {
  const text = fs.readFileSync(configTomlPath(), "utf8");
  return parse(text) as ConfigToml;
}

export function loadOwner(): OwnerConfig {
  const cfg = readConfigToml();
  const phones = cfg.owner?.phones?.filter((p) => p.trim() !== "") ?? [];
  if (phones.length === 0) {
    throw new Error("owner.phones must contain at least one phone in config.toml");
  }
  return {
    display_name: cfg.owner?.display_name?.trim() || "Me",
    phones,
    emails: cfg.owner?.emails ?? [],
  };
}
