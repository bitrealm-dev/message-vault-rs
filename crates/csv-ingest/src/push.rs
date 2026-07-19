//! Chunked `vault-push` engine: convert CSV, POST one conversation at a time, checkpoint + report.

use std::collections::BTreeSet;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone)]
pub struct PushConfig {
    pub input: PathBuf,
    pub output: PathBuf,
    pub source_id: String,
    pub base_url: String,
    pub token: String,
    pub account: String,
    /// "append" or "replace"
    pub mode: String,
    pub dedupe: bool,
    pub skip_convert: bool,
    pub continue_on_error: bool,
    pub force_repush: bool,
    pub report_path: PathBuf,
    pub log_path: PathBuf,
    pub checkpoint_path: PathBuf,
    pub max_retries: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileResult {
    pub file: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(default)]
    pub messages: u64,
    #[serde(default)]
    pub attachments: u64,
    #[serde(default)]
    pub assets_copied: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushReport {
    pub ok: bool,
    pub source: String,
    pub account: String,
    pub mode: String,
    pub started_at: String,
    pub finished_at: String,
    pub conversations_total: u64,
    pub conversations_ok: u64,
    pub conversations_failed: u64,
    pub conversations_skipped: u64,
    pub messages: u64,
    pub assets_copied: u64,
    pub assets_missing: u64,
    pub results: Vec<FileResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct Checkpoint {
    source: String,
    account: String,
    done: BTreeSet<String>,
}

#[derive(Debug, Deserialize)]
pub struct PushResponse {
    pub ok: bool,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub messages: u64,
    #[serde(default)]
    pub conversations: u64,
    #[serde(default)]
    pub attachments: u64,
    #[serde(default)]
    pub assets_copied: u64,
    #[serde(default)]
    pub assets_missing: u64,
}

#[derive(Debug, Clone)]
pub struct PushRequest {
    pub base_url: String,
    pub token: String,
    pub source: String,
    pub account: String,
    pub mode: String,
    pub dedupe: bool,
    pub ndjson: Vec<u8>,
    pub files: Vec<(String, PathBuf)>,
}

fn now_rfc3339() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{secs}")
}

fn list_json_files(dir: &Path) -> Result<Vec<PathBuf>> {
    let mut paths: Vec<PathBuf> = fs::read_dir(dir)
        .with_context(|| format!("read {}", dir.display()))?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.extension()
                .and_then(|e| e.to_str())
                .is_some_and(|e| e.eq_ignore_ascii_case("json"))
                && p.file_name()
                    .and_then(|n| n.to_str())
                    .is_some_and(|n| {
                        n != "vault-push-report.json" && n != "vault-push-done.json"
                    })
        })
        .collect();
    paths.sort();
    Ok(paths)
}

/// Collect unique attachment paths referenced in vault NDJSON.
pub fn attachment_paths_from_ndjson(ndjson: &[u8]) -> Result<BTreeSet<String>> {
    let mut paths = BTreeSet::new();
    for (i, line) in ndjson.split(|&b| b == b'\n').enumerate() {
        let line = line.trim_ascii();
        if line.is_empty() {
            continue;
        }
        let v: Value = serde_json::from_slice(line)
            .with_context(|| format!("parse NDJSON line {}", i + 1))?;
        let Some(atts) = v.get("attachments").and_then(|a| a.as_array()) else {
            continue;
        };
        for att in atts {
            if let Some(p) = att.get("path").and_then(|p| p.as_str()) {
                let p = p.trim();
                if !p.is_empty() {
                    paths.insert(p.to_string());
                }
            }
        }
    }
    Ok(paths)
}

/// One attachment file ready for multipart upload.
#[derive(Debug, Clone)]
pub struct ResolvedAttachment {
    /// Path string for multipart `filename` (and NDJSON after rewrite).
    pub wire_path: String,
    pub abs_path: PathBuf,
    /// Original path from NDJSON (may differ from `wire_path` for absolute sources).
    pub original_path: String,
}

