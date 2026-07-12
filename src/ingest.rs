//! One-shot: export raw source → staging NDJSON → import → cross-source dedupe.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::{bail, Context, Result};
use chrono::Utc;

use crate::config::Config;
use crate::dedupe;
use crate::import::{self, ImportMode};

#[derive(Debug)]
pub struct IngestOptions {
    pub source_id: String,
    /// One or more raw input roots (merged for exporters that support multi-input).
    pub from: Vec<PathBuf>,
    pub staging_dir: Option<PathBuf>,
    pub mode: ImportMode,
    pub overwrite_contacts: bool,
    pub skip_dedupe: bool,
    pub window_secs: i64,
}

#[derive(Debug, Default)]
pub struct IngestStats {
    pub staging_dir: PathBuf,
    pub rotated_to: Option<PathBuf>,
    pub import: import::ImportStats,
    pub dedupe: Option<dedupe::DedupeStats>,
}

/// Export `--from` into the source staging dir, import that source, then soft-dedupe.
pub fn ingest(cfg: &Config, opts: &IngestOptions) -> Result<IngestStats> {
    let src = cfg.source(&opts.source_id)?;
    let staging = opts
        .staging_dir
        .clone()
        .unwrap_or_else(|| src.export_dir.clone());
    let from = &opts.from;

    if from.is_empty() {
        bail!("ingest needs at least one input path (--from or source_dirs/source_dir in config)");
    }
    for p in from {
        if !p.exists() {
            bail!("input path does not exist: {}", p.display());
        }
    }

    fs::create_dir_all(&staging)
        .with_context(|| format!("failed to create staging dir {}", staging.display()))?;

    println!("Ingest source '{}'", src.id);
    for p in from {
        println!("  from:     {}", p.display());
    }
    println!("  staging:  {}", staging.display());
    println!("  mode:     {}", opts.mode.as_str());

    let rotated_to = rotate_staging(&staging)?;
    if let Some(ref archive) = rotated_to {
        println!("  rotated:  {}", archive.display());
    }

    println!("  phase:    export");
    export_source(cfg, &src.id, from, &staging)?;

    let assets = src.resolved_assets_dir(&cfg.paths);
    println!("  phase:    import → {}", cfg.paths.db.display());
    println!("  assets:   {}", assets.display());
    let import_stats = import::import_export(
        &staging,
        &cfg.paths.db,
        &assets,
        &cfg.paths.contacts_csv,
        &cfg.paths.blacklist_csv,
        opts.overwrite_contacts,
        opts.mode,
        &src.id,
    )?;

    let dedupe_stats = if opts.skip_dedupe {
        println!("  phase:    dedupe skipped");
        None
    } else {
        println!("  phase:    cross-source dedupe");
        let priority: Vec<String> = cfg.sources.iter().map(|s| s.id.clone()).collect();
        Some(dedupe::run_dedupe(
            &cfg.paths.db,
            &priority,
            opts.window_secs,
        )?)
    };

    println!("  phase:    done");

    Ok(IngestStats {
        staging_dir: staging,
        rotated_to,
        import: import_stats,
        dedupe: dedupe_stats,
    })
}

fn export_source(cfg: &Config, source_id: &str, from: &[PathBuf], staging: &Path) -> Result<()> {
    match source_id {
        "go-sms-pro" => {
            let from = require_single_input(source_id, from)?;
            let report =
                go_sms_pro_exporter::convert_export(from, staging, &cfg.owner.phone_e164)?;
            println!(
                "  export:   conversations={} xml={} pdu={} attachments={}",
                report.conversations,
                report.xml_messages,
                report.pdu_messages,
                report.attachments_saved
            );
        }
        "sms-backup-restore" => {
            let from = require_single_input(source_id, from)?;
            let report = sms_backup_restore_exporter::convert_export(
                from,
                staging,
                &cfg.owner.phone_e164,
            )?;
            println!(
                "  export:   conversations={} sms={} mms={} attachments={}",
                report.conversations,
                report.sms_count,
                report.mms_count,
                report.attachments_saved
            );
        }
        "sms-backup-plus" => {
            let emails = if cfg.owner.emails.is_empty() {
                vec!["owner@example.com".to_string()]
            } else {
                cfg.owner.emails.clone()
            };
            let contacts = optional_file("config/contacts.csv");
            let name_mapping = optional_file("config/name-mapping.csv")
                .or_else(|| optional_file("crates/sms-backup-plus-exporter/config/name-mapping.csv"));
            let report = sms_backup_plus_exporter::convert_export(
                from,
                staging,
                &cfg.owner.phone_e164,
                &emails,
                contacts.as_deref(),
                name_mapping.as_deref(),
                true,
            )?;
            println!(
                "  export:   conversations={} messages={} attachments={}",
                report.conversations, report.messages, report.attachments_saved
            );
        }
        "imessage" => {
            let from = require_single_input(source_id, from)?;
            export_imessage(from, staging)?;
        }
        other => {
            bail!(
                "ingest does not know how to export source '{other}' \
                 (supported: imessage, go-sms-pro, sms-backup-plus, sms-backup-restore)"
            );
        }
    }
    Ok(())
}

