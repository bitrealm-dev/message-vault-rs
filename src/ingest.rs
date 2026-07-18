//! One-shot: export raw source → staging → import → cross-source dedupe.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::{bail, Context, Result};
use chrono::Utc;
use rusqlite::Connection;

use crate::config::Config;
use crate::dedupe;
use crate::import::{self, ImportMode};
use crate::schema;
use crate::vault_owner::{self, VaultOwner};

#[derive(Debug)]
pub struct IngestOptions {
    pub source_id: String,
    pub account_id: String,
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
    println!("  account:  {}", opts.account_id);
    for p in from {
        println!("  from:     {}", p.display());
    }
    println!("  staging:  {}", staging.display());
    println!("  mode:     {}", opts.mode.as_str());

    let rotated_to = rotate_staging(&staging)?;
    if let Some(ref archive) = rotated_to {
        println!("  rotated:  {}", archive.display());
    }

    let owner = load_owner_for_export(cfg, &opts.account_id)?;

    println!("  phase:    export");
    export_source(cfg, &src.id, from, &staging, &owner)?;

    let assets = src.resolved_assets_dir_for_account(&cfg.paths, &opts.account_id);
    println!("  phase:    import → {}", cfg.paths.db.display());
    println!("  assets:   {}", assets.display());
    let import_stats = import::import_export(
        &staging,
        &cfg.paths.db,
        &assets,
        &cfg.paths.contacts_csv,
        &cfg.paths.exclude_csv,
        opts.overwrite_contacts,
        opts.mode,
        &src.id,
        &opts.account_id,
    )?;

