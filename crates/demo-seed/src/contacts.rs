use std::fs;
use std::path::Path;

use anyhow::{Context, Result};

use crate::personas::{Roster, OWNER_PHONE};

pub fn write_csvs(config_dir: &Path, roster: &Roster) -> Result<()> {
    let contacts_path = config_dir.join("contacts.csv");
    let mut wtr = csv::Writer::from_path(&contacts_path)
        .with_context(|| format!("open {}", contacts_path.display()))?;
    wtr.write_record([
        "phones",
        "first_name",
        "last_name",
        "exclude",
        "group_1",
        "group_2",
        "group_3",
        "group_4",
        "group_5",
    ])?;
    for c in &roster.contacts {
        wtr.write_record([
            c.phones.join(";"),
            c.first_name.clone(),
            c.last_name.clone(),
            if c.exclude { "true" } else { "false" }.to_string(),
            c.groups.first().cloned().unwrap_or_default(),
            c.groups.get(1).cloned().unwrap_or_default(),
            c.groups.get(2).cloned().unwrap_or_default(),
            c.groups.get(3).cloned().unwrap_or_default(),
            c.groups.get(4).cloned().unwrap_or_default(),
        ])?;
    }
    wtr.flush()?;

    let exclude_path = config_dir.join("exclude.csv");
    let mut ex = csv::Writer::from_path(&exclude_path)
        .with_context(|| format!("open {}", exclude_path.display()))?;
    ex.write_record(["phones", "label"])?;
    for (phone, label) in &roster.exclude_handles {
        ex.write_record([phone.as_str(), label.as_str()])?;
    }
    ex.flush()?;
    Ok(())
}

pub fn write_config_toml(config_dir: &Path) -> Result<()> {
    let path = config_dir.join("config.toml");
    let body = format!(
        r#"[owner]
display_name = "Demo User"
phones = ["{OWNER_PHONE}"]
emails = ["demo.ingest@example.com"]

[account]
username = "demo"
login_email = "demo@example.com"
read_only = false

[paths]
db = "data/vault.db"
data_dir = "data"
assets_dir = "assets"
assets_converted_dir = "assets_converted"
contacts_csv = "demo/config/contacts.csv"
exclude_csv = "demo/config/exclude.csv"

[[sources]]
id = "imessage"
export_dir = "demo/staging/imessage"
"#
    );
    fs::write(&path, body).with_context(|| format!("write {}", path.display()))?;
    Ok(())
}
