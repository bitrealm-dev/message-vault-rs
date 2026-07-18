use anyhow::{bail, Result};
use clap::Parser;
use csv_ingest::{convert_directory, detect_export_source, resolve_converter_script};
use std::path::PathBuf;

#[derive(Debug, Parser)]
#[command(
    name = "csv-ingest",
    about = "Convert per-conversation CSV to vault NDJSON (Python converters)"
)]
struct Cli {
    /// Directory (or single .csv) of exporter CSV output
    #[arg(long)]
    input: PathBuf,

    /// Directory for NDJSON `.json` files (default: same as --input)
    #[arg(long)]
    output: Option<PathBuf>,

    /// Source id (`go-sms-pro`, `imessage`, `imazing`, …). Detected from CSV when omitted.
    #[arg(long)]
    source_id: Option<String>,
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    let output = cli.output.unwrap_or_else(|| cli.input.clone());

    let source_id = match cli.source_id {
        Some(id) => id,
        None => detect_export_source(&cli.input)?
            .ok_or_else(|| anyhow::anyhow!("could not detect source; pass --source-id"))?,
    };

    let script = resolve_converter_script(&source_id)?;
    let report = convert_directory(&cli.input, &output, &source_id)?;
    println!("Wrote NDJSON under {}", output.display());
    println!("  source:        {source_id}");
    println!("  python:        {}", script.display());
    println!("  conversations: {}", report.conversations);
    println!("  messages:      {}", report.messages);
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