/// Resolve attachment paths from message data.
///
/// Lookup order for each path string:
/// 1. Absolute path on disk (if the string is absolute)
/// 2. `export_root / path`
/// 3. `alongside / path` (e.g. directory containing the conversation JSON/CSV)
///
/// Returns `(found, missing_original_paths)`. For absolute hits, `wire_path` is a
/// relative name suitable for multipart (relative to export_root when possible,
/// otherwise basename under `attachments/`).
pub fn resolve_attachment_files(
    export_root: &Path,
    paths: &BTreeSet<String>,
    alongside: Option<&Path>,
) -> (Vec<ResolvedAttachment>, Vec<String>) {
    let mut found = Vec::new();
    let mut missing = Vec::new();
    for original in paths {
        match resolve_one_attachment(export_root, alongside, original) {
            Some(resolved) => found.push(resolved),
            None => missing.push(original.clone()),
        }
    }
    (found, missing)
}

fn resolve_one_attachment(
    export_root: &Path,
    alongside: Option<&Path>,
    original: &str,
) -> Option<ResolvedAttachment> {
    let candidate = Path::new(original);

    if candidate.is_absolute() {
        if candidate.is_file() {
            let wire_path = wire_path_for_absolute(export_root, candidate);
            return Some(ResolvedAttachment {
                wire_path,
                abs_path: candidate.to_path_buf(),
                original_path: original.to_string(),
            });
        }
        return None;
    }

    let under_root = export_root.join(candidate);
    if under_root.is_file() {
        return Some(ResolvedAttachment {
            wire_path: original.to_string(),
            abs_path: under_root,
            original_path: original.to_string(),
        });
    }

    if let Some(base) = alongside {
        let under_alongside = base.join(candidate);
        if under_alongside.is_file() {
            return Some(ResolvedAttachment {
                wire_path: original.to_string(),
                abs_path: under_alongside,
                original_path: original.to_string(),
            });
        }
    }

    None
}

fn wire_path_for_absolute(export_root: &Path, abs: &Path) -> String {
    if let Ok(rel) = abs.strip_prefix(export_root) {
        let s = rel.to_string_lossy().replace('\\', "/");
        if !s.is_empty() {
            return s;
        }
    }
    let name = abs
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("attachment.bin");
    format!("attachments/{name}")
}

/// Rewrite `attachments[].path` in NDJSON when wire names differ from originals.
pub fn rewrite_ndjson_attachment_paths(ndjson: &[u8], renames: &[(String, String)]) -> Result<Vec<u8>> {
    if renames.is_empty() || renames.iter().all(|(a, b)| a == b) {
        return Ok(ndjson.to_vec());
    }
    let map: std::collections::HashMap<&str, &str> = renames
        .iter()
        .filter(|(a, b)| a != b)
        .map(|(a, b)| (a.as_str(), b.as_str()))
        .collect();
    if map.is_empty() {
        return Ok(ndjson.to_vec());
    }

    let mut out = Vec::with_capacity(ndjson.len());
    for (i, line) in ndjson.split(|&b| b == b'\n').enumerate() {
        let line = line.trim_ascii();
        if line.is_empty() {
            continue;
        }
        let mut v: Value = serde_json::from_slice(line)
            .with_context(|| format!("parse NDJSON line {} for path rewrite", i + 1))?;
        if let Some(atts) = v.get_mut("attachments").and_then(|a| a.as_array_mut()) {
            for att in atts {
                if let Some(p) = att.get("path").and_then(|p| p.as_str()) {
                    if let Some(new_p) = map.get(p) {
                        att.as_object_mut()
                            .context("attachment must be object")?
                            .insert("path".into(), Value::String((*new_p).to_string()));
                    }
                }
            }
        }
        serde_json::to_writer(&mut out, &v)?;
        out.push(b'\n');
    }
    Ok(out)
}

