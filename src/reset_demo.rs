//! Restore the committed demo bundle: config, wipe DB/assets, re-import.

use std::fs;
use std::path::Path;

use anyhow::{bail, Context, Result};

use crate::config::Config;
use crate::dedupe;
use crate::import::{self, ImportMode};

#[derive(Debug)]
pub struct ResetDemoStats {
    pub import: import::ImportStats,
    pub dedupe_keys_filled: u64,
}

pub fn run_reset_demo(bundle: &Path, config_dest: &Path) -> Result<ResetDemoStats> {
    let bundle = if bundle.is_absolute() {
        bundle.to_path_buf()
    } else {
        std::env::current_dir()?.join(bundle)
    };

    let demo_config = bundle.join("config/config.toml");
    if !demo_config.is_file() {
        bail!(
            "demo bundle missing {} (run: cargo run -p demo-seed)",
            demo_config.display()
        );
    }

    fs::create_dir_all(
        config_dest
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or(Path::new("config")),
    )?;
    fs::copy(&demo_config, config_dest).with_context(|| {
        format!(
            "copy {} → {}",
            demo_config.display(),
            config_dest.display()
        )
    })?;

    let cfg = Config::load(config_dest)?;
    wipe_vault(&cfg)?;
    restore_demo_csvs(&bundle, &cfg)?;

    let src = cfg.source("imessage")?;
    let export_dir = src.export_dir.clone();
    let assets_dir = src.resolved_assets_dir(&cfg.paths);
    let db = cfg.paths.db.clone();
    let contacts_csv = cfg.paths.contacts_csv.clone();
    let exclude_csv = cfg.paths.exclude_csv.clone();

    println!("Reset demo");
    println!("  bundle:       {}", bundle.display());
    println!("  config:       {}", config_dest.display());
    println!("  export_dir:   {}", export_dir.display());
    println!("  db:           {}", db.display());

    let import_stats = import::import_export(
        &export_dir,
        &db,
        &assets_dir,
        &contacts_csv,
        &exclude_csv,
        true,
        ImportMode::Replace,
        "imessage",
    )?;

    let priority: Vec<String> = cfg.sources.iter().map(|s| s.id.clone()).collect();
    let dedupe_stats = dedupe::run_dedupe(&db, &priority, 2)?;

    Ok(ResetDemoStats {
        import: import_stats,
        dedupe_keys_filled: dedupe_stats.keys_filled,
    })
}

fn restore_demo_csvs(bundle: &Path, cfg: &Config) -> Result<()> {
    let demo_contacts = bundle.join("config/contacts.csv");
    let demo_exclude = bundle.join("config/exclude.csv");
    copy_if_exists(&demo_contacts, &cfg.paths.contacts_csv)?;
    copy_if_exists(&demo_exclude, &cfg.paths.exclude_csv)?;
    Ok(())
}

fn copy_if_exists(from: &Path, to: &Path) -> Result<()> {
    if !from.is_file() {
        return Ok(());
    }
    if from == to {
        return Ok(());
    }
    if fs::canonicalize(from).ok() == fs::canonicalize(to).ok() {
        return Ok(());
    }
    if let Some(parent) = to.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }
    fs::copy(from, to).with_context(|| format!("copy {} → {}", from.display(), to.display()))?;
    Ok(())
}

fn wipe_vault(cfg: &Config) -> Result<()> {
    remove_db_files(&cfg.paths.db)?;
    for src in &cfg.sources {
        let assets = src.resolved_assets_dir(&cfg.paths);
        let converted = src.resolved_assets_converted_dir(&cfg.paths);
        remove_tree_if_exists(&assets)?;
        remove_tree_if_exists(&converted)?;
    }
    Ok(())
}

fn remove_db_files(db: &Path) -> Result<()> {
    for path in [db.to_path_buf(), db.with_extension("db-wal"), db.with_extension("db-shm")] {
        if path.is_file() {
            fs::remove_file(&path)
                .with_context(|| format!("remove {}", path.display()))?;
        }
    }
    Ok(())
}

fn remove_tree_if_exists(path: &Path) -> Result<()> {
    if path.exists() {
        fs::remove_dir_all(path).with_context(|| format!("remove {}", path.display()))?;
    }
    Ok(())
}
