use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

use anyhow::{Context, Result};

use crate::models::ExportRecord;

/// Read an imessage-exporter NDJSON file, yielding one typed record per non-empty line.
pub fn read_records(path: &Path) -> Result<Vec<ExportRecord>> {
    let file = File::open(path)
        .with_context(|| format!("failed to open {}", path.display()))?;
    let reader = BufReader::new(file);
    let mut records = Vec::new();

    for (line_no, line) in reader.lines().enumerate() {
        let line = line.with_context(|| {
            format!("failed to read line {} of {}", line_no + 1, path.display())
        })?;
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let record: ExportRecord = serde_json::from_str(line).with_context(|| {
            format!(
                "failed to parse line {} of {}",
                line_no + 1,
                path.display()
            )
        })?;
        records.push(record);
    }

    Ok(records)
}
