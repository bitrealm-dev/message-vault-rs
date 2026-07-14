use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    pub owner: OwnerConfig,
    pub account: AccountConfig,
    pub paths: PathsConfig,
    /// Named import sources. If empty, a single legacy `paths.export_dir` becomes source `default`.
    #[serde(default)]
    pub sources: Vec<SourceConfig>,
}

/// Message / vault owner — whose backups this vault holds.
#[derive(Debug, Clone, Deserialize)]
pub struct OwnerConfig {
    pub display_name: String,
    pub phones: Vec<String>,
    #[serde(default)]
    pub emails: Vec<String>,
}

/// Web account — credentials for logging into the Message Vault site.
#[derive(Debug, Clone, Deserialize)]
pub struct AccountConfig {
    pub username: String,
    pub login_email: String,
    pub read_only: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PathsConfig {
    pub db: PathBuf,
    /// Root under which per-source asset trees live (`data/<source_id>/…`).
    #[serde(default = "default_data_dir")]
    pub data_dir: PathBuf,
    /// Directory *name* for originals under each source (default `assets`).
    #[serde(default = "default_assets_dir_name")]
    pub assets_dir: String,
    /// Directory *name* for converted media under each source (default `assets_converted`).
    #[serde(default = "default_assets_converted_dir_name")]
    #[allow(dead_code)] // used by SourceConfig::resolved_assets_converted_dir / web
    pub assets_converted_dir: String,
    /// Contacts CSV (default: `config/contacts.csv`).
    #[serde(default = "default_contacts_csv")]
    pub contacts_csv: PathBuf,
    /// Handles to skip on import (default: `config/exclude.csv`).
    #[serde(default = "default_exclude_csv")]
    pub exclude_csv: PathBuf,
    /// Legacy single-export path; used only when `sources` is empty.
    #[serde(default)]
    pub export_dir: Option<PathBuf>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SourceConfig {
    pub id: String,
    pub export_dir: PathBuf,
    /// Optional single raw input path for `ingest` (iPhone backup, XML, EML tree, …).
    /// Prefer [`Self::source_dirs`] when a source has multiple trees.
    #[serde(default)]
    pub source_dir: Option<PathBuf>,
    /// Optional list of raw input paths (merged for exporters that support multi-input).
    /// When non-empty, used instead of [`Self::source_dir`].
    #[serde(default)]
    pub source_dirs: Vec<PathBuf>,
    /// Optional full-path override for originals (else `data_dir/<id>/<assets_dir>`).
    #[serde(default)]
    pub assets_dir: Option<PathBuf>,
    /// Optional full-path override for converted media.
    #[serde(default)]
    pub assets_converted_dir: Option<PathBuf>,
}

fn default_data_dir() -> PathBuf {
    PathBuf::from("data")
}

fn default_assets_dir_name() -> String {
    "assets".to_string()
}

fn default_assets_converted_dir_name() -> String {
    "assets_converted".to_string()
}

fn default_contacts_csv() -> PathBuf {
    PathBuf::from("config/contacts.csv")
}

fn default_exclude_csv() -> PathBuf {
    PathBuf::from("config/exclude.csv")
}

impl SourceConfig {
    /// Raw input paths for ingest/export: `source_dirs` if set, else singular `source_dir`.
    pub fn input_dirs(&self) -> Vec<PathBuf> {
        if !self.source_dirs.is_empty() {
            self.source_dirs.clone()
        } else if let Some(p) = &self.source_dir {
            vec![p.clone()]
        } else {
            Vec::new()
        }
    }

    pub fn resolved_assets_dir(&self, paths: &PathsConfig) -> PathBuf {
        if let Some(p) = &self.assets_dir {
            p.clone()
        } else {
            paths
                .data_dir
                .join(&self.id)
                .join(&paths.assets_dir)
        }
    }

    #[allow(dead_code)] // available for tooling / web parity
    pub fn resolved_assets_converted_dir(&self, paths: &PathsConfig) -> PathBuf {
        if let Some(p) = &self.assets_converted_dir {
            p.clone()
        } else {
            paths
                .data_dir
                .join(&self.id)
                .join(&paths.assets_converted_dir)
        }
    }
}

impl Config {
    pub fn load(path: &Path) -> Result<Self> {
        let text = fs::read_to_string(path)
            .with_context(|| format!("failed to read config {}", path.display()))?;
        let mut config: Config = toml::from_str(&text)
            .with_context(|| format!("failed to parse config {}", path.display()))?;

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
        let repo = config_dir
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or(config_dir);

        config.paths.db = resolve_path(repo, &config.paths.db);
        config.paths.data_dir = resolve_path(repo, &config.paths.data_dir);
        config.paths.contacts_csv = resolve_path(repo, &config.paths.contacts_csv);
        config.paths.exclude_csv = resolve_path(repo, &config.paths.exclude_csv);
        if let Some(export_dir) = config.paths.export_dir.take() {
            config.paths.export_dir = Some(resolve_path(repo, &export_dir));
        }

        if config.sources.is_empty() {
            let Some(export_dir) = config.paths.export_dir.clone() else {
                bail!(
                    "config must define [[sources]] or legacy paths.export_dir ({})",
                    path.display()
                );
            };
            config.sources.push(SourceConfig {
                id: "default".to_string(),
                export_dir,
                source_dir: None,
                source_dirs: Vec::new(),
                assets_dir: None,
                assets_converted_dir: None,
            });
        }

        for source in &mut config.sources {
            if source.id.trim().is_empty() {
                bail!("source id must not be empty");
            }
            source.export_dir = resolve_path(repo, &source.export_dir);
            if let Some(p) = source.source_dir.take() {
                source.source_dir = Some(resolve_path(repo, &p));
            }
            source.source_dirs = source
                .source_dirs
                .drain(..)
                .map(|p| resolve_path(repo, &p))
                .collect();
            if let Some(p) = source.assets_dir.take() {
                source.assets_dir = Some(resolve_path(repo, &p));
            }
            if let Some(p) = source.assets_converted_dir.take() {
                source.assets_converted_dir = Some(resolve_path(repo, &p));
            }
        }

        let mut seen = std::collections::HashSet::new();
        for source in &config.sources {
            if !seen.insert(source.id.as_str()) {
                bail!("duplicate source id '{}'", source.id);
            }
        }

        if config.owner.phones.is_empty() {
            bail!("owner.phones must contain at least one phone number");
        }

        Ok(config)
    }

    pub fn source(&self, id: &str) -> Result<&SourceConfig> {
        self.sources
            .iter()
            .find(|s| s.id == id)
            .with_context(|| format!("unknown source id '{id}'"))
    }
}

fn resolve_path(base: &Path, configured: &Path) -> PathBuf {
    if configured.is_absolute() {
        configured.to_path_buf()
    } else {
        base.join(configured)
    }
}
