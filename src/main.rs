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

use anyhow::Result;
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
    /// Import imessage-exporter NDJSON into SQLite
    Import {
        /// Path to config.toml
        #[arg(long, default_value = "config/config.toml")]
        config: PathBuf,

        /// Directory containing NDJSON conversation files (overrides config)
        #[arg(long)]
        export_dir: Option<PathBuf>,

        /// Output SQLite database path (overrides config)
        #[arg(long)]
        db: Option<PathBuf>,

        /// Content-addressed asset store directory (overrides config)
        #[arg(long)]
        assets_dir: Option<PathBuf>,

        /// Contacts CSV path (overrides config)
        #[arg(long)]
        contacts_csv: Option<PathBuf>,

        /// Blacklist CSV path (overrides config)
        #[arg(long)]
        blacklist_csv: Option<PathBuf>,

        /// Delete and reload contacts from CSV even if the table is non-empty
        #[arg(long)]
        overwrite_contacts: bool,

        /// Import mode: replace (wipe production) or append (dedupe by guid)
        #[arg(long, default_value = "replace")]
        mode: String,
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
            export_dir,
            db,
            assets_dir,
            contacts_csv,
            blacklist_csv,
            overwrite_contacts,
            mode,
        } => {
            let cfg = Config::load(&config)?;
            let export_dir = export_dir.unwrap_or(cfg.paths.export_dir);
            let db = db.unwrap_or(cfg.paths.db);
            let assets_dir = assets_dir.unwrap_or(cfg.paths.assets_dir);
            let contacts_csv = contacts_csv.unwrap_or(cfg.paths.contacts_csv);
            let blacklist_csv = blacklist_csv.unwrap_or(cfg.paths.blacklist_csv);
            let mode = import::ImportMode::parse(&mode)?;

            let stats = import::import_export(
                &export_dir,
                &db,
                &assets_dir,
                &contacts_csv,
                &blacklist_csv,
                overwrite_contacts,
                mode,
            )?;
            println!("Imported into {}", db.display());
            println!("  config:        {}", config.display());
            println!("  mode:          {}", stats.mode);
            println!(
                "  owner:         {} ({})",
                cfg.owner.display_name, cfg.owner.phone_e164
            );
            println!("  assets dir:    {}", assets_dir.display());
            println!("  contacts csv:  {}", contacts_csv.display());
            println!("  blacklist csv: {}", blacklist_csv.display());
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
