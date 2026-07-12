//! Shared NDJSON interchange schemas for message archives.
//!
//! - [`imessage`] — iOS / iMessage schema (historically imessage-exporter-json v3)
//! - [`sms`] — common SMS/MMS schema for Android backup exporters

pub mod imessage;
pub mod sms;
