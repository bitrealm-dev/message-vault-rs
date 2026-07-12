use std::path::PathBuf;

use anyhow::Result;
use clap::Parser;
use sms_backup_restore_exporter::convert_export;

#[derive(Parser, Debug)]
#[command(name = "sms-backup-restore-exporter")]
#[command(about = "Convert SMS Backup & Restore XML to message-json SMS schema NDJSON")]
struct Cli {
    /// Path to a sms-*.xml file or a directory of XML files
    #[arg(long)]
    input: PathBuf,

    /// Output directory for NDJSON + attachments/
    #[arg(long)]
    output: PathBuf,

    /// Owner phone (E.164 or digits). Required so sent/received and groups are correct.
    #[arg(long)]
    owner_phone: String,
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    let report = convert_export(&cli.input, &cli.output, &cli.owner_phone)?;

    println!("Wrote {}", cli.output.display());
    println!("  conversations:     {}", report.conversations);
    println!("  SMS messages:      {}", report.sms_count);
    println!("  MMS messages:      {}", report.mms_count);
    println!("  attachments:       {}", report.attachments_saved);
    println!("  sent / received:   {} / {}", report.sent, report.received);
    if report.skipped_invalid_date > 0 {
        println!("  skipped bad date:  {}", report.skipped_invalid_date);
    }
    if report.skipped_unknown_address > 0 {
        println!("  skipped bad addr:  {}", report.skipped_unknown_address);
    }
    if report.skipped_unknown_type > 0 {
        println!("  skipped bad type:  {}", report.skipped_unknown_type);
    }
    if report.skipped_empty_participants > 0 {
        println!(
            "  skipped no participants: {}",
            report.skipped_empty_participants
        );
    }
    if report.skipped_bad_attachment > 0 {
        println!("  skipped bad att:   {}", report.skipped_bad_attachment);
    }
    if !report.errors.is_empty() {
        println!("  errors:            {}", report.errors.len());
        for err in report.errors.iter().take(10) {
            println!("    {err}");
        }
    }
    Ok(())
}
