//! Convert per-conversation CSV files to vault NDJSON.

use crate::mapping::Mapping;
use anyhow::{bail, Context, Result};
use chrono::Utc;
use csv::StringRecord;
use message_json::vault::{
    AttachmentRecord, ConversationRecord, EditEventRecord, ExportRecord, MessageRecord,
    ParticipantRecord, PartRecord, TapbackRecord, SCHEMA_NAME, SCHEMA_VERSION,
};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashSet};
use std::fs::{self, File};
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Default)]
pub struct ConvertReport {
    pub conversations: u64,
    pub messages: u64,
    pub rows_skipped: u64,
    pub errors: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct CsvAttachment {
    path: Option<String>,
    original_name: Option<String>,
    mime_type: Option<String>,
    #[serde(default)]
    is_sticker: bool,
    transcription: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CsvParticipant {
    handle: String,
    #[serde(default)]
    display_name: String,
}

#[derive(Debug, Deserialize)]
struct CsvTapback {
    #[serde(default)]
    part_index: i64,
    kind: String,
    emoji: Option<String>,
    reactor_handle: Option<String>,
    reactor_display_name: Option<String>,
}

/// Convert every `*.csv` under `input` into sibling `*.json` NDJSON under `output`.
pub fn convert_directory(input: &Path, output: &Path, mapping: &Mapping) -> Result<ConvertReport> {
    if !input.exists() {
        bail!("input does not exist: {}", input.display());
    }
    fs::create_dir_all(output)
        .with_context(|| format!("create output {}", output.display()))?;

    if mapping.is_python_backend() {
        return convert_directory_python(input, output, mapping);
    }

    let csv_paths = collect_csv_paths(input)?;
    if csv_paths.is_empty() {
        bail!("no .csv files under {}", input.display());
    }

    let mut report = ConvertReport::default();
    let exported_at = Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);

    for csv_path in csv_paths {
        match convert_one_csv(&csv_path, output, mapping, &exported_at) {
            Ok((msgs, skipped)) => {
                if msgs > 0 {
                    report.conversations += 1;
                    report.messages += msgs;
                }
                report.rows_skipped += skipped;
            }
            Err(err) => {
                report
                    .errors
                    .push(format!("{}: {err:#}", csv_path.display()));
            }
        }
    }

    if report.conversations == 0 {
        bail!(
            "no conversations written from {} (skipped_rows={} errors={})",
            input.display(),
            report.rows_skipped,
            report.errors.len()
        );
    }
    Ok(report)
}

/// Shell out to `python3` + mapping `python_script` (e.g. iMazing).
fn convert_directory_python(
    input: &Path,
    output: &Path,
    mapping: &Mapping,
) -> Result<ConvertReport> {
    let script = mapping
        .python_script_path()
        .context("python_script path")?;
    if !script.is_file() {
        bail!("python script not found: {}", script.display());
    }

    let mut cmd = Command::new("python3");
    cmd.arg(&script)
        .arg("--input")
        .arg(input)
        .arg("--output")
        .arg(output);
    if let Some(tz) = mapping.timezone.as_deref().filter(|s| !s.is_empty()) {
        cmd.arg("--timezone").arg(tz);
    }

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
    // Prefer script summary line; fall back to counting output JSON.
    if let Some((c, m)) = parse_python_summary(&stderr).or_else(|| parse_python_summary(&stdout))
    {
        report.conversations = c;
        report.messages = m;
    } else {
        count_ndjson_outputs(output, &mut report)?;
    }
    if report.conversations == 0 {
        bail!(
            "python converter wrote no conversations under {}",
            output.display()
        );
    }
    Ok(report)
}

fn parse_python_summary(text: &str) -> Option<(u64, u64)> {
    // done conversations=1 messages=4 errors=0
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

fn convert_one_csv(
    csv_path: &Path,
    output_dir: &Path,
    mapping: &Mapping,
    exported_at: &str,
) -> Result<(u64, u64)> {
    let mut rdr = csv::ReaderBuilder::new()
        .flexible(true)
        .from_path(csv_path)
        .with_context(|| format!("open {}", csv_path.display()))?;
    let headers = rdr.headers()?.clone();
    let header_index = header_map(&headers);

    let mut messages: Vec<MessageRecord> = Vec::new();
    let mut participants: BTreeMap<String, Option<String>> = BTreeMap::new();
    let mut chat_identifier = String::new();
    let mut conversation_type = String::from("individual");
    let mut group_title: Option<String> = None;
    let mut service = mapping.default_service.clone();
    let mut skipped = 0u64;

    for (row_idx, result) in rdr.records().enumerate() {
        let record = result.with_context(|| format!("row {} in {}", row_idx + 2, csv_path.display()))?;
        match row_to_message(&record, &header_index, mapping) {
            Ok((msg, meta)) => {
                if chat_identifier.is_empty() {
                    chat_identifier = meta.chat_identifier.clone();
                    if !meta.conversation_type.is_empty() {
                        conversation_type = meta.conversation_type;
                    }
                    if let Some(t) = meta.group_title.filter(|s| !s.is_empty()) {
                        group_title = Some(t);
                    }
                    if !meta.service.is_empty() {
                        service = meta.service;
                    }
                }
                for (handle, hint) in meta.participants {
                    let entry = participants.entry(handle).or_insert(None);
                    if entry.is_none() {
                        *entry = hint;
                    }
                }
                if !msg.is_from_me {
                    if let Some(ref sender) = msg.sender {
                        participants.entry(sender.clone()).or_insert(None);
                    }
                }
                if !chat_identifier.is_empty() {
                    participants
                        .entry(chat_identifier.clone())
                        .or_insert(None);
                }
                messages.push(msg);
            }
            Err(_) => skipped += 1,
        }
    }

    if chat_identifier.is_empty() || messages.is_empty() {
        bail!("no valid message rows");
    }

    // Prefer display names from sender_display_name already collected.
    let participant_records: Vec<ParticipantRecord> = participants
        .into_iter()
        .map(|(handle, name_hint)| ParticipantRecord { handle, name_hint })
        .collect();

    let header = ConversationRecord {
        schema: SCHEMA_NAME.to_string(),
        schema_version: SCHEMA_VERSION,
        chat_identifier: chat_identifier.clone(),
        service: Some(service),
        conversation_type,
        group_title,
        participants: participant_records,
        exported_at: Some(exported_at.to_string()),
    };

    let stem = csv_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("conversation");
    let out_path = output_dir.join(format!("{stem}.json"));
    let file = File::create(&out_path).with_context(|| format!("create {}", out_path.display()))?;
    let mut w = BufWriter::new(file);
    serde_json::to_writer(&mut w, &ExportRecord::Conversation(header))?;
    w.write_all(b"\n")?;
    for msg in &messages {
        serde_json::to_writer(&mut w, &ExportRecord::Message(msg.clone()))?;
        w.write_all(b"\n")?;
    }
    w.flush()?;
    Ok((messages.len() as u64, skipped))
}

struct RowMeta {
    chat_identifier: String,
    conversation_type: String,
    group_title: Option<String>,
    service: String,
    participants: Vec<(String, Option<String>)>,
}

fn header_map(headers: &StringRecord) -> BTreeMap<String, usize> {
    headers
        .iter()
        .enumerate()
        .map(|(i, h)| (h.to_string(), i))
        .collect()
}

fn cell<'a>(
    record: &'a StringRecord,
    index: &BTreeMap<String, usize>,
    csv_col: &str,
) -> &'a str {
    index
        .get(csv_col)
        .and_then(|&i| record.get(i))
        .unwrap_or("")
        .trim()
}

