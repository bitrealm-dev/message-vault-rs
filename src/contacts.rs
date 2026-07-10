use std::collections::HashSet;
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
    pub skipped: bool,
}

#[derive(Debug, Deserialize)]
struct ContactCsvRow {
    phones: String,
    #[serde(default)]
    first_name: String,
    #[serde(default)]
    middle_name: String,
    #[serde(default)]
    last_name: String,
    #[serde(default)]
    nickname: String,
    #[serde(default)]
    email: String,
    #[serde(default)]
    hidden: String,
    #[serde(default)]
    groups: String,
}

#[derive(Debug, Clone)]
#[allow(dead_code)] // used by display/lookup helpers for later UI resolve
pub struct Contact {
    pub id: i64,
    pub first_name: Option<String>,
    pub middle_name: Option<String>,
    pub last_name: Option<String>,
    pub nickname: Option<String>,
    pub email: Option<String>,
    pub hidden: bool,
    pub preferred_phone: Option<String>,
}

impl Contact {
    #[allow(dead_code)]
    pub fn display_name(&self) -> String {
        if let Some(nick) = self.nickname.as_deref().filter(|s| !s.is_empty()) {
            return nick.to_string();
        }
        [self.first_name.as_deref(), self.middle_name.as_deref(), self.last_name.as_deref()]
            .into_iter()
            .flatten()
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join(" ")
    }
}

/// Load contacts from CSV when the table is empty, or when `overwrite` is true.
pub fn load_contacts_if_needed(
    conn: &mut Connection,
    csv_path: &Path,
    overwrite: bool,
) -> Result<ContactLoadStats> {
    crate::schema::ensure_contacts_schema(conn)?;

    let count: i64 = conn.query_row("SELECT COUNT(*) FROM contacts", [], |row| row.get(0))?;

    if count > 0 && !overwrite {
        return Ok(ContactLoadStats {
            skipped: true,
            ..Default::default()
        });
    }

    if overwrite {
        wipe_contacts(conn)?;
    }

    if !csv_path.exists() {
        eprintln!(
            "warning: contacts CSV not found at {}; leaving contacts empty",
            csv_path.display()
        );
        return Ok(ContactLoadStats::default());
    }

    load_from_csv(conn, csv_path)
}

fn wipe_contacts(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        DELETE FROM contact_groups;
        DELETE FROM contact_phones;
        DELETE FROM contacts;
        DELETE FROM groups;
        "#,
    )?;
    Ok(())
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
            format!("failed to parse contacts CSV row {row_no} in {}", csv_path.display())
        })?;

        let phones = split_list(&row.phones);
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
        let hidden = parse_bool(&row.hidden);
        let first_name = empty_to_none(&row.first_name);
        let middle_name = empty_to_none(&row.middle_name);
        let last_name = empty_to_none(&row.last_name);
        let nickname = empty_to_none(&row.nickname);
        let email = empty_to_none(&row.email);

        tx.execute(
            r#"
            INSERT INTO contacts (
                first_name, middle_name, last_name, nickname, email, hidden, preferred_phone
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            "#,
            params![
                first_name,
                middle_name,
                last_name,
                nickname,
                email,
                hidden as i64,
                preferred,
            ],
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

        for group_name in split_list(&row.groups) {
            let group_id = ensure_group(&tx, &group_name)?;
            tx.execute(
                "INSERT OR IGNORE INTO contact_groups (contact_id, group_id) VALUES (?1, ?2)",
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
        "INSERT OR IGNORE INTO groups (name) VALUES (?1)",
        params![name],
    )?;
    let id: i64 = conn.query_row(
        "SELECT id FROM groups WHERE name = ?1",
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
            SELECT c.id, c.first_name, c.middle_name, c.last_name, c.nickname,
                   c.email, c.hidden, c.preferred_phone
            FROM contact_phones p
            JOIN contacts c ON c.id = p.contact_id
            WHERE p.phone_e164 = ?1
            "#,
            params![phone_e164],
            |row| {
                Ok(Contact {
                    id: row.get(0)?,
                    first_name: row.get(1)?,
                    middle_name: row.get(2)?,
                    last_name: row.get(3)?,
                    nickname: row.get(4)?,
                    email: row.get(5)?,
                    hidden: row.get::<_, i64>(6)? != 0,
                    preferred_phone: row.get(7)?,
                })
            },
        )
        .optional()?;
    Ok(contact)
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
