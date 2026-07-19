//! Dispatch CSV → vault NDJSON conversion to Python converters.

use anyhow::{bail, Context, Result};
use csv::Reader;
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Default)]
pub struct ConvertReport {
    pub conversations: u64,
    pub messages: u64,
    pub rows_skipped: u64,
    pub errors: Vec<String>,
}

/// source_id → Python script under `python/` (one file per source).
const CONVERTERS: &[(&str, &str)] = &[
    ("go-sms-pro", "go_sms_pro_to_vault.py"),
    ("sms-backup-plus", "sms_backup_plus_to_vault.py"),
    ("sms-backup-restore", "sms_backup_restore_to_vault.py"),
    ("imessage", "imessage_to_vault.py"),
    ("imazing", "imazing_to_vault.py"),
];

fn python_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("python")
}

fn pythonpath_env() -> std::ffi::OsString {
    let dir = python_dir();
    match std::env::var_os("PYTHONPATH") {
        Some(existing) => std::env::join_paths([dir.as_os_str(), existing.as_os_str()])
            .unwrap_or_else(|_| dir.into_os_string()),
        None => dir.into_os_string(),
    }
}

/// Path to the Python converter for `source_id`.
pub fn resolve_converter_script(source_id: &str) -> Result<PathBuf> {
    let Some((_, script)) = CONVERTERS.iter().find(|(id, _)| *id == source_id) else {
        bail!(
            "no csv converter for source_id={source_id} (known: {})",
            known_source_ids()
                .into_iter()
                .collect::<Vec<_>>()
                .join(", ")
        );
    };
    let path = python_dir().join(script);
    if !path.is_file() {
        bail!("python converter not found: {}", path.display());
    }
    Ok(path)
}

/// Whether a Python converter is registered for this source id.
pub fn has_converter(source_id: &str) -> bool {
    CONVERTERS.iter().any(|(id, _)| *id == source_id)
}

/// Convert every `*.csv` under `input` into `*.json` NDJSON under `output`.
pub fn convert_directory(
    input: &Path,
    output: &Path,
    source_id: &str,
) -> Result<ConvertReport> {
    if !input.exists() {
        bail!("input does not exist: {}", input.display());
    }
    fs::create_dir_all(output)
        .with_context(|| format!("create output {}", output.display()))?;

    let script = resolve_converter_script(source_id)?;
    let mut cmd = Command::new("python3");
    cmd.arg(&script)
        .arg("--input")
        .arg(input)
        .arg("--output")
        .arg(output)
        .arg("--source-id")
        .arg(source_id)
        // Ensure `import vault_common` resolves next to the script.
        .env("PYTHONPATH", pythonpath_env());

    let out = cmd
        .output()
        .with_context(|| format!("spawn python3 {}", script.display()))?;
    let stderr = String::from_utf8_lossy(&out.stderr);
    let stdout = String::from_utf8_lossy(&out.stdout);
    if !out.status.success() {
        bail!(
            "python converter failed ({}):\n{}\n{}",
            out.status,
            stdout.trim(),
            stderr.trim()
        );
    }

    let mut report = ConvertReport::default();
    if let Some((c, m)) = parse_python_summary(&stderr).or_else(|| parse_python_summary(&stdout))
    {
        report.conversations = c;
        report.messages = m;
    } else {
        count_ndjson_outputs(output, &mut report)?;
    }
    if report.conversations == 0 {
        bail!(
            "no conversations written from {} (errors in converter output)",
            input.display()
        );
    }
    Ok(report)
}

fn parse_python_summary(text: &str) -> Option<(u64, u64)> {
    for line in text.lines().rev() {
        let line = line.trim();
        if !line.starts_with("done ") {
            continue;
        }
        let mut conversations = None;
        let mut messages = None;
        for part in line.split_whitespace() {
            if let Some(v) = part.strip_prefix("conversations=") {
                conversations = v.parse().ok();
            } else if let Some(v) = part.strip_prefix("messages=") {
                messages = v.parse().ok();
            }
        }
        if let (Some(c), Some(m)) = (conversations, messages) {
            return Some((c, m));
        }
    }
    None
}

fn count_ndjson_outputs(output: &Path, report: &mut ConvertReport) -> Result<()> {
    let mut paths = Vec::new();
    if output.is_file() {
        paths.push(output.to_path_buf());
    } else {
        for entry in fs::read_dir(output).with_context(|| format!("read {}", output.display()))? {
            let path = entry?.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                paths.push(path);
            }
        }
    }
    for path in paths {
        let file = File::open(&path).with_context(|| format!("open {}", path.display()))?;
        let mut msgs = 0u64;
        let mut saw_conversation = false;
        for line in BufReader::new(file).lines() {
            let line = line?;
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            if line.contains(r#""record":"conversation""#) {
                saw_conversation = true;
            } else if line.contains(r#""record":"message""#) {
                msgs += 1;
            }
        }
        if saw_conversation && msgs > 0 {
            report.conversations += 1;
            report.messages += msgs;
        }
    }
    Ok(())
}

fn collect_csv_paths(input: &Path) -> Result<Vec<PathBuf>> {
    if input.is_file() {
        if input
            .extension()
            .and_then(|e| e.to_str())
            .is_some_and(|e| e.eq_ignore_ascii_case("csv"))
        {
            return Ok(vec![input.to_path_buf()]);
        }
        bail!("input file is not .csv: {}", input.display());
    }
    let mut paths: Vec<PathBuf> = fs::read_dir(input)
        .with_context(|| format!("read {}", input.display()))?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.is_file()
                && p.extension()
                    .and_then(|e| e.to_str())
                    .is_some_and(|e| e.eq_ignore_ascii_case("csv"))
        })
        .collect();
    paths.sort();
    Ok(paths)
}

/// Detect `export_source` / source id from the first CSV under `input`.
pub fn detect_export_source(input: &Path) -> Result<Option<String>> {
    let paths = collect_csv_paths(input)?;
    let Some(path) = paths.first() else {
        return Ok(None);
    };
    let mut rdr = Reader::from_path(path)?;
    let headers = rdr.headers()?.clone();
    if headers.iter().any(|h| h == "Chat Session")
        && headers.iter().any(|h| h == "Message Date")
        && headers.iter().any(|h| h == "Sender ID")
    {
        return Ok(Some("imazing".into()));
    }
    let idx = headers.iter().position(|h| h == "export_source");
    let Some(i) = idx else {
        return Ok(None);
    };
    if let Some(Ok(row)) = rdr.records().next() {
        if let Some(v) = row.get(i) {
            let v = v.trim();
            if !v.is_empty() {
                return Ok(Some(v.to_string()));
            }
        }
    }
    Ok(None)
}

pub fn known_source_ids() -> HashSet<&'static str> {
    CONVERTERS.iter().map(|(id, _)| *id).collect()
}
