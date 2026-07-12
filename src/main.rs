mod assets;
mod config;
mod contacts;
mod dedupe;
mod exclude;
mod export_markdown;
mod import;
mod ingest;
mod models;
mod ndjson;
mod schema;
mod vcf;
mod vcf_to_contacts;

use std::path::PathBuf;

use anyhow::{bail, Context, Result};
use clap::{Parser, Subcommand};

use crate::config::Config;

#[derive(Parser)]
#[command(name = "message-vault-rs")]
#[command(about = "Import and view messages in SQLite")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Export raw source data, import into the vault, then soft-dedupe across sources
    Ingest {
        /// Configured source id (imessage, go-sms-pro, sms-backup-plus, sms-backup-restore)
        source: String,

        /// Path to raw source data (iPhone backup, XML export, EML tree, …).
        /// Optional when the source has `source_dir` set in config.
        #[arg(long)]
        from: Option<PathBuf>,

        /// Path to config.toml
        #[arg(long, default_value = "config/config.toml")]
        config: PathBuf,

        /// Override staging/output dir (defaults to the source's export_dir)
        #[arg(long)]
        staging_dir: Option<PathBuf>,

        /// Import mode: replace (wipe this source's messages) or append
        #[arg(long, default_value = "replace")]
        mode: String,

        /// Reload contacts CSV even if the table is non-empty
        #[arg(long)]
        overwrite_contacts: bool,

        /// Skip the cross-source soft-dedupe pass
        #[arg(long)]
        skip_dedupe: bool,

        /// Near-time window in seconds for Pass B (default 2)
        #[arg(long, default_value_t = 2)]
        window_secs: i64,
    },

    /// Import NDJSON export(s) into SQLite
    Import {
        /// Path to config.toml
        #[arg(long, default_value = "config/config.toml")]
        config: PathBuf,

        /// Import one configured source by id
        #[arg(long)]
        source: Option<String>,

        /// Import every configured source
        #[arg(long)]
        all: bool,

        /// Directory containing NDJSON conversation files (overrides selected source export_dir)
        #[arg(long)]
        export_dir: Option<PathBuf>,

        /// Output SQLite database path (overrides config)
        #[arg(long)]
        db: Option<PathBuf>,

        /// Originals asset store directory (overrides selected source assets dir)
        #[arg(long)]
        assets_dir: Option<PathBuf>,

        /// Contacts CSV path (overrides config; default config/contacts.csv)
        #[arg(long)]
        contacts_csv: Option<PathBuf>,

        /// Blacklist CSV path (overrides config)
        #[arg(long)]
        blacklist_csv: Option<PathBuf>,

        /// Delete and reload contacts from CSV even if the table is non-empty
        #[arg(long)]
        overwrite_contacts: bool,

        /// Import mode: replace (wipe this source's messages) or append (dedupe by source+guid)
        #[arg(long, default_value = "replace")]
        mode: String,
    },

    /// Soft-hide the same SMS when it appears under more than one import source
    DedupeCrossSource {
        /// Path to config.toml
        #[arg(long, default_value = "config/config.toml")]
        config: PathBuf,

        /// Output SQLite database path (overrides config)
        #[arg(long)]
        db: Option<PathBuf>,

        /// Near-time window in seconds for Pass B (default 2)
        #[arg(long, default_value_t = 2)]
        window_secs: i64,
    },

    /// Load contacts from config/contacts.csv (or --contacts-csv) into the database
    ImportContacts {
        /// Path to config.toml
        #[arg(long, default_value = "config/config.toml")]
        config: PathBuf,

        /// Contacts CSV path (overrides config; default config/contacts.csv)
        #[arg(long)]
        contacts_csv: Option<PathBuf>,

        /// Output SQLite database path (overrides config)
        #[arg(long)]
        db: Option<PathBuf>,
    },

    /// Export 1:1 contacts as Obsidian bubble markdown (combined / soft-deduped)
    ExportMarkdown {
        /// Output directory (required; written fresh under this path)
        #[arg(long)]
        out: PathBuf,

        /// Path to config.toml
        #[arg(long, default_value = "config/config.toml")]
        config: PathBuf,

        /// SQLite database path (overrides config)
        #[arg(long)]
        db: Option<PathBuf>,

        /// Path to Obsidian bubble CSS snippet (default config/obsidian-message-vault.css)
        #[arg(long)]
        snippet_css: Option<PathBuf>,
    },

    /// Convert a message-vault contacts.vcf into contacts.csv
    VcfToContacts {
        /// Path to config.toml (used for default --out / --blacklist)
        #[arg(long, default_value = "config/config.toml")]
        config: PathBuf,

        /// Input contacts.vcf
        #[arg(long)]
        vcf: PathBuf,

        /// Output contacts.csv (defaults to paths.contacts_csv from config)
        #[arg(long)]
        out: Option<PathBuf>,

        /// Optional message-vault blacklist.csv (sets exclude=true; defaults to paths.blacklist_csv)
        #[arg(long)]
        blacklist: Option<PathBuf>,

        /// Optional message-vault filter-people.csv (sets Historical group / exclude / groups)
        #[arg(long)]
        filter_people: Option<PathBuf>,

        /// Overwrite --out if it already exists
        #[arg(long)]
        force: bool,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Ingest {
            source,
            from,
            config,
            staging_dir,
            mode,
            overwrite_contacts,
            skip_dedupe,
            window_secs,
        } => {
            let cfg = Config::load(&config)?;
            if window_secs < 0 {
                bail!("--window-secs must be >= 0");
            }
            let mode = import::ImportMode::parse(&mode)?;
            let src = cfg.source(&source)?;
            let from = match from {
                Some(p) => p,
                None => src.source_dir.clone().with_context(|| {
                    format!(
                        "ingest '{source}' needs --from, or set source_dir on that [[sources]] entry in {}",
                        config.display()
                    )
                })?,
            };

            let stats = ingest::ingest(
                &cfg,
                &ingest::IngestOptions {
                    source_id: source,
                    from,
                    staging_dir,
                    mode,
                    overwrite_contacts,
                    skip_dedupe,
                    window_secs,
                },
            )?;

            println!();
            println!("Import into {}", cfg.paths.db.display());
            println!("  staging:       {}", stats.staging_dir.display());
            if let Some(archive) = &stats.rotated_to {
                println!("  rotated from:  {}", archive.display());
            }
            println!("  files:         {}", stats.import.files);
            println!("  conversations: {}", stats.import.conversations);
            println!("  messages:      {}", stats.import.messages);
            println!("  messages deduped: {}", stats.import.messages_deduped);
            if stats.import.mode == "append" {
                println!("  messages appended: {}", stats.import.messages_appended);
            }
            println!("  attachments:   {}", stats.import.attachments);
            println!("  assets copied: {}", stats.import.assets_copied);
            println!("  assets missing:{}", stats.import.assets_missing);
            if let Some(d) = stats.dedupe {
                println!("Cross-source dedupe");
                println!("  keys filled:   {}", d.keys_filled);
                println!("  exact groups:  {}", d.exact_groups);
                println!("  exact flagged: {}", d.exact_flagged);
                println!("  near flagged:  {}", d.near_flagged);
            } else {
                println!("Cross-source dedupe skipped (--skip-dedupe)");
            }
        }

        Commands::Import {
            config,
            source,
            all,
            export_dir,
            db,
            assets_dir,
            contacts_csv,
            blacklist_csv,
            overwrite_contacts,
            mode,
        } => {
            let cfg = Config::load(&config)?;
            let db = db.unwrap_or_else(|| cfg.paths.db.clone());
            let contacts_csv = contacts_csv.unwrap_or_else(|| cfg.paths.contacts_csv.clone());
            let blacklist_csv = blacklist_csv.unwrap_or_else(|| cfg.paths.blacklist_csv.clone());
            let mode = import::ImportMode::parse(&mode)?;

            if all && source.is_some() {
                bail!("use either --source <id> or --all, not both");
            }

            let sources: Vec<&config::SourceConfig> = if all {
                cfg.sources.iter().collect()
            } else if let Some(id) = source.as_deref() {
                vec![cfg.source(id)?]
            } else if cfg.sources.len() == 1 {
                vec![&cfg.sources[0]]
            } else {
                bail!(
                    "multiple sources configured; pass --source <id> or --all (ids: {})",
                    cfg.sources
                        .iter()
                        .map(|s| s.id.as_str())
                        .collect::<Vec<_>>()
                        .join(", ")
                );
            };

            if sources.len() > 1 && (export_dir.is_some() || assets_dir.is_some()) {
                bail!("--export-dir / --assets-dir only apply when importing a single source");
            }

            println!("Importing into {}", db.display());
            println!("  config:        {}", config.display());
            println!("  mode:          {}", mode.as_str());
            println!(
                "  owner:         {} ({})",
                cfg.owner.display_name, cfg.owner.phone_e164
            );
            println!("  contacts csv:  {}", contacts_csv.display());
            println!("  blacklist csv: {}", blacklist_csv.display());

            let mut overwrite = overwrite_contacts;
            for src in sources {
                let export = export_dir
                    .clone()
                    .unwrap_or_else(|| src.export_dir.clone());
                let assets = assets_dir
                    .clone()
                    .unwrap_or_else(|| src.resolved_assets_dir(&cfg.paths));

                let stats = import::import_export(
                    &export,
                    &db,
                    &assets,
                    &contacts_csv,
                    &blacklist_csv,
                    overwrite,
                    mode,
                    &src.id,
                )?;
                // Only overwrite contacts on the first source of a batch.
                overwrite = false;

                println!();
                println!("Source '{}'", src.id);
                println!("  export_dir:    {}", export.display());
                println!("  assets:        {}", assets.display());
                if stats.contacts_skipped {
                    println!("  contacts:      (skipped — already loaded; use --overwrite-contacts)");
                } else {
                    println!("  contacts:      {}", stats.contacts);
                    println!("  contact phones:{}", stats.contact_phones);
                    println!("  contact groups:{}", stats.contact_group_links);
                }
                println!("  files:         {}", stats.files);
                println!("  conversations: {}", stats.conversations);
                println!("  participants:  {}", stats.participants);
                println!("  messages:      {}", stats.messages);
                println!("  messages deduped: {}", stats.messages_deduped);
                if stats.mode == "append" {
                    println!("  messages appended: {}", stats.messages_appended);
                }
                println!("  attachments:   {}", stats.attachments);
                println!("  tapbacks:      {}", stats.tapbacks);
                println!("  excl. convos:  {}", stats.conversations_excluded);
                println!("  excl. msgs:    {}", stats.messages_excluded);
                println!("  excl. parts:   {}", stats.participants_excluded);
                println!("  assets copied: {}", stats.assets_copied);
                println!("  assets deduped:{}", stats.assets_deduped);
                println!("  assets missing:{}", stats.assets_missing);
            }
        }

        Commands::DedupeCrossSource {
            config,
            db,
            window_secs,
        } => {
            let cfg = Config::load(&config)?;
            let db = db.unwrap_or_else(|| cfg.paths.db.clone());
            let priority: Vec<String> = cfg.sources.iter().map(|s| s.id.clone()).collect();
            if window_secs < 0 {
                bail!("--window-secs must be >= 0");
            }

            println!("Cross-source dedupe on {}", db.display());
            println!("  config:       {}", config.display());
            println!("  window_secs:  {}", window_secs);
            println!("  priority:     {}", priority.join(", "));

            let stats = dedupe::run_dedupe(&db, &priority, window_secs)?;
            println!("  keys filled:  {}", stats.keys_filled);
            println!("  exact groups: {}", stats.exact_groups);
            println!("  exact flagged:{}", stats.exact_flagged);
            println!("  near flagged: {}", stats.near_flagged);
        }

        Commands::ImportContacts {
            config,
            contacts_csv,
            db,
        } => {
            let cfg = Config::load(&config)?;
            let db = db.unwrap_or(cfg.paths.db);
            let contacts_csv = contacts_csv.unwrap_or(cfg.paths.contacts_csv);

            if let Some(parent) = db.parent() {
                if !parent.as_os_str().is_empty() {
                    std::fs::create_dir_all(parent)?;
                }
            }

            let mut conn = rusqlite::Connection::open(&db)?;
            conn.execute_batch("PRAGMA foreign_keys = ON;")?;
            let stats = contacts::load_contacts_if_needed(&mut conn, &contacts_csv, true)?;

            println!("Imported contacts into {}", db.display());
            println!("  config:       {}", config.display());
            println!("  contacts csv: {}", contacts_csv.display());
            println!("  contacts:     {}", stats.contacts);
            println!("  phones:       {}", stats.phones);
            println!("  group links:  {}", stats.groups);
        }

        Commands::ExportMarkdown {
            out,
            config,
            db,
            snippet_css,
        } => {
            let cfg = Config::load(&config)?;
            let db = db.unwrap_or_else(|| cfg.paths.db.clone());
            let snippet_css = snippet_css.unwrap_or_else(|| {
                PathBuf::from("config/obsidian-message-vault.css")
            });
            if !snippet_css.is_file() {
                bail!(
                    "CSS snippet not found at {} (pass --snippet-css)",
                    snippet_css.display()
                );
            }

            let mut assets_by_source = std::collections::HashMap::new();
            for src in &cfg.sources {
                assets_by_source
                    .insert(src.id.clone(), src.resolved_assets_dir(&cfg.paths));
            }

            println!("Export markdown → {}", out.display());
            println!("  config:  {}", config.display());
            println!("  db:      {}", db.display());
            println!("  snippet: {}", snippet_css.display());

            let stats = export_markdown::run_export(
                &db,
                &cfg.owner,
                &assets_by_source,
                &out,
                &snippet_css,
            )?;
            println!("  people:        {}", stats.people);
            println!("  year pages:    {}", stats.year_pages);
            println!("  messages:      {}", stats.messages);
            println!("  assets copied: {}", stats.assets_copied);
            println!("  assets missing:{}", stats.assets_missing);
            println!(
                "Enable CSS snippet message-vault-bubbles in Obsidian (Settings → Appearance)."
            );
        }

        Commands::VcfToContacts {
            config,
            vcf,
            out,
            blacklist,
            filter_people,
            force,
        } => {
            let cfg = Config::load(&config)?;
            let out = out.unwrap_or(cfg.paths.contacts_csv);
            let blacklist = blacklist.or(Some(cfg.paths.blacklist_csv));

            let stats = vcf_to_contacts::convert(
                &vcf,
                &out,
                blacklist.as_deref(),
                filter_people.as_deref(),
                force,
            )?;
            println!("Wrote {}", out.display());
            println!("  vcf cards:        {}", stats.cards_total);
            println!("  skipped (no TEL): {}", stats.cards_skipped_no_tel);
            println!("  blacklist-only:   {}", stats.blacklist_only);
            println!("  contacts written: {}", stats.contacts_written);
        }
    }

    Ok(())
}
