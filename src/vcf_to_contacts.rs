use std::collections::HashMap;
use std::fs::File;
use std::path::Path;

use anyhow::{bail, Context, Result};
use serde::Deserialize;

use crate::vcf::{self, VcfCard};

#[derive(Debug, Default)]
pub struct ConvertStats {
    pub cards_total: u64,
    pub cards_skipped_no_tel: u64,
    pub contacts_written: u64,
    pub blacklist_only: u64,
}

#[derive(Debug, Clone)]
struct ContactOut {
    phones: Vec<String>,
    first_name: String,
    middle_name: String,
    last_name: String,
    nickname: String,
    email: String,
    hidden: bool,
    groups: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct BlacklistRow {
    number: String,
    #[serde(default)]
    label: String,
}

#[derive(Debug, Deserialize)]
struct FilterPeopleRow {
    e164: String,
    #[serde(default)]
    #[allow(dead_code)]
    vcf_name: String,
    category: String,
}

pub fn convert(
    vcf_path: &Path,
    out_path: &Path,
    blacklist_path: Option<&Path>,
    filter_people_path: Option<&Path>,
    force: bool,
) -> Result<ConvertStats> {
    if out_path.exists() && !force {
        bail!(
            "refusing to overwrite {} (pass --force)",
            out_path.display()
        );
    }

    let cards = vcf::parse_vcf(vcf_path)?;
    let blacklist = load_blacklist(blacklist_path)?;
    let filters = load_filters(filter_people_path)?;

    let mut stats = ConvertStats {
        cards_total: cards.len() as u64,
        ..Default::default()
    };

    let mut contacts: Vec<ContactOut> = Vec::new();
    let mut phone_to_index: HashMap<String, usize> = HashMap::new();
    let mut merge_warnings: u64 = 0;

    for card in &cards {
        if card.phones.is_empty() {
            stats.cards_skipped_no_tel += 1;
            continue;
        }

        let mut contact = card_to_contact(card);
        apply_blacklist(&mut contact, &blacklist);
        apply_filters(&mut contact, &filters);
        finalize_groups(&mut contact);

        // Merge into an existing contact if any phone already seen.
        let existing = contact
            .phones
            .iter()
            .find_map(|p| phone_to_index.get(p).copied());

        if let Some(idx) = existing {
            merge_warnings += 1;
            merge_contact(&mut contacts[idx], contact);
            for phone in &contacts[idx].phones {
                phone_to_index.insert(phone.clone(), idx);
            }
            continue;
        }

        let idx = contacts.len();
        for phone in &contact.phones {
            phone_to_index.insert(phone.clone(), idx);
        }
        contacts.push(contact);
    }

    // Blacklist-only numbers with no VCF card
    for (number, label) in &blacklist {
        if phone_to_index.contains_key(number) {
            continue;
        }
        phone_to_index.insert(number.clone(), contacts.len());
        contacts.push(ContactOut {
            phones: vec![number.clone()],
            first_name: String::new(),
            middle_name: String::new(),
            last_name: String::new(),
            nickname: label.clone(),
            email: String::new(),
            hidden: true,
            groups: Vec::new(),
        });
        stats.blacklist_only += 1;
    }

    write_csv(out_path, &contacts)?;
    stats.contacts_written = contacts.len() as u64;
    if merge_warnings > 0 {
        eprintln!(
            "warning: merged {merge_warnings} VCF card(s) that shared phone numbers with earlier cards"
        );
    }
    Ok(stats)
}

fn merge_contact(into: &mut ContactOut, from: ContactOut) {
    for phone in from.phones {
        if !into.phones.iter().any(|p| p == &phone) {
            into.phones.push(phone);
        }
    }
    if into.first_name.is_empty() {
        into.first_name = from.first_name;
    }
    if into.middle_name.is_empty() {
        into.middle_name = from.middle_name;
    }
    if into.last_name.is_empty() {
        into.last_name = from.last_name;
    }
    if into.nickname.is_empty() {
        into.nickname = from.nickname;
    }
    if into.email.is_empty() {
        into.email = from.email;
    }
    into.hidden = into.hidden || from.hidden;
    for g in from.groups {
        push_group(&mut into.groups, &g);
    }
    into.groups.sort();
    into.groups.dedup();
}

fn card_to_contact(card: &VcfCard) -> ContactOut {
    let (fn_stripped, fn_tags) = vcf::extract_tags(&card.fn_raw);
    let first = vcf::strip_tags(&card.n_given);
    let middle = vcf::strip_tags(&card.n_middle);
    let last = vcf::strip_tags(&card.n_family);

    // Mom-style: FN is a single token and last name empty after tag strip
    let nickname = if last.is_empty()
        && !fn_stripped.is_empty()
        && !fn_stripped.contains(' ')
        && (first.is_empty() || first == fn_stripped)
    {
        fn_stripped.clone()
    } else {
        String::new()
    };

    let (first_name, middle_name, last_name) = if !nickname.is_empty() {
        (String::new(), String::new(), String::new())
    } else {
        (first, middle, last)
    };

    ContactOut {
        phones: card.phones.clone(),
        first_name,
        middle_name,
        last_name,
        nickname,
        email: card.email.clone().unwrap_or_default(),
        hidden: false,
        groups: fn_tags,
    }
}

fn apply_blacklist(contact: &mut ContactOut, blacklist: &HashMap<String, String>) {
    if contact
        .phones
        .iter()
        .any(|p| blacklist.contains_key(p))
    {
        contact.hidden = true;
    }
}

fn apply_filters(contact: &mut ContactOut, filters: &HashMap<String, String>) {
    for phone in &contact.phones {
        let Some(category) = filters.get(phone) else {
            continue;
        };
        match category.to_ascii_lowercase().as_str() {
            "girls" | "dating" | "dated" => {
                push_group(&mut contact.groups, "girls");
            }
            "historical" => {
                push_group(&mut contact.groups, "Historical");
            }
            "historical-exclude" => {
                contact.hidden = true;
                push_group(&mut contact.groups, "Historical");
            }
            other => {
                // Preserve unknown categories as group names
                push_group(&mut contact.groups, other);
            }
        }
    }
}

fn finalize_groups(contact: &mut ContactOut) {
    if !contact.hidden {
        push_group(&mut contact.groups, "People");
    }
    contact.groups.sort();
    contact.groups.dedup();
}

fn push_group(groups: &mut Vec<String>, name: &str) {
    if !groups.iter().any(|g| g == name) {
        groups.push(name.to_string());
    }
}

fn load_blacklist(path: Option<&Path>) -> Result<HashMap<String, String>> {
    let Some(path) = path else {
        return Ok(HashMap::new());
    };
    let file = File::open(path)
        .with_context(|| format!("failed to open blacklist {}", path.display()))?;
    let mut reader = csv::ReaderBuilder::new()
        .comment(Some(b'#'))
        .flexible(true)
        .from_reader(file);
    let mut map = HashMap::new();
    for result in reader.deserialize() {
        let row: BlacklistRow = result
            .with_context(|| format!("failed to parse blacklist row in {}", path.display()))?;
        let number = row.number.trim().to_string();
        if number.is_empty() {
            continue;
        }
        map.entry(number)
            .or_insert_with(|| row.label.trim().to_string());
    }
    Ok(map)
}

fn load_filters(path: Option<&Path>) -> Result<HashMap<String, String>> {
    let Some(path) = path else {
        return Ok(HashMap::new());
    };
    let file = File::open(path)
        .with_context(|| format!("failed to open filter-people {}", path.display()))?;
    let mut reader = csv::ReaderBuilder::new()
        .comment(Some(b'#'))
        .flexible(true)
        .from_reader(file);
    let mut map = HashMap::new();
    for result in reader.deserialize() {
        let row: FilterPeopleRow = result.with_context(|| {
            format!("failed to parse filter-people row in {}", path.display())
        })?;
        let e164 = row.e164.trim().to_string();
        if e164.is_empty() {
            continue;
        }
        map.insert(e164, row.category.trim().to_string());
    }
    Ok(map)
}

fn write_csv(path: &Path, contacts: &[ContactOut]) -> Result<()> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("failed to create {}", parent.display()))?;
        }
    }

    let mut writer = csv::Writer::from_path(path)
        .with_context(|| format!("failed to write {}", path.display()))?;
    writer.write_record([
        "phones",
        "first_name",
        "middle_name",
        "last_name",
        "nickname",
        "email",
        "hidden",
        "groups",
    ])?;

    for c in contacts {
        let phones = c.phones.join(";");
        let groups = c.groups.join(";");
        let hidden = if c.hidden {
            "true".to_string()
        } else {
            "false".to_string()
        };
        writer.write_record([
            phones,
            c.first_name.clone(),
            c.middle_name.clone(),
            c.last_name.clone(),
            c.nickname.clone(),
            c.email.clone(),
            hidden,
            groups,
        ])?;
    }

    writer.flush()?;
    Ok(())
}