fn mapped_cell<'a>(
    record: &'a StringRecord,
    index: &BTreeMap<String, usize>,
    mapping: &Mapping,
    json_field: &str,
) -> &'a str {
    match mapping.csv_column_for_json(json_field) {
        Some(csv_col) => cell(record, index, csv_col),
        None => "",
    }
}

fn row_to_message(
    record: &StringRecord,
    index: &BTreeMap<String, usize>,
    mapping: &Mapping,
) -> Result<(MessageRecord, RowMeta)> {
    let chat_identifier = mapped_cell(record, index, mapping, "chat_identifier").to_string();
    let timestamp = mapped_cell(record, index, mapping, "timestamp").to_string();
    let timestamp_utc = mapped_cell(record, index, mapping, "timestamp_utc").to_string();
    let direction = mapped_cell(record, index, mapping, "direction").to_string();
    let text_raw = mapped_cell(record, index, mapping, "text").to_string();
    let guid_raw = mapped_cell(record, index, mapping, "guid").to_string();
    let service_cell = mapped_cell(record, index, mapping, "service");
    let sender_handle = mapped_cell(record, index, mapping, "sender").to_string();
    let sender_display_name = mapped_cell(record, index, mapping, "sender_display_name").to_string();
    let subject = mapped_cell(record, index, mapping, "subject").to_string();
    let conversation_type = mapped_cell(record, index, mapping, "conversation_type").to_string();
    let group_title = mapped_cell(record, index, mapping, "group_title").to_string();

    for req in &mapping.required.fields {
        let ok = match req.as_str() {
            "chat_identifier" => !chat_identifier.is_empty(),
            "timestamp" => !timestamp.is_empty() || !timestamp_utc.is_empty(),
            "direction" => !direction.is_empty(),
            other => !mapped_cell(record, index, mapping, other).is_empty(),
        };
        if !ok {
            bail!("missing required field {req}");
        }
    }

    let is_from_me = if mapping.transforms.direction_to_is_from_me {
        direction.eq_ignore_ascii_case("outgoing")
    } else {
        false
    };

    let attachments = if mapping.transforms.attachments_json_parse {
        parse_attachments(mapped_cell(record, index, mapping, "attachments"))?
    } else if mapping.transforms.attachments_filename_parse {
        parse_attachment_filename(
            mapped_cell(record, index, mapping, "attachments"),
            mapped_cell(record, index, mapping, "attachment_mime"),
        )
    } else {
        Vec::new()
    };

    let text = if text_raw.is_empty() {
        None
    } else {
        Some(text_raw.clone())
    };

    let is_announcement = parse_bool(mapped_cell(record, index, mapping, "is_announcement"));
    let announcement = nonempty(mapped_cell(record, index, mapping, "announcement"));

    if mapping.required.require_text_or_attachments
        && text.as_ref().is_none_or(|t| t.is_empty())
        && attachments.is_empty()
        && !(is_announcement && announcement.is_some())
    {
        bail!("row has neither text nor attachments");
    }

    let ts = if !timestamp.is_empty() {
        timestamp.clone()
    } else {
        timestamp_utc.clone()
    };

    let guid = if guid_raw.is_empty() {
        Some(stable_guid(
            &chat_identifier,
            &ts,
            is_from_me,
            text.as_deref().unwrap_or(""),
            &attachments,
        ))
    } else {
        Some(guid_raw)
    };

    let sender = if is_from_me || sender_handle.is_empty() {
        None
    } else {
        Some(sender_handle.clone())
    };

    let service = if service_cell.is_empty() {
        Some(mapping.default_service.clone())
    } else {
        Some(service_cell.to_string())
    };

    let tapbacks = if mapping.transforms.tapbacks_json_parse {
        parse_tapbacks(mapped_cell(record, index, mapping, "tapbacks"))?
    } else {
        Vec::new()
    };

    let parts = if mapping.transforms.parts_json_parse {
        parse_parts(mapped_cell(record, index, mapping, "parts"))?
    } else {
        Vec::new()
    };
    let edits = if mapping.transforms.edits_json_parse {
        parse_edits(mapped_cell(record, index, mapping, "edits"))?
    } else {
        Vec::new()
    };
    let app = if mapping.transforms.app_json_parse {
        parse_app(mapped_cell(record, index, mapping, "app"))?
    } else {
        None
    };

    let is_reply = parse_bool(mapped_cell(record, index, mapping, "is_reply"));
    let thread_originator_guid =
        nonempty(mapped_cell(record, index, mapping, "thread_originator_guid"));
    let thread_originator_part =
        parse_i64_opt(mapped_cell(record, index, mapping, "thread_originator_part"));
    let num_replies = parse_i64_opt(mapped_cell(record, index, mapping, "num_replies")).unwrap_or(0);

    let mut meta_participants = Vec::new();
    if mapping.transforms.participants_json_parse {
        if let Some(csv_col) = mapping.csv_column_for_json("participants") {
            let raw = cell(record, index, csv_col);
            if !raw.is_empty() {
                let parts: Vec<CsvParticipant> = serde_json::from_str(raw).unwrap_or_default();
                for p in parts {
                    let hint = if p.display_name.is_empty() {
                        None
                    } else {
                        Some(p.display_name)
                    };
                    meta_participants.push((p.handle, hint));
                }
            }
        }
    }
    if !sender_handle.is_empty() {
        let hint = if sender_display_name.is_empty() {
            None
        } else {
            Some(sender_display_name.clone())
        };
        meta_participants.push((sender_handle, hint));
    }

    let msg = MessageRecord {
        guid,
        timestamp: ts,
        timestamp_utc: if timestamp_utc.is_empty() {
            None
        } else {
            Some(timestamp_utc)
        },
        is_from_me,
        sender,
        service,
        subject: nonempty(&subject),
        text,
        read_receipt: nonempty(mapped_cell(record, index, mapping, "read_receipt")),
        is_deleted: parse_bool(mapped_cell(record, index, mapping, "is_deleted")),
        send_effect: nonempty(mapped_cell(record, index, mapping, "send_effect")),
        shared_location: nonempty(mapped_cell(record, index, mapping, "shared_location")),
        is_announcement,
        announcement,
        attachments,
        tapbacks,
        parts,
        edits,
        app,
        is_reply,
        thread_originator_guid,
        thread_originator_part,
        num_replies,
    };

    let meta = RowMeta {
        chat_identifier,
        conversation_type,
        group_title: if group_title.is_empty() {
            None
        } else {
            Some(group_title)
        },
        service: service_cell.to_string(),
        participants: meta_participants,
    };
    Ok((msg, meta))
}

