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
    pub assets_dir: PathBuf,
    pub contacts_csv: PathBuf,
    #[serde(default = "default_exclude_csv")]
    pub exclude_csv: PathBuf,
}

fn default_exclude_csv() -> PathBuf {
    PathBuf::from("config/exclude.csv")
}

impl Config {
    pub fn load(path: &Path) -> Result<Self> {
        let text = fs::read_to_string(path)
            .with_context(|| format!("failed to read config {}", path.display()))?;
        let config: Config = toml::from_str(&text)
            .with_context(|| format!("failed to parse config {}", path.display()))?;
        Ok(config)
    }
}