fn load_checkpoint(path: &Path, source: &str, account: &str) -> Checkpoint {
    let Ok(text) = fs::read_to_string(path) else {
        return Checkpoint {
            source: source.to_string(),
            account: account.to_string(),
            done: BTreeSet::new(),
        };
    };
    let cp: Checkpoint = serde_json::from_str(&text).unwrap_or_default();
    if cp.source != source || cp.account != account {
        return Checkpoint {
            source: source.to_string(),
            account: account.to_string(),
            done: BTreeSet::new(),
        };
    }
    cp
}

fn save_checkpoint(path: &Path, cp: &Checkpoint) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let text = serde_json::to_string_pretty(cp)?;
    fs::write(path, text).with_context(|| format!("write checkpoint {}", path.display()))
}

struct LogWriter {
    file: File,
}

impl LogWriter {
    fn open(path: &Path) -> Result<Self> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .with_context(|| format!("open log {}", path.display()))?;
        Ok(Self { file })
    }

    fn line(&mut self, msg: &str) {
        let _ = writeln!(self.file, "{msg}");
        let _ = self.file.flush();
        println!("{msg}");
    }
}

#[derive(Debug, Deserialize)]
struct AuthCheckResponse {
    ok: bool,
    #[serde(default)]
    account_id: Option<String>,
    #[serde(default)]
    #[allow(dead_code)]
    username: Option<String>,
    #[serde(default)]
    account_ok: Option<bool>,
    #[serde(default)]
    admin: Option<bool>,
    #[serde(default)]
    error: Option<String>,
}

fn looks_like_uuid(s: &str) -> bool {
    let s = s.trim();
    if s.len() != 36 {
        return false;
    }
    let b = s.as_bytes();
    if b[8] != b'-' || b[13] != b'-' || b[18] != b'-' || b[23] != b'-' {
        return false;
    }
    s.chars()
        .enumerate()
        .all(|(i, c)| matches!(i, 8 | 13 | 18 | 23) || c.is_ascii_hexdigit())
}

/// Resolve account UUID via `GET /v1/auth/check`.
///
/// `account` may be a username or UUID. User tokens omit it and bind from the token.
/// Always returns the vault `accounts.id` UUID for import.
pub fn resolve_account(base_url: &str, token: &str, account: Option<&str>) -> Result<String> {
    let base = base_url.trim_end_matches('/');
    let mut url = format!("{base}/v1/auth/check");
    let account = account.map(str::trim).filter(|s| !s.is_empty());
    if let Some(a) = account {
        url.push_str(&format!("?account={}", urlencoding_encode(a)));
    }
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .context("build HTTP client")?;
    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .with_context(|| format!("GET {url}"))?;
    let status = response.status();
    let text = response.text().context("read auth/check body")?;
    if status.as_u16() == 401 {
        bail!("invalid API token");
    }
    if status.as_u16() == 403 {
        bail!("account does not match token: {text}");
    }
    if !status.is_success() {
        bail!("auth/check failed (HTTP {status}): {text}");
    }
    let parsed: AuthCheckResponse = serde_json::from_str(&text)
        .with_context(|| format!("parse auth/check JSON: {text}"))?;
    if !parsed.ok {
        bail!(
            "auth/check rejected: {}",
            parsed.error.unwrap_or_else(|| text)
        );
    }
    if let Some(id) = parsed.account_id.filter(|s| !s.is_empty()) {
        if parsed.admin == Some(true) {
            if account.is_none() {
                bail!("admin API token requires --account <username or uuid>");
            }
            if parsed.account_ok == Some(false) && !looks_like_uuid(&id) {
                bail!(
                    "account not found: {} (use an existing username or account UUID)",
                    account.unwrap_or(id.as_str())
                );
            }
        }
        return Ok(id);
    }
    if parsed.admin == Some(true) {
        bail!("admin API token requires --account <username or uuid>");
    }
    bail!("auth/check did not return account_id; pass --account or use a user API token from Settings");
}