fn parse_attachments(raw: &str) -> Result<Vec<AttachmentRecord>> {
    if raw.is_empty() || raw == "[]" || raw == "null" {
        return Ok(Vec::new());
    }
    let parsed: Vec<CsvAttachment> = serde_json::from_str(raw)
        .with_context(|| format!("parse attachments_json: {raw}"))?;
    Ok(parsed
        .into_iter()
        .map(|a| AttachmentRecord {
            path: a.path,
            original_name: a.original_name,
            mime_type: a.mime_type,
            is_sticker: a.is_sticker,
            transcription: a.transcription,
        })
        .collect())
}

/// iMazing-style single attachment filename (+ optional type label).
fn parse_attachment_filename(path: &str, mime_or_kind: &str) -> Vec<AttachmentRecord> {
    let path = path.trim();
    if path.is_empty() {
        return Vec::new();
    }
    let original_name = path
        .rsplit(['/', '\\'])
        .next()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let mime_type = nonempty(mime_or_kind);
    vec![AttachmentRecord {
        path: Some(path.to_string()),
        original_name,
        mime_type,
        is_sticker: false,
        transcription: None,
    }]
}

fn parse_tapbacks(raw: &str) -> Result<Vec<TapbackRecord>> {
    if raw.is_empty() || raw == "[]" || raw == "null" {
        return Ok(Vec::new());
    }
    let parsed: Vec<CsvTapback> =
        serde_json::from_str(raw).with_context(|| format!("parse tapbacks_json: {raw}"))?;
    Ok(parsed
        .into_iter()
        .map(|t| {
            let is_from_me = t.reactor_handle.as_ref().is_none_or(|h| h.is_empty())
                || t.reactor_display_name.as_deref() == Some("Me");
            TapbackRecord {
                part_index: t.part_index,
                kind: t.kind,
                emoji: t.emoji.filter(|e| !e.is_empty()),
                is_from_me,
                sender: t.reactor_handle.filter(|h| !h.is_empty()),
            }
        })
        .collect())
}

