mod assets;
mod import;
mod models;
mod ndjson;
mod schema;

use std::path::PathBuf;

use anyhow::Result;
use clap::{Parser, Subcommand};

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
        /// Directory containing NDJSON conversation files
        #[arg(long, default_value = "sources/imessage/2026-05-15/export")]
        export_dir: PathBuf,

        /// Output SQLite database path
        #[arg(long, default_value = "data/imessage.db")]
        db: PathBuf,

        /// Content-addressed asset store directory
        #[arg(long, default_value = "data/assets")]
        assets_dir: PathBuf,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Import {
            export_dir,
            db,
            assets_dir,
        } => {
            let stats = import::import_export(&export_dir, &db, &assets_dir)?;
            println!("Imported into {}", db.display());
            println!("  assets dir:    {}", assets_dir.display());
            println!("  files:         {}", stats.files);
            println!("  conversations: {}", stats.conversations);
            println!("  participants:  {}", stats.participants);
            println!("  messages:      {}", stats.messages);
            println!("  attachments:   {}", stats.attachments);
            println!("  tapbacks:      {}", stats.tapbacks);
            println!("  assets copied: {}", stats.assets_copied);
            println!("  assets deduped:{}", stats.assets_deduped);
            println!("  assets missing:{}", stats.assets_missing);
        }
    }

    Ok(())
}