/// POST multipart import to `{base}/v1/import?...`.
pub fn post_multipart_import(req: &PushRequest) -> Result<PushResponse> {
    let base = req.base_url.trim_end_matches('/');
    let mut url = format!(
        "{base}/v1/import?source={}&account={}&mode={}",
        urlencoding_encode(&req.source),
        urlencoding_encode(&req.account),
        urlencoding_encode(&req.mode),
    );
    if req.dedupe {
        url.push_str("&dedupe=true");
    }

    let mut form = reqwest::blocking::multipart::Form::new().part(
        "ndjson",
        reqwest::blocking::multipart::Part::bytes(req.ndjson.clone())
            .file_name("import.json")
            .mime_str("application/x-ndjson")
            .context("ndjson mime")?,
    );

    for (rel, abs) in &req.files {
        let part = reqwest::blocking::multipart::Part::file(abs)
            .with_context(|| format!("open attachment {}", abs.display()))?
            .file_name(rel.clone())
            .mime_str("application/octet-stream")
            .context("file mime")?;
        form = form.part("file", part);
    }

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(600))
        .build()
        .context("build HTTP client")?;

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", req.token))
        .multipart(form)
        .send()
        .with_context(|| format!("POST {url}"))?;

    let status = response.status();
    let text = response.text().context("read response body")?;
    let parsed: PushResponse = serde_json::from_str(&text).unwrap_or(PushResponse {
        ok: false,
        error: Some(text.clone()),
        messages: 0,
        conversations: 0,
        attachments: 0,
        assets_copied: 0,
        assets_missing: 0,
    });

    if !status.is_success() || !parsed.ok {
        let err = parsed
            .error
            .clone()
            .unwrap_or_else(|| format!("HTTP {status}: {text}"));
        bail!("{err}");
    }
    Ok(parsed)
}

fn post_with_retries(req: &PushRequest, max_retries: u32, log: &mut LogWriter) -> Result<PushResponse> {
    let mut attempt = 0u32;
    loop {
        attempt += 1;
        match post_multipart_import(req) {
            Ok(r) => return Ok(r),
            Err(e) => {
                if attempt > max_retries {
                    return Err(e);
                }
                log.line(&format!(
                    "retry {attempt}/{max_retries} after error: {e}"
                ));
                thread::sleep(Duration::from_secs(u64::from(attempt)));
            }
        }
    }
}

