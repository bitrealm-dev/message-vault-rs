//! Load per-source CSV → JSON mapping TOML files.

use anyhow::{bail, Context, Result};
use serde::Deserialize;
use std::collections::HashMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Deserialize)]
pub struct Mapping {
    pub source_id: String,
    pub export_source: String,
    /// Version of the exporter / upstream software this mapping was written for
    /// (e.g. `imessage-database` 4.2.0, or crate `0.1.0`).
    pub exporter_version: String,
    #[serde(default = "default_schema")]
    pub schema: String,
    #[serde(default = "default_service_sms")]
    pub default_service: String,
    pub columns: HashMap<String, String>,
    #[serde(default)]
    pub transforms: Transforms,
    #[serde(default)]
    pub required: Required,
}

fn default_schema() -> String {
    "vault".into()
}

fn default_service_sms() -> String {
    "SMS".into()
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct Transforms {
    #[serde(default = "default_true")]
    pub direction_to_is_from_me: bool,
    #[serde(default = "default_true")]
    pub attachments_json_parse: bool,
    #[serde(default)]
    pub tapbacks_json_parse: bool,
    #[serde(default)]
    pub participants_json_parse: bool,
    #[serde(default)]
    pub parts_json_parse: bool,
    #[serde(default)]
    pub edits_json_parse: bool,
    #[serde(default)]
    pub app_json_parse: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Deserialize)]
pub struct Required {
    #[serde(default = "default_required_fields")]
    pub fields: Vec<String>,
    #[serde(default = "default_true")]
    pub require_text_or_attachments: bool,
}

impl Default for Required {
    fn default() -> Self {
        Self {
            fields: default_required_fields(),
            require_text_or_attachments: true,
        }
    }
}

fn default_required_fields() -> Vec<String> {
    vec![
        "chat_identifier".into(),
        "timestamp".into(),
        "direction".into(),
    ]
}

impl Mapping {
    pub fn load(path: &Path) -> Result<Self> {
        let text = fs::read_to_string(path)
            .with_context(|| format!("read mapping {}", path.display()))?;
        let mapping: Self = toml::from_str(&text)
            .with_context(|| format!("parse mapping TOML {}", path.display()))?;
        if mapping.columns.is_empty() {
            bail!("mapping {} has empty [columns]", path.display());
        }
        if mapping.exporter_version.trim().is_empty() {
            bail!("mapping {} missing exporter_version", path.display());
        }
        if mapping.schema != "vault" {
            bail!(
                "mapping {} schema must be \"vault\" (got {:?}); CSV ingest writes vault NDJSON only",
                path.display(),
                mapping.schema
            );
        }
        Ok(mapping)
    }

    /// CSV header name that maps to the given JSON field, if any.
    pub fn csv_column_for_json(&self, json_field: &str) -> Option<&str> {
        self.columns
            .iter()
            .find(|(_, v)| v.as_str() == json_field)
            .map(|(k, _)| k.as_str())
    }

    pub fn bundled_mapping_path(source_id: &str) -> std::path::PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("mappings")
            .join(format!("{source_id}.toml"))
    }
}
