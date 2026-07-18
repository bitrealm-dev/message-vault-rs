use anyhow::{bail, Result};
use clap::Parser;
use csv_ingest::{
    convert_directory, detect_export_source, resolve_mapping_path, Mapping,
};
use std::path::PathBuf;

#[derive(Debug, Parser)]
#[command(
    name = "csv-ingest",
    about = "Convert per-conversation CSV (+ mapping) to imessage-shaped NDJSON"
)]
struct Cli {
    /// Directory (or single .csv) of exporter CSV output
    #[arg(long)]
    input: PathBuf,

    /// Directory for NDJSON `.json` files (default: same as --input)
    #[arg(long)]
    output: Option<PathBuf>,

    /// Path to mapping TOML
    #[arg(long)]
    mapping: Option<PathBuf>,

    /// Source id to load bundled mapping (`mappings/{id}.toml`)
    #[arg(long)]
    source_id: Option<String>,
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    let output = cli.output.unwrap_or_else(|| cli.input.clone());

    let source_id = cli.source_id.or_else(|| {
        detect_export_source(&cli.input)
            .ok()
            .flatten()
    });

    let mapping_path = resolve_mapping_path(cli.mapping.as_deref(), source_id.as_deref())?;
    let mapping = Mapping::load(&mapping_path)?;

    if let Some(ref detected) = source_id {
        if detected != &mapping.export_source && detected != &mapping.source_id {
            eprintln!(
                "warning: export_source={detected} but mapping is for {}",
                mapping.source_id
            );
        }
    }

    let report = convert_directory(&cli.input, &output, &mapping)?;
    println!("Wrote NDJSON under {}", output.display());
    println!("  mapping:       {}", mapping_path.display());
    println!("  source:        {}", mapping.source_id);
    println!("  exporter:      {}", mapping.exporter_version);
    println!("  conversations: {}", report.conversations);
    println!("  messages:      {}", report.messages);
    if report.rows_skipped > 0 {
        println!("  rows skipped:  {}", report.rows_skipped);
    }
    if !report.errors.is_empty() {
        println!("  file errors:   {}", report.errors.len());
        for err in report.errors.iter().take(10) {
            println!("    {err}");
        }
        if report.conversations == 0 {
            bail!("conversion produced no conversations");
        }
    }
    Ok(())
}
