use std::collections::HashSet;
use std::fs::File;
use std::path::Path;

use anyhow::{Context, Result};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct ExcludeRow {
    phones: String,
    #[serde(default)]
    #[allow(dead_code)]
    label: String,
}

/// Digit-normalized exclude entries loaded from exclude.csv.
#[derive(Debug, Default, Clone)]
pub struct ExcludeSet {
    exact: HashSet<String>,
    short: Vec<String>,
}

impl ExcludeSet {
    pub fn load(path: &Path) -> Result<Self> {
        if !path.exists() {
            eprintln!(
                "warning: exclude CSV not found at {}; not filtering numbers",
                path.display()
            );
            return Ok(Self::default());
        }

        let file = File::open(path)
            .with_context(|| format!("failed to open exclude CSV {}", path.display()))?;
        let mut reader = csv::ReaderBuilder::new()
            .comment(Some(b'#'))
            .flexible(true)
            .from_reader(file);

        let mut set = Self::default();
        for result in reader.deserialize() {
            let row: ExcludeRow = result.with_context(|| {
                format!("failed to parse exclude CSV row in {}", path.display())
            })?;
            let digits = digits_only(&row.phones);
            if digits.is_empty() {
                continue;
            }
            if digits.len() < 10 {
                set.short.push(digits.clone());
            }
            set.exact.insert(digits);
        }
        Ok(set)
    }

    pub fn contains_handle(&self, handle: &str) -> bool {
        let digits = digits_only(handle);
        if digits.is_empty() {
            return false;
        }
        if self.exact.contains(&digits) {
            return true;
        }
        self.short.iter().any(|short| digits.ends_with(short))
    }
}

fn digits_only(raw: &str) -> String {
    raw.chars().filter(|c| c.is_ascii_digit()).collect()
}
