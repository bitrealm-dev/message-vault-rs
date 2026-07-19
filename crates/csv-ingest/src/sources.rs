//! Catalog of vault-push / csv-ingest sources and the upstream export tools they target.

#[derive(Debug, Clone, Copy)]
pub struct SourceInfo {
    pub id: &'static str,
    /// Friendly product label for UI.
    pub label: &'static str,
    /// Upstream tool / app name written into export data.
    pub tool: &'static str,
    /// Upstream version string when known.
    pub tool_version: Option<&'static str>,
}

/// Known converters and the export tool versions they target.
pub const SOURCES: &[SourceInfo] = &[
    SourceInfo {
        id: "go-sms-pro",
        label: "GO SMS Pro",
        tool: "GO SMS Pro",
        tool_version: None,
    },
    SourceInfo {
        id: "imazing",
        label: "iMazing",
        tool: "iMazing",
        tool_version: Some("3.5.5"),
    },
    SourceInfo {
        id: "imessage",
        label: "iMessage",
        tool: "iMessage Exporter",
        tool_version: Some("4.2.0"),
    },
    SourceInfo {
        id: "sms-backup-plus",
        label: "SMS Backup+",
        tool: "SMS Backup+",
        tool_version: Some("1.5.11"),
    },
    SourceInfo {
        id: "sms-backup-restore",
        label: "SMS Backup & Restore",
        tool: "SMS Backup & Restore",
        tool_version: Some("10.26.003"),
    },
];

pub fn source_info(id: &str) -> Option<&'static SourceInfo> {
    SOURCES.iter().find(|s| s.id == id)
}

/// ComboBox / docs label: `iMessage — iMessage Exporter 4.2.0`
pub fn source_display_label(id: &str) -> String {
    match source_info(id) {
        Some(s) => match s.tool_version {
            Some(v) => format!("{} — {} {v}", s.label, s.tool),
            None => format!("{} — {}", s.label, s.tool),
        },
        None => id.to_string(),
    }
}
