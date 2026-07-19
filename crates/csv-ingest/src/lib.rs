//! Convert per-conversation CSV into vault NDJSON via Python converters.
//!
//! CSV is the human checkpoint: inspect and correct (or re-export) before convert.
//! Contact / phone lookup belongs in the backup→CSV step or in the user’s edits.
//! This crate reshapes CSV into vault JSON and can push it to a remote vault
//! (`vault-push` binary). See `CSV_INGEST.md`.

mod convert;
pub mod push;
pub mod sources;

pub use convert::{
    convert_directory, detect_export_source, detect_export_tool_version, has_converter,
    known_source_ids, resolve_converter_script, ConvertReport,
};
pub use sources::{source_display_label, source_info, SourceInfo, SOURCES};