/// Run chunked convert + push. Returns report; caller should exit non-zero if `!report.ok`.
pub fn run_push(cfg: &PushConfig) -> Result<PushReport> {
    let started_at = now_rfc3339();
    let mut log = LogWriter::open(&cfg.log_path)?;

    let account = if cfg.account.trim().is_empty() {
        let resolved = resolve_account(&cfg.base_url, &cfg.token, None)?;
        log.line(&format!("resolved account={resolved} from API token"));
        resolved
    } else {
        cfg.account.clone()
    };
    // Use a local cfg-like values for the rest of the run
    let mut cfg = cfg.clone();
    cfg.account = account;

    log.line(&format!(
        "vault-push start source={} account={} mode={} input={}",
        cfg.source_id,
        cfg.account,
        cfg.mode,
        cfg.input.display()
    ));

    let input_root = if cfg.input.is_file() {
        cfg.input
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| PathBuf::from("."))
    } else {
        cfg.input.clone()
    };

    if !cfg.skip_convert {
        let report = crate::convert_directory(&cfg.input, &cfg.output, &cfg.source_id)?;
        log.line(&format!(
            "converted conversations={} messages={}",
            report.conversations, report.messages
        ));
        if report.conversations == 0 && !report.errors.is_empty() {
            bail!("conversion produced no conversations");
        }
    }

    let ndjson_dir = if cfg.output.is_file() {
        cfg.output
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| PathBuf::from("."))
    } else {
        cfg.output.clone()
    };

    let json_files = list_json_files(&ndjson_dir)?;
    if json_files.is_empty() {
        bail!("no .json NDJSON files under {}", ndjson_dir.display());
    }

    let mut checkpoint = if cfg.force_repush || cfg.mode == "replace" {
        Checkpoint {
            source: cfg.source_id.clone(),
            account: cfg.account.clone(),
            done: BTreeSet::new(),
        }
    } else {
        load_checkpoint(&cfg.checkpoint_path, &cfg.source_id, &cfg.account)
    };

    let total = json_files.len();
    let mut results = Vec::new();
    let mut ok_n = 0u64;
    let mut fail_n = 0u64;
    let mut skip_n = 0u64;
    let mut messages = 0u64;
    let mut assets_copied = 0u64;
    let mut assets_missing = 0u64;
    let mut first_post = true;
    let mut aborted = false;

    for (idx, path) in json_files.iter().enumerate() {
        let n = idx + 1;
        let name = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("?")
            .to_string();

        if cfg.mode == "append" && !cfg.force_repush && checkpoint.done.contains(&name) {
            skip_n += 1;
            log.line(&format!("PROGRESS {n}/{total} skip {name} (already imported)"));
            results.push(FileResult {
                file: name,
                status: "skipped".into(),
                error: None,
                messages: 0,
                attachments: 0,
                assets_copied: 0,
            });
            continue;
        }

        let mut ndjson = Vec::new();
        File::open(path)
            .with_context(|| format!("open {}", path.display()))?
            .read_to_end(&mut ndjson)?;
        if !ndjson.ends_with(b"\n") {
            ndjson.push(b'\n');
        }

        let att_paths = attachment_paths_from_ndjson(&ndjson)?;
        let alongside = path.parent();
        let (resolved, missing) =
            resolve_attachment_files(&input_root, &att_paths, alongside);
        if !missing.is_empty() {
            let err = format!("missing attachment: {}", missing.join(", "));
            fail_n += 1;
            log.line(&format!("PROGRESS {n}/{total} fail {name} {err}"));
            results.push(FileResult {
                file: name,
                status: "failed".into(),
                error: Some(err),
                messages: 0,
                attachments: 0,
                assets_copied: 0,
            });
            if !cfg.continue_on_error {
                aborted = true;
                break;
            }
            continue;
        }

        let renames: Vec<(String, String)> = resolved
            .iter()
            .map(|r| (r.original_path.clone(), r.wire_path.clone()))
            .collect();
        let ndjson = rewrite_ndjson_attachment_paths(&ndjson, &renames)?;
        let files: Vec<(String, PathBuf)> = resolved
            .into_iter()
            .map(|r| (r.wire_path, r.abs_path))
            .collect();

        let mode = if cfg.mode == "replace" && first_post {
            "replace"
        } else {
            "append"
        };

        let req = PushRequest {
            base_url: cfg.base_url.clone(),
            token: cfg.token.clone(),
            source: cfg.source_id.clone(),
            account: cfg.account.clone(),
            mode: mode.to_string(),
            dedupe: cfg.dedupe,
            ndjson,
            files,
        };

        match post_with_retries(&req, cfg.max_retries, &mut log) {
            Ok(resp) => {
                first_post = false;
                ok_n += 1;
                messages += resp.messages;
                assets_copied += resp.assets_copied;
                assets_missing += resp.assets_missing;
                checkpoint.done.insert(name.clone());
                let _ = save_checkpoint(&cfg.checkpoint_path, &checkpoint);
                log.line(&format!(
                    "PROGRESS {n}/{total} ok {name} msgs={} files={}",
                    resp.messages, resp.attachments
                ));
                results.push(FileResult {
                    file: name,
                    status: "ok".into(),
                    error: None,
                    messages: resp.messages,
                    attachments: resp.attachments,
                    assets_copied: resp.assets_copied,
                });
            }
            Err(e) => {
                fail_n += 1;
                let err = e.to_string();
                log.line(&format!("PROGRESS {n}/{total} fail {name} {err}"));
                results.push(FileResult {
                    file: name,
                    status: "failed".into(),
                    error: Some(err),
                    messages: 0,
                    attachments: 0,
                    assets_copied: 0,
                });
                if !cfg.continue_on_error {
                    aborted = true;
                    break;
                }
            }
        }
    }

    let finished_at = now_rfc3339();
    let report = PushReport {
        ok: fail_n == 0 && !aborted,
        source: cfg.source_id.clone(),
        account: cfg.account.clone(),
        mode: cfg.mode.clone(),
        started_at,
        finished_at,
        conversations_total: total as u64,
        conversations_ok: ok_n,
        conversations_failed: fail_n,
        conversations_skipped: skip_n,
        messages,
        assets_copied,
        assets_missing,
        results,
    };

    if let Some(parent) = cfg.report_path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(
        &cfg.report_path,
        serde_json::to_string_pretty(&report)?,
    )
    .with_context(|| format!("write report {}", cfg.report_path.display()))?;

    log.line("vault-push finished");
    log.line(&format!("  conversations ok:     {}", report.conversations_ok));
    log.line(&format!(
        "  conversations failed: {}",
        report.conversations_failed
    ));
    log.line(&format!(
        "  conversations skipped:{}",
        report.conversations_skipped
    ));
    log.line(&format!("  messages:             {}", report.messages));
    log.line(&format!("  assets copied:        {}", report.assets_copied));
    log.line(&format!("  report: {}", cfg.report_path.display()));
    if report.conversations_failed > 0 {
        log.line("  failed:");
        for r in &report.results {
            if r.status == "failed" {
                log.line(&format!(
                    "    {}  {}",
                    r.file,
                    r.error.as_deref().unwrap_or("?")
                ));
            }
        }
    }

    Ok(report)
}

