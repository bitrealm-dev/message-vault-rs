//! Parse GO SMS Pro `gosms_sys*.xml` SMS backups.

use crate::emoji::decode_gosms_emojis;
use crate::phone::{parse_google_voice_voicemail_caller, sanitize_number};
use anyhow::{Context, Result};
use serde::Deserialize;
use std::path::Path;

#[derive(Debug, Deserialize)]
#[serde(rename = "GoSms")]
struct GoSmsFile {
    #[serde(rename = "SMS", default)]
    sms: Vec<SmsElement>,
}

#[derive(Debug, Deserialize)]
struct SmsElement {
    address: Option<String>,
    #[serde(rename = "contactName")]
    contact_name: Option<String>,
    date: Option<String>,
    #[serde(rename = "type")]
    msg_type: Option<String>,
    body: Option<String>,
}

#[derive(Debug, Clone)]
pub struct XmlMessage {
    /// Other-party digits (sanitized).
    pub other_digits: String,
    pub name_hint: Option<String>,
    pub timestamp_secs: f64,
    pub is_from_me: bool,
    /// Sender digits when not from me.
    pub sender_digits: Option<String>,
    pub text: String,
}

#[derive(Debug, Default)]
pub struct XmlParseStats {
    pub messages: u64,
    pub sent: u64,
    pub received: u64,
    pub skipped_invalid_date: u64,
    pub skipped_unknown_type: u64,
}

pub fn parse_xml_file(path: &Path, owner_digits: &str) -> Result<(Vec<XmlMessage>, XmlParseStats)> {
    let text = std::fs::read_to_string(path)
        .with_context(|| format!("failed to read {}", path.display()))?;
    parse_xml_str(&text, owner_digits)
}

pub fn parse_xml_str(text: &str, owner_digits: &str) -> Result<(Vec<XmlMessage>, XmlParseStats)> {
    let file: GoSmsFile = quick_xml::de::from_str(text).context("failed to parse GoSms XML")?;
    let mut stats = XmlParseStats::default();
    let mut out = Vec::new();

    for sms in file.sms {
        stats.messages += 1;
        let addr = sanitize_number(sms.address.as_deref().unwrap_or(""));
        let contact = sms.contact_name.unwrap_or_default();
        let body = decode_gosms_emojis(sms.body.as_deref().unwrap_or(""));
        let date_ms = sms.date.as_deref().unwrap_or("0");
        let timestamp_secs = match date_ms.parse::<f64>() {
            Ok(ms) => ms / 1000.0,
            Err(_) => {
                stats.skipped_invalid_date += 1;
                continue;
            }
        };
        let typ = sms.msg_type.as_deref().unwrap_or("").trim();

        let msg = match typ {
            "2" => {
                stats.sent += 1;
                XmlMessage {
                    other_digits: addr.clone(),
                    name_hint: non_empty(&contact),
                    timestamp_secs,
                    is_from_me: true,
                    sender_digits: None,
                    text: body,
                }
            }
            "1" => {
                stats.received += 1;
                if let Some(caller) = parse_google_voice_voicemail_caller(&body) {
                    XmlMessage {
                        other_digits: caller.clone(),
                        name_hint: Some(caller.clone()),
                        timestamp_secs,
                        is_from_me: false,
                        sender_digits: Some(caller),
                        text: body,
                    }
                } else {
                    let hint = if contact.is_empty() {
                        None
                    } else {
                        Some(contact)
                    };
                    XmlMessage {
                        other_digits: addr.clone(),
                        name_hint: hint,
                        timestamp_secs,
                        is_from_me: false,
                        sender_digits: Some(addr),
                        text: body,
                    }
                }
            }
            _ => {
                stats.skipped_unknown_type += 1;
                continue;
            }
        };

        // Drop threads with no usable other party.
        if msg.other_digits == "Unknown" {
            continue;
        }
        // Owner digits unused beyond future checks; keep for API symmetry.
        let _ = owner_digits;
        out.push(msg);
    }

    Ok((out, stats))
}

fn non_empty(s: &str) -> Option<String> {
    let t = s.trim();
    if t.is_empty() {
        None
    } else {
        Some(t.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_sent_and_received() {
        let xml = r#"<?xml version="1.0"?>
<GoSms>
  <SMSCount>2</SMSCount>
  <SMS>
    <address>+14075551234</address>
    <contactName>Alice</contactName>
    <date>1400773261000</date>
    <type>1</type>
    <body>hello +g1f602</body>
  </SMS>
  <SMS>
    <address>+14075551234</address>
    <contactName>Alice</contactName>
    <date>1400773321000</date>
    <type>2</type>
    <body>hi back</body>
  </SMS>
</GoSms>"#;
        let (msgs, stats) = parse_xml_str(xml, "9412660605").unwrap();
        assert_eq!(stats.messages, 2);
        assert_eq!(stats.received, 1);
        assert_eq!(stats.sent, 1);
        assert_eq!(msgs.len(), 2);
        assert!(!msgs[0].is_from_me);
        assert_eq!(msgs[0].text, "hello 😂");
        assert_eq!(msgs[0].other_digits, "4075551234");
        assert!(msgs[1].is_from_me);
    }
}
