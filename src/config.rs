use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    pub owner: OwnerConfig,
    pub paths: PathsConfig,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OwnerConfig {
    pub display_name: String,
    pub phone_e164: String,
    #[serde(default)]
    #[allow(dead_code)]
    pub emails: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PathsConfig {
    pub export_dir: PathBuf,
    pub db: PathBuf,
    /// High-quality / original attachment store.
    #[serde(alias = "assets_dir")]
    pub assets_hq: PathBuf,
    /// Low-quality / derived attachment store.
    #[serde(default = "default_assets_lq", alias = "derived_dir")]
    #[allow(dead_code)]
    pub assets_lq: PathBuf,
    /// Contacts CSV (default: `config/contacts.csv`).
    #[serde(default = "default_contacts_csv")]
    pub contacts_csv: PathBuf,
    #[serde(default = "default_blacklist_csv")]
    pub blacklist_csv: PathBuf,
}

fn default_assets_lq() -> PathBuf {
    PathBuf::from("data/assets_lq")
}

fn default_contacts_csv() -> PathBuf {
    PathBuf::from("config/contacts.csv")
}

fn default_blacklist_csv() -> PathBuf {
    PathBuf::from("config/blacklist.csv")
}

impl Config {
    pub fn load(path: &Path) -> Result<Self> {
        let text = fs::read_to_string(path)
            .with_context(|| format!("failed to read config {}", path.display()))?;
        let mut config: Config = toml::from_str(&text)
            .with_context(|| format!("failed to parse config {}", path.display()))?;

        // Absolutize so `config/config.toml` does not treat `config/` as the repo
        // root (Path::parent of a relative `config` is an empty path).
        let abs_config = if path.is_absolute() {
            path.to_path_buf()
        } else {
            std::env::current_dir()
                .context("failed to get current directory")?
                .join(path)
        };
        let config_dir = abs_config
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or_else(|| Path::new("."));
        // Paths in config.toml are repo-relative (`config/contacts.csv`, `data/...`).
        let repo = config_dir
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or(config_dir);

        config.paths.export_dir = resolve_path(repo, &config.paths.export_dir);
        config.paths.db = resolve_path(repo, &config.paths.db);
        config.paths.assets_hq = resolve_path(repo, &config.paths.assets_hq);
        config.paths.assets_lq = resolve_path(repo, &config.paths.assets_lq);
        config.paths.contacts_csv = resolve_path(repo, &config.paths.contacts_csv);
        config.paths.blacklist_csv = resolve_path(repo, &config.paths.blacklist_csv);

        Ok(config)
    }
}

fn resolve_path(base: &Path, configured: &Path) -> PathBuf {
    if configured.is_absolute() {
        configured.to_path_buf()
    } else {
        base.join(configured)
    }
}