fn urlencoding_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => {
                out.push('%');
                out.push_str(&format!("{b:02X}"));
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn resolve_relative_under_export_root() {
        let dir = tempdir().unwrap();
        let media = dir.path().join("media");
        fs::create_dir_all(&media).unwrap();
        let file = media.join("a.jpg");
        fs::write(&file, b"x").unwrap();

        let paths = BTreeSet::from(["media/a.jpg".into()]);
        let (found, missing) = resolve_attachment_files(dir.path(), &paths, None);
        assert!(missing.is_empty());
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].wire_path, "media/a.jpg");
        assert_eq!(found[0].abs_path, file);
    }

    #[test]
    fn resolve_relative_alongside_conversation() {
        let dir = tempdir().unwrap();
        let nested = dir.path().join("chats").join("one");
        fs::create_dir_all(&nested).unwrap();
        let file = nested.join("pic.png");
        fs::write(&file, b"x").unwrap();

        let paths = BTreeSet::from(["pic.png".into()]);
        let (found, missing) = resolve_attachment_files(dir.path(), &paths, Some(&nested));
        assert!(missing.is_empty());
        assert_eq!(found[0].wire_path, "pic.png");
        assert_eq!(found[0].abs_path, file);
    }

    #[test]
    fn resolve_absolute_path() {
        let dir = tempdir().unwrap();
        let outside = tempdir().unwrap();
        let file = outside.path().join("abs.jpg");
        fs::write(&file, b"x").unwrap();

        let paths = BTreeSet::from([file.to_string_lossy().to_string()]);
        let (found, missing) = resolve_attachment_files(dir.path(), &paths, None);
        assert!(missing.is_empty());
        assert_eq!(found[0].wire_path, "attachments/abs.jpg");
        assert_eq!(found[0].abs_path, file);
    }

    #[test]
    fn rewrite_absolute_paths_in_ndjson() {
        let ndjson = br#"{"schema":"vault","attachments":[{"path":"/tmp/x.jpg"}]}"#;
        let renames = vec![("/tmp/x.jpg".into(), "attachments/x.jpg".into())];
        let out = rewrite_ndjson_attachment_paths(ndjson, &renames).unwrap();
        let text = String::from_utf8(out).unwrap();
        assert!(text.contains("attachments/x.jpg"));
        assert!(!text.contains("/tmp/x.jpg"));
    }
}
