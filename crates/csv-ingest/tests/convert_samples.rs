use csv_ingest::{convert_directory, Mapping};
use message_json::vault::ExportRecord;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn mapping(name: &str) -> Mapping {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("mappings")
        .join(format!("{name}.toml"));
    Mapping::load(&path).unwrap_or_else(|e| panic!("load {name}: {e:#}"))
}

fn convert_sample_dir(sample_rel: &str, mapping_name: &str) -> (u64, PathBuf) {
    let input = repo_root().join(sample_rel);
    assert!(input.is_dir(), "missing samples at {}", input.display());
    let out = tempfile::tempdir().unwrap();
    let report = convert_directory(&input, out.path(), &mapping(mapping_name)).unwrap();
    assert!(report.conversations >= 1);
    assert!(report.messages >= 1);
    (report.messages, out.keep())
}

fn read_first_json(dir: &Path) -> Vec<ExportRecord> {
    let mut jsons: Vec<_> = fs::read_dir(dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("json"))
        .collect();
    jsons.sort();
    assert!(!jsons.is_empty());
    let file = fs::File::open(&jsons[0]).unwrap();
    BufReader::new(file)
        .lines()
        .map(|l| serde_json::from_str(&l.unwrap()).unwrap())
        .collect()
}

fn message_line_raw(dir: &Path) -> String {
    let mut jsons: Vec<_> = fs::read_dir(dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("json"))
        .collect();
    jsons.sort();
    let file = fs::File::open(&jsons[0]).unwrap();
    BufReader::new(file)
        .lines()
        .map(|l| l.unwrap())
        .find(|l| l.contains(r#""record":"message""#))
        .expect("message line")
}

#[test]
fn converts_go_sms_pro_sample() {
    let (_n, out) = convert_sample_dir("crates/go-sms-pro-exporter-csv/samples", "go-sms-pro");
    let records = read_first_json(&out);
    match &records[0] {
        ExportRecord::Conversation(c) => {
            assert_eq!(c.schema, "vault");
            assert_eq!(c.schema_version, 1);
            assert!(!c.chat_identifier.is_empty());
        }
        _ => panic!("expected conversation header"),
    }
    assert!(records.iter().any(|r| matches!(r, ExportRecord::Message(_))));

    let raw = message_line_raw(&out);
    assert!(!raw.contains("tapbacks"), "android line should omit tapbacks: {raw}");
    assert!(!raw.contains("parts"), "android line should omit parts: {raw}");
    assert!(!raw.contains("send_effect"), "android line should omit send_effect: {raw}");
}

#[test]
fn converts_sms_backup_plus_sample() {
    let (_n, out) =
        convert_sample_dir("crates/sms-backup-plus-exporter-csv/samples", "sms-backup-plus");
    let records = read_first_json(&out);
    assert!(matches!(records[0], ExportRecord::Conversation(_)));
}

#[test]
fn converts_sms_backup_restore_sample() {
    let (_n, out) = convert_sample_dir(
        "crates/sms-backup-restore-exporter-csv/samples",
        "sms-backup-restore",
    );
    let records = read_first_json(&out);
    assert!(matches!(records[0], ExportRecord::Conversation(_)));
}

#[test]
fn converts_imessage_sample() {
    let (_n, out) = convert_sample_dir("crates/imessage-exporter-csv/samples", "imessage");
    let records = read_first_json(&out);
    match &records[0] {
        ExportRecord::Conversation(c) => {
            assert_eq!(c.service.as_deref(), Some("iMessage"));
        }
        _ => panic!("expected conversation"),
    }
    let tapback_msg = records.iter().find_map(|r| match r {
        ExportRecord::Message(m) if !m.tapbacks.is_empty() => Some(m),
        _ => None,
    });
    assert!(tapback_msg.is_some(), "expected a message with tapbacks");

    // Empty parts/edits from sample CSV must not appear on the wire.
    let file = fs::read_dir(&out)
        .unwrap()
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .find(|p| p.extension().and_then(|e| e.to_str()) == Some("json"))
        .unwrap();
    let body = fs::read_to_string(file).unwrap();
    for line in body.lines().filter(|l| l.contains(r#""record":"message""#)) {
        assert!(!line.contains(r#""parts":"#), "empty parts should be omitted: {line}");
        assert!(!line.contains(r#""edits":"#), "empty edits should be omitted: {line}");
    }
}

#[test]
fn rejects_csv_missing_timestamp() {
    let dir = tempfile::tempdir().unwrap();
    fs::write(
        dir.path().join("bad.csv"),
        "chat_identifier,direction,text\n+1555,incoming,hi\n",
    )
    .unwrap();
    let out = tempfile::tempdir().unwrap();
    let err = convert_directory(dir.path(), out.path(), &mapping("go-sms-pro")).unwrap_err();
    assert!(
        err.to_string().contains("no conversations"),
        "unexpected: {err:#}"
    );
}

#[test]
fn vault_hand_samples_parse() {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("samples/vault");
    let mut files: Vec<_> = fs::read_dir(&dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("json"))
        .collect();
    files.sort();
    assert!(
        files.len() >= 8,
        "expected vault shape samples, found {}",
        files.len()
    );
    for path in files {
        let file = fs::File::open(&path).unwrap();
        let mut saw_conversation = false;
        let mut saw_message = false;
        for line in BufReader::new(file).lines() {
            let line = line.unwrap();
            if line.trim().is_empty() {
                continue;
            }
            let rec: ExportRecord = serde_json::from_str(&line)
                .unwrap_or_else(|e| panic!("{}: {e} in {line}", path.display()));
            match rec {
                ExportRecord::Conversation(c) => {
                    assert_eq!(c.schema, "vault");
                    saw_conversation = true;
                }
                ExportRecord::Message(_) => saw_message = true,
            }
        }
        assert!(
            saw_conversation && saw_message,
            "{} missing conversation or message",
            path.display()
        );
    }
}
