use anyhow::{Context, Result};
use rusqlite::{params, Connection};

#[derive(Debug, Clone)]
pub struct VaultOwner {
    pub display_name: String,
    pub phones: Vec<String>,
    pub emails: Vec<String>,
}

/// Load vault owner profile for one account from `vault_owners` tables.
pub fn load_vault_owner(conn: &Connection, account_id: &str) -> Result<VaultOwner> {
    let display_name: String = conn
        .query_row(
            "SELECT display_name FROM vault_owners WHERE account_id = ?1",
            params![account_id],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "Me".to_string());

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

    let display_name = display_name.trim();
    Ok(VaultOwner {
        display_name: if display_name.is_empty() {
            "Me".to_string()
        } else {
            display_name.to_string()
        },
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
