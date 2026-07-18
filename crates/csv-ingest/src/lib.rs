//! Convert per-conversation CSV (+ source mapping) into vault NDJSON.

mod convert;
mod mapping;

pub use convert::{
    convert_directory, detect_export_source, known_source_ids, resolve_mapping_path, ConvertReport,
};
pub use mapping::Mapping;
