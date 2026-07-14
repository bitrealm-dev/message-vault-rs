use anyhow::{Context, Result};
use rusqlite::{params, Connection};

#[derive(Debug, Clone)]
pub struct VaultOwner {
    pub first_name: String,
    pub last_name: String,
    pub display_name: String,
    pub phones: Vec<String>,
    pub emails: Vec<String>,
}

fn format_owner_name(first_name: &str, last_name: &str) -> String {
    [first_name.trim(), last_name.trim()]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

/// Load vault owner profile for one account from `vault_owners` tables.
pub fn load_vault_owner(conn: &Connection, account_id: &str) -> Result<VaultOwner> {
    let row: (String, String, String) = conn
        .query_row(
            "SELECT first_name, last_name, display_name FROM vault_owners WHERE account_id = ?1",
            params![account_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .unwrap_or_else(|_| (String::new(), String::new(), "Me".to_string()));

    let mut phone_stmt = conn.prepare(
        "SELECT phone FROM vault_owner_phones WHERE account_id = ?1 ORDER BY phone",
    )?;
    let phones: Vec<String> = phone_stmt
        .query_map(params![account_id], |row| row.get(0))?
        .collect::<Result<Vec<_>, _>>()?;

    let mut email_stmt = conn.prepare(
        "SELECT email FROM vault_owner_emails WHERE account_id = ?1 ORDER BY email",
    )?;
    let emails: Vec<String> = email_stmt
        .query_map(params![account_id], |row| row.get(0))?
        .collect::<Result<Vec<_>, _>>()?;

    let first_name = row.0.trim().to_string();
    let last_name = row.1.trim().to_string();
    let display_name = format_owner_name(&first_name, &last_name);
    let display_name = if display_name.is_empty() {
        let legacy = row.2.trim();
        if legacy.is_empty() {
            "Me".to_string()
        } else {
            legacy.to_string()
        }
    } else {
        display_name
    };

    Ok(VaultOwner {
        first_name,
        last_name,
        display_name,
        phones,
        emails,
    })
}

/// Ensure `accounts` row exists (stub username = id) for CLI imports.
pub fn ensure_account_row(conn: &Connection, account_id: &str) -> Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO accounts (id, username, read_only) VALUES (?1, ?1, 0)",
        params![account_id],
    )
    .with_context(|| format!("failed to ensure account row for {account_id}"))?;
    Ok(())
}
