import fs from "fs";
import { parse } from "smol-toml";
import { configTomlPath } from "./paths";

export type OwnerConfig = {
  display_name: string;
  phone_e164: string;
  emails: string[];
};

export function loadOwner(): OwnerConfig {
  const text = fs.readFileSync(configTomlPath(), "utf8");
  const cfg = parse(text) as {
    owner?: { display_name?: string; phone_e164?: string; emails?: string[] };
  };
  return {
    display_name: cfg.owner?.display_name ?? "Me",
    phone_e164: cfg.owner?.phone_e164 ?? "",
    emails: cfg.owner?.emails ?? [],
  };
}
