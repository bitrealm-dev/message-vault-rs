use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::path::Path;

use anyhow::{bail, Context, Result};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Deserialize;

#[derive(Debug, Default)]
pub struct ContactLoadStats {
    pub contacts: u64,
    pub phones: u64,
    pub groups: u64,
    pub emails_restored: u64,
    pub skipped: bool,
}

#[derive(Debug, Deserialize)]
struct ContactCsvRow {
    phones: String,
    #[serde(default)]
    first_name: String,
    #[serde(default)]
    last_name: String,
    #[serde(default)]
    exclude: String,
    #[serde(default)]
    group_1: String,
    #[serde(default)]
    group_2: String,
    #[serde(default)]
    group_3: String,
    #[serde(default)]
    group_4: String,
    #[serde(default)]
    group_5: String,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct Contact {
    pub id: i64,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub exclude: bool,
    pub preferred_phone: Option<String>,
}

impl Contact {
    #[allow(dead_code)]
    pub fn display_name(&self) -> String {
        [self.first_name.as_deref(), self.last_name.as_deref()]
            .into_iter()
            .flatten()
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join(" ")
    }
}

/// iMessage-style: any handle containing `@` is treated as email.
fn is_email_handle(handle: &str) -> bool {
    handle.contains('@')
}

fn phone_handles_only(handles: &[String]) -> Vec<String> {
    handles
        .iter()
        .filter(|h| !is_email_handle(h))
        .cloned()
        .collect()
}

/// Emails attached to a contact, keyed for restore by that contact's phone set.
#[derive(Debug, Default)]
struct EmailSnapshot {
    /// One entry per contact that had emails: (phones on that contact, emails).
    entries: Vec<(HashSet<String>, Vec<String>)>,
}

fn snapshot_email_handles(conn: &Connection) -> Result<EmailSnapshot> {
    let mut by_contact: HashMap<i64, (HashSet<String>, Vec<String>)> = HashMap::new();
    let mut stmt = conn.prepare(
        "SELECT contact_id, phone_e164 FROM contact_phones ORDER BY contact_id, phone_e164",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
    })?;
    for row in rows {
        let (contact_id, handle) = row?;
        let entry = by_contact.entry(contact_id).or_default();
        if is_email_handle(&handle) {
            entry.1.push(handle);
        } else {
            entry.0.insert(handle);
        }
    }
    Ok(EmailSnapshot {
        entries: by_contact
            .into_values()
            .filter(|(_, emails)| !emails.is_empty())
            .collect(),
    })
}

fn restore_email_handles(
    conn: &Connection,
    snapshot: &EmailSnapshot,
) -> Result<u64> {
    if snapshot.entries.is_empty() {
        return Ok(0);
    }

    let mut restored = 0u64;
    for (phones, emails) in &snapshot.entries {
        let mut contact_id: Option<i64> = None;
        for phone in phones {
            let found: Option<i64> = conn
                .query_row(
                    "SELECT contact_id FROM contact_phones WHERE phone_e164 = ?1",
                    params![phone],
                    |row| row.get(0),
                )
                .optional()?;
            if let Some(id) = found {
                contact_id = Some(id);
                break;
            }
        }
        let Some(id) = contact_id else {
            continue;
        };
        for email in emails {
            let owner: Option<i64> = conn
                .query_row(
                    "SELECT contact_id FROM contact_phones WHERE phone_e164 = ?1",
                    params![email],
                    |row| row.get(0),
                )
                .optional()?;
            if let Some(existing) = owner {
                if existing != id {
                    eprintln!(
                        "warning: email handle {email} already belongs to contact {existing}; not restoring onto {id}"
                    );
                }
                continue;
            }
            conn.execute(
                "INSERT INTO contact_phones (phone_e164, contact_id) VALUES (?1, ?2)",
                params![email, id],
            )?;
            restored += 1;
        }
    }
    Ok(restored)
}

/// Load contacts from CSV when the table is empty, or when `overwrite` is true.
///
/// On overwrite, email handles already in SQLite are snapshotted by phone set and
/// reattached after CSV reload (contacts.csv is phone-only).
pub fn load_contacts_if_needed(
    conn: &mut Connection,
    csv_path: &Path,
    overwrite: bool,
) -> Result<ContactLoadStats> {
    // Ensure we can query contacts; recreate if the legacy schema is present.
    if conn
        .prepare("SELECT exclude FROM contacts LIMIT 1")
        .is_err()
    {
        crate::schema::recreate_contacts(conn)?;
    } else {
        crate::schema::ensure_contacts_schema(conn)?;
    }

    let count: i64 = conn.query_row("SELECT COUNT(*) FROM contacts", [], |row| row.get(0))?;

    if count > 0 && !overwrite {
        return Ok(ContactLoadStats {
            skipped: true,
            ..Default::default()
        });
    }

    let email_snapshot = if count > 0 && overwrite {
        snapshot_email_handles(conn)?
    } else {
        EmailSnapshot::default()
    };

    crate::schema::recreate_contacts(conn)?;

    if !csv_path.exists() {
        eprintln!(
            "warning: contacts CSV not found at {}; leaving contacts empty",
            csv_path.display()
        );
        return Ok(ContactLoadStats::default());
    }

    let mut stats = load_from_csv(conn, csv_path)?;
    stats.emails_restored = restore_email_handles(conn, &email_snapshot)?;
    if stats.emails_restored > 0 {
        eprintln!(
            "contacts: restored {} email handle(s) from previous DB (CSV is phone-only)",
            stats.emails_restored
        );
    }
    Ok(stats)
}