    let dedupe_stats = if opts.skip_dedupe {
        println!("  phase:    dedupe skipped");
        None
    } else {
        println!("  phase:    cross-source dedupe");
        let priority: Vec<String> = cfg.sources.iter().map(|s| s.id.clone()).collect();
        Some(dedupe::run_dedupe(
            &cfg.paths.db,
            &opts.account_id,
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

fn load_owner_for_export(cfg: &Config, account_id: &str) -> Result<VaultOwner> {
    let conn = Connection::open(&cfg.paths.db)?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    schema::ensure_vault_schema(&conn)?;
    vault_owner::ensure_account_row(&conn, account_id)?;
    let owner = vault_owner::load_vault_owner(&conn, account_id)?;
    if !owner.phones.is_empty() {
        return Ok(owner);
    }
    if let Some(legacy) = &cfg.owner {
        if !legacy.phones.is_empty() {
            return Ok(VaultOwner {
                first_name: legacy.display_name.clone(),
                last_name: String::new(),
                display_name: legacy.display_name.clone(),
                phones: legacy.phones.clone(),
                emails: legacy.emails.clone(),
            });
        }
    }
    bail!(
        "vault owner for account {account_id} has no phones; set vault_owner_phones in the DB \
         or legacy [owner].phones in config.toml"
    );
}

/// Known ingest export backends. Add new sources here (and a match arm below).
#[derive(Debug, Clone, Copy)]
enum ExportBackend {
    GoSmsPro,
    SmsBackupRestore,
    SmsBackupPlus,
    Imessage,
}

const EXPORT_REGISTRY: &[(&str, ExportBackend)] = &[
    ("go-sms-pro", ExportBackend::GoSmsPro),
    ("sms-backup-restore", ExportBackend::SmsBackupRestore),
    ("sms-backup-plus", ExportBackend::SmsBackupPlus),
    ("imessage", ExportBackend::Imessage),
];

fn lookup_export_backend(source_id: &str) -> Option<ExportBackend> {
    EXPORT_REGISTRY
        .iter()
        .find(|(id, _)| *id == source_id)
        .map(|(_, backend)| *backend)
}

fn export_source(
    _cfg: &Config,
    source_id: &str,
    from: &[PathBuf],
    staging: &Path,
    owner: &VaultOwner,
) -> Result<()> {
    let Some(backend) = lookup_export_backend(source_id) else {
        bail!(
            "ingest does not know how to export source '{source_id}' \
             (supported: imessage, go-sms-pro, sms-backup-plus, sms-backup-restore)"
        );
    };

    match backend {
        ExportBackend::GoSmsPro => {
            let from = require_single_input(source_id, from)?;
            let bin = resolve_exporter_binary("go-sms-pro-exporter-csv")?;
            let mut cmd = Command::new(&bin);
            cmd.arg("--input")
                .arg(from)
                .arg("--output")
                .arg(staging);
            for phone in &owner.phones {
                cmd.arg("--owner-phone").arg(phone);
            }
            run_exporter(&bin, &mut cmd)?;
            csv_to_ndjson(staging, "go-sms-pro")?;
        }
        ExportBackend::SmsBackupRestore => {
            let from = require_single_input(source_id, from)?;
            let bin = resolve_exporter_binary("sms-backup-restore-exporter-csv")?;
            let mut cmd = Command::new(&bin);
            cmd.arg("--input")
                .arg(from)
                .arg("--output")
                .arg(staging);
            for phone in &owner.phones {
                cmd.arg("--owner-phone").arg(phone);
            }
            run_exporter(&bin, &mut cmd)?;
            csv_to_ndjson(staging, "sms-backup-restore")?;
        }
        ExportBackend::SmsBackupPlus => {
            let bin = resolve_exporter_binary("sms-backup-plus-exporter")?;
            let mut cmd = Command::new(&bin);
            cmd.arg("-v").arg("convert").arg("--output").arg(staging);
            for p in from {
                cmd.arg("--input").arg(p);
            }
            for phone in &owner.phones {
                cmd.arg("--owner-phone").arg(phone);
            }
            let emails = if owner.emails.is_empty() {
                vec!["owner@example.com".to_string()]
            } else {
                owner.emails.clone()
            };
            for email in &emails {
                cmd.arg("--owner-email").arg(email);
            }
            if let Some(contacts) = optional_file("config/contacts.csv") {
                cmd.arg("--contacts").arg(contacts);
            }
            if let Some(mapping) = optional_file("config/name-mapping.csv") {
                cmd.arg("--name-mapping").arg(mapping);
            }
            run_exporter(&bin, &mut cmd)?;
        }
        ExportBackend::Imessage => {
            let from = require_single_input(source_id, from)?;
            export_imessage(from, staging)?;
        }
    }
    Ok(())
}

/// CSV exporters stage `.csv` first; convert in-place to NDJSON for vault import.
fn csv_to_ndjson(staging: &Path, source_id: &str) -> Result<()> {
    let mapping_path = csv_ingest::resolve_mapping_path(None, Some(source_id))?;
    let mapping = csv_ingest::Mapping::load(&mapping_path)?;
    let report = csv_ingest::convert_directory(staging, staging, &mapping)?;
    println!(
        "  csv→json: conversations={} messages={} (mapping {})",
        report.conversations,
        report.messages,
        mapping_path.display()
    );
    if report.rows_skipped > 0 {
        println!("  csv→json: rows skipped={}", report.rows_skipped);
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
    let bin = resolve_exporter_binary("imessage-exporter-json")?;
    let mut cmd = Command::new(&bin);
    cmd.args([
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
    ]);
    run_exporter(&bin, &mut cmd)
}

fn run_exporter(bin: &Path, cmd: &mut Command) -> Result<()> {
    println!("  export:   running {} …", bin.display());
    let status = cmd
        .status()
        .with_context(|| format!("failed to run {}", bin.display()))?;
    if !status.success() {
        bail!(
            "{} failed with status {status}",
            bin.file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("exporter")
        );
    }
    Ok(())
}

/// Find an exporter binary from [`message-exporters`](https://github.com/bitrealm-dev/message-exporters).
///
/// Search order:
/// 1. `$MESSAGE_EXPORTERS_BIN/<name>`
/// 2. sibling `../message-exporters/target/{release,debug}/<name>`
/// 3. `PATH` (`which`)
fn resolve_exporter_binary(name: &str) -> Result<PathBuf> {
    if let Ok(dir) = std::env::var("MESSAGE_EXPORTERS_BIN") {
        let p = PathBuf::from(dir).join(name);
        if p.is_file() {
            return Ok(p);
        }
    }
    let siblings = [
        PathBuf::from(format!("../message-exporters/target/release/{name}")),
        PathBuf::from(format!("../message-exporters/target/debug/{name}")),
        PathBuf::from(format!("target/release/{name}")),
        PathBuf::from(format!("target/debug/{name}")),
    ];
    for p in &siblings {
        if p.is_file() {
            return Ok(p.clone());
        }
    }
    if let Ok(output) = Command::new("which").arg(name).output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Ok(PathBuf::from(path));
            }
        }
    }
    bail!(
        "{name} not found. Build message-exporters and either:\n\
         - export MESSAGE_EXPORTERS_BIN=/path/to/message-exporters/target/release\n\
         - clone message-exporters as a sibling of this repo and cargo build --release\n\
         - install the binary on PATH\n\
         Repo: https://github.com/bitrealm-dev/message-exporters"
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

    #[test]
    fn export_registry_known_ids() {
        assert!(matches!(
            lookup_export_backend("imessage"),
            Some(ExportBackend::Imessage)
        ));
        assert!(matches!(
            lookup_export_backend("go-sms-pro"),
            Some(ExportBackend::GoSmsPro)
        ));
        assert!(matches!(
            lookup_export_backend("sms-backup-plus"),
            Some(ExportBackend::SmsBackupPlus)
        ));
        assert!(matches!(
            lookup_export_backend("sms-backup-restore"),
            Some(ExportBackend::SmsBackupRestore)
        ));
        assert!(lookup_export_backend("unknown-source").is_none());
    }
}