fn parse_parts(raw: &str) -> Result<Vec<PartRecord>> {
    if raw.is_empty() || raw == "[]" || raw == "null" {
        return Ok(Vec::new());
    }
    serde_json::from_str(raw).with_context(|| format!("parse parts_json: {raw}"))
}

fn parse_edits(raw: &str) -> Result<Vec<EditEventRecord>> {
    if raw.is_empty() || raw == "[]" || raw == "null" {
        return Ok(Vec::new());
    }
    serde_json::from_str(raw).with_context(|| format!("parse edits_json: {raw}"))
}

fn parse_app(raw: &str) -> Result<Option<serde_json::Value>> {
    let t = raw.trim();
    if t.is_empty() || t == "null" {
        return Ok(None);
    }
    let v: serde_json::Value =
        serde_json::from_str(t).with_context(|| format!("parse app_json: {raw}"))?;
    if v.is_null() {
        Ok(None)
    } else {
        Ok(Some(v))
    }
}

fn nonempty(s: &str) -> Option<String> {
    let t = s.trim();
    if t.is_empty() {
        None
    } else {
        Some(t.to_string())
    }
}

fn parse_bool(s: &str) -> bool {
    matches!(
        s.trim().to_ascii_lowercase().as_str(),
        "1" | "true" | "yes"
    )
}