fn require_single_input<'a>(source_id: &str, from: &'a [PathBuf]) -> Result<&'a Path> {
    match from {
        [one] => Ok(one.as_path()),
        [] => bail!("ingest '{source_id}' needs an input path"),
        _ => bail!(
            "ingest '{source_id}' accepts only one input path; got {} \
             (use source_dir, not multiple source_dirs)",
            from.len()
        ),
    }
}

fn optional_file(rel: &str) -> Option<PathBuf> {
    let p = PathBuf::from(rel);
    if p.is_file() {
        Some(p)
    } else {
        None
    }
}

fn export_imessage(from: &Path, staging: &Path) -> Result<()> {
    let bin = resolve_imessage_binary()?;
    println!("  export:   running {} …", bin.display());
    let status = Command::new(&bin)
        .args([
            "-f",
            "json",
            "-c",
            "clone",
            "-a",
            "iOS",
            "-p",
            from.to_str().context("imessage --from path is not UTF-8")?,
            "-o",
            staging
                .to_str()
                .context("staging path is not UTF-8")?,
        ])
        .status()
        .with_context(|| format!("failed to run {}", bin.display()))?;
    if !status.success() {
        bail!(
            "imessage-exporter-json failed with status {status} (bin: {})",
            bin.display()
        );
    }
    Ok(())
}

fn resolve_imessage_binary() -> Result<PathBuf> {
    let candidates = [
        PathBuf::from("target/release/imessage-exporter-json"),
        PathBuf::from("target/debug/imessage-exporter-json"),
    ];
    for p in &candidates {
        if p.is_file() {
            return Ok(p.clone());
        }
    }
    bail!(
        "imessage-exporter-json binary not found under target/release or target/debug.\n\
         Build it first:\n  cargo build --release -p imessage-exporter"
    );
}

/// Move current staging contents into a UTC timestamp sibling archive dir.
/// Leaves prior `YYYYMMDDTHHMMSSZ` dirs and `.gitkeep` in place.
fn rotate_staging(dest: &Path) -> Result<Option<PathBuf>> {
    fs::create_dir_all(dest)?;

    let mut to_move: Vec<PathBuf> = Vec::new();
    for entry in fs::read_dir(dest)? {
        let entry = entry?;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name == ".gitkeep" {
            continue;
        }
        if is_archive_stamp(&name) {
            continue;
        }
        to_move.push(entry.path());
    }

    if to_move.is_empty() {
        return Ok(None);
    }

    let stamp = Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
    let archive = dest.join(&stamp);
    fs::create_dir_all(&archive)?;
    for path in to_move {
        let name = path
            .file_name()
            .with_context(|| format!("missing file name for {}", path.display()))?;
        let target = archive.join(name);
        fs::rename(&path, &target).with_context(|| {
            format!(
                "failed to rotate {} → {}",
                path.display(),
                target.display()
            )
        })?;
    }
    Ok(Some(archive))
}

fn is_archive_stamp(name: &str) -> bool {
    // YYYYMMDDTHHMMSSZ
    if name.len() != 16 {
        return false;
    }
    let b = name.as_bytes();
    b[8] == b'T'
        && b[15] == b'Z'
        && b[..8].iter().all(|c| c.is_ascii_digit())
        && b[9..15].iter().all(|c| c.is_ascii_digit())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn archive_stamp_detection() {
        assert!(is_archive_stamp("20260712T033045Z"));
        assert!(!is_archive_stamp(".gitkeep"));
        assert!(!is_archive_stamp("chat.json"));
    }
}