fn load_from_csv(conn: &mut Connection, csv_path: &Path) -> Result<ContactLoadStats> {
    let file = File::open(csv_path)
        .with_context(|| format!("failed to open contacts CSV {}", csv_path.display()))?;
    let mut reader = csv::Reader::from_reader(file);

    let mut stats = ContactLoadStats::default();
    let mut seen_phones: HashSet<String> = HashSet::new();
    let tx = conn.transaction()?;

    for (row_no, result) in reader.deserialize().enumerate() {
        let row_no = row_no + 2; // header is line 1
        let row: ContactCsvRow = result.with_context(|| {
            format!(
                "failed to parse contacts CSV row {row_no} in {}",
                csv_path.display()
            )
        })?;

        let raw_handles = split_list(&row.phones);
        for h in &raw_handles {
            if is_email_handle(h) {
                eprintln!(
                    "warning: contacts CSV row {row_no}: skipping email handle {h} (emails are DB-only)"
                );
            }
        }
        let phones = phone_handles_only(&raw_handles);

        if phones.is_empty() {
            bail!(
                "contacts CSV row {row_no}: phones is required ({})",
                csv_path.display()
            );
        }

        for phone in &phones {
            if !seen_phones.insert(phone.clone()) {
                bail!(
                    "contacts CSV: duplicate phone {phone} (row {row_no} in {})",
                    csv_path.display()
                );
            }
        }

        let preferred = phones[0].clone();
        let exclude = parse_bool(&row.exclude);
        let first_name = empty_to_none(&row.first_name);
        let last_name = empty_to_none(&row.last_name);

        tx.execute(
            r#"
            INSERT INTO contacts (
                first_name, last_name, exclude, preferred_phone
            ) VALUES (?1, ?2, ?3, ?4)
            "#,
            params![first_name, last_name, exclude as i64, preferred],
        )?;
        let contact_id = tx.last_insert_rowid();
        stats.contacts += 1;

        for phone in &phones {
            tx.execute(
                "INSERT INTO contact_phones (phone_e164, contact_id) VALUES (?1, ?2)",
                params![phone, contact_id],
            )?;
            stats.phones += 1;
        }

        for group_name in row_groups(&row) {
            let group_id = ensure_group(&tx, &group_name)?;
            tx.execute(
                "INSERT OR IGNORE INTO contact_group_members (contact_id, group_id) VALUES (?1, ?2)",
                params![contact_id, group_id],
            )?;
            stats.groups += 1;
        }
    }

    tx.commit()?;
    Ok(stats)
}

fn ensure_group(conn: &Connection, name: &str) -> Result<i64> {
    conn.execute(
        "INSERT OR IGNORE INTO contact_groups (name) VALUES (?1)",
        params![name],
    )?;
    let id: i64 = conn.query_row(
        "SELECT id FROM contact_groups WHERE name = ?1",
        params![name],
        |row| row.get(0),
    )?;
    Ok(id)
}

#[allow(dead_code)]
pub fn lookup_by_phone(conn: &Connection, phone_e164: &str) -> Result<Option<Contact>> {
    let contact = conn
        .query_row(
            r#"
            SELECT c.id, c.first_name, c.last_name, c.exclude, c.preferred_phone
            FROM contact_phones p
            JOIN contacts c ON c.id = p.contact_id
            WHERE p.phone_e164 = ?1
            "#,
            params![phone_e164],
            |row| {
                Ok(Contact {
                    id: row.get(0)?,
                    first_name: row.get(1)?,
                    last_name: row.get(2)?,
                    exclude: row.get::<_, i64>(3)? != 0,
                    preferred_phone: row.get(4)?,
                })
            },
        )
        .optional()?;
    Ok(contact)
}

fn row_groups(row: &ContactCsvRow) -> Vec<String> {
    // Import is capped at five CSV columns; SQLite may hold more after edits.
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    for raw in [
        &row.group_1,
        &row.group_2,
        &row.group_3,
        &row.group_4,
        &row.group_5,
    ] {
        let group = raw.trim();
        if group.is_empty() {
            continue;
        }
        let key = group.to_ascii_lowercase();
        if !seen.insert(key) {
            continue;
        }
        out.push(group.to_string());
    }
    out
}

fn split_list(raw: &str) -> Vec<String> {
    raw.split(';')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .collect()
}

fn empty_to_none(s: &str) -> Option<String> {
    let s = s.trim();
    if s.is_empty() {
        None
    } else {
        Some(s.to_string())
    }
}

fn parse_bool(raw: &str) -> bool {
    matches!(
        raw.trim().to_ascii_lowercase().as_str(),
        "1" | "true" | "yes" | "y"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn email_detection() {
        assert!(is_email_handle("a@b.com"));
        assert!(!is_email_handle("+15551234567"));
        assert_eq!(
            phone_handles_only(&[
                "+15551234567".into(),
                "a@b.com".into(),
                "+15559876543".into()
            ]),
            vec!["+15551234567", "+15559876543"]
        );
    }
}