fn parse_i64_opt(s: &str) -> Option<i64> {
    let t = s.trim();
    if t.is_empty() {
        None
    } else {
        t.parse().ok()
    }
}

fn stable_guid(
    chat_id: &str,
    timestamp: &str,
    is_from_me: bool,
    text: &str,
    attachments: &[AttachmentRecord],
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(chat_id.as_bytes());
    hasher.update(b"|");
    hasher.update(timestamp.as_bytes());
    hasher.update(b"|");
    hasher.update(if is_from_me { b"1" } else { b"0" });
    hasher.update(b"|");
    hasher.update(text.as_bytes());
    for a in attachments {
        hasher.update(b"|");
        if let Some(p) = &a.path {
            hasher.update(p.as_bytes());
        }
    }
    hex::encode(hasher.finalize())
}

/// Resolve mapping path: explicit path, or bundled `mappings/{source_id}.toml`.
pub fn resolve_mapping_path(explicit: Option<&Path>, source_id: Option<&str>) -> Result<PathBuf> {
    if let Some(p) = explicit {
        return Ok(p.to_path_buf());
    }
    let Some(id) = source_id else {
        bail!("provide --mapping or --source-id");
    };
    let bundled = Mapping::bundled_mapping_path(id);
    if bundled.is_file() {
        return Ok(bundled);
    }
    // Fallback: cwd-relative (vault ingest from repo root).
    let cwd = PathBuf::from(format!("crates/csv-ingest/mappings/{id}.toml"));
    if cwd.is_file() {
        return Ok(cwd);
    }
    bail!("no mapping for source_id={id} (tried {} and {})", bundled.display(), cwd.display());
}

/// Detect `export_source` / source id from the first CSV under `input`.
pub fn detect_export_source(input: &Path) -> Result<Option<String>> {
    let paths = collect_csv_paths(input)?;
    let Some(path) = paths.first() else {
        return Ok(None);
    };
    let mut rdr = csv::Reader::from_path(path)?;
    let headers = rdr.headers()?.clone();
    // iMazing Messages CSV (no export_source column).
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
    [
        "imessage",
        "sms-backup-plus",
        "sms-backup-restore",
        "go-sms-pro",
        "imazing",
    ]
        .into_iter()
        .collect()
}
