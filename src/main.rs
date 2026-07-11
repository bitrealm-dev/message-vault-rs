mod assets;
mod config;
mod contacts;
mod exclude;
mod import;
mod models;
mod ndjson;
mod schema;
mod vcf;
mod vcf_to_contacts;

use std::path::PathBuf;

use anyhow::{bail, Result};
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

        /// Optional message-vault filter-people.csv (sets Historical tag / exclude / tags)
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
                    println!("  contact tags:  {}", stats.contact_tag_links);
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
            println!("  tag links:    {}", stats.tags);
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
