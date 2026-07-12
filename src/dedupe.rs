//! Cross-source content fingerprint and soft-hide dedupe.

use std::collections::{HashMap, HashSet};

use anyhow::{Context, Result};
use rusqlite::{params, Connection, OptionalExtension};
use sha2::{Digest, Sha256};

/// Collapse whitespace so minor text differences do not split the same SMS.
pub fn normalize_body(body: Option<&str>) -> String {
    body.unwrap_or("")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Build a content key from chat + UTC epoch seconds + direction + normalized body + attachment hashes.
///
/// Prefers `timestamp_utc`; falls back to local `timestamp` (offsets are applied).
pub fn compute_content_key(
    chat_identifier: &str,
    is_from_me: bool,
    timestamp_utc: Option<&str>,
    timestamp: &str,
    body: Option<&str>,
    attachment_shas: &[String],
) -> String {
    let epoch = resolve_utc_secs(timestamp_utc, timestamp)
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            timestamp_utc
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .unwrap_or(timestamp)
                .to_string()
        });

    let mut shas: Vec<&str> = attachment_shas
        .iter()
        .map(|s| s.as_str())
        .filter(|s| !s.is_empty())
        .collect();
    shas.sort_unstable();
    shas.dedup();

    let mut hasher = Sha256::new();
    hasher.update(chat_identifier.as_bytes());
    hasher.update(b"|");
    hasher.update(if is_from_me { b"1" } else { b"0" });
    hasher.update(b"|");
    hasher.update(epoch.as_bytes());
    hasher.update(b"|");
    hasher.update(normalize_body(body).as_bytes());
    for sha in shas {
        hasher.update(b"|");
        hasher.update(sha.as_bytes());
    }
    hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

fn resolve_utc_secs(timestamp_utc: Option<&str>, timestamp: &str) -> Option<i64> {
    timestamp_utc
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .and_then(parse_rfc3339_utc_secs)
        .or_else(|| parse_rfc3339_utc_secs(timestamp.trim()))
}

#[derive(Debug, Default)]
pub struct DedupeStats {
    pub keys_filled: u64,
    pub exact_groups: u64,
    pub exact_flagged: u64,
    pub near_flagged: u64,
}

/// Recompute every content key, clear prior flags, then soft-hide cross-source duplicates.
///
/// `source_priority` is config `[[sources]]` order (earlier = preferred when choosing the survivor).
pub fn dedupe_cross_source(
    conn: &mut Connection,
    source_priority: &[String],
    near_window_secs: i64,
) -> Result<DedupeStats> {
    let mut stats = DedupeStats::default();
    let prio: HashMap<&str, usize> = source_priority
        .iter()
        .enumerate()
        .map(|(i, s)| (s.as_str(), i))
        .collect();

    {
        let tx = conn.transaction()?;
        stats.keys_filled = recompute_all_content_keys(&tx)?;
        tx.execute("UPDATE messages SET duplicate_of = NULL", [])?;
        tx.commit()?;
    }

    {
        let tx = conn.transaction()?;
        let (groups, flagged) = flag_exact_content_key_dupes(&tx, &prio)?;
        stats.exact_groups = groups;
        stats.exact_flagged = flagged;
        tx.commit()?;
    }

    {
        let tx = conn.transaction()?;
        stats.near_flagged = flag_near_time_dupes(&tx, &prio, near_window_secs)?;
        tx.commit()?;
    }

    Ok(stats)
}

/// Compute `content_key` for production rows that still lack one (after attachments exist).
pub fn fill_missing_content_keys(conn: &Connection) -> Result<u64> {
    recompute_content_keys(conn, true)
}

/// Rebuild every message `content_key` from current chat/time/body/attachments.
pub fn recompute_all_content_keys(conn: &Connection) -> Result<u64> {
    recompute_content_keys(conn, false)
}

fn recompute_content_keys(conn: &Connection, missing_only: bool) -> Result<u64> {
    let filter = if missing_only {
        "WHERE m.content_key IS NULL OR m.content_key = ''"
    } else {
        ""
    };
    let sql = format!(
        r#"
        SELECT m.id, c.chat_identifier, m.is_from_me, m.timestamp_utc, m.timestamp, m.body
        FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        {filter}
        "#
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows: Vec<(i64, String, i64, Option<String>, String, Option<String>)> = stmt
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    drop(stmt);

    let mut att_stmt = conn.prepare(
        "SELECT sha256 FROM attachments WHERE message_id = ?1 AND sha256 IS NOT NULL AND sha256 != ''",
    )?;
    let mut update = conn.prepare("UPDATE messages SET content_key = ?2 WHERE id = ?1")?;
    let mut filled = 0u64;

    for (id, chat_id, is_from_me, ts_utc, ts, body) in rows {
        let shas: Vec<String> = att_stmt
            .query_map(params![id], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        let key = compute_content_key(
            &chat_id,
            is_from_me != 0,
            ts_utc.as_deref(),
            &ts,
            body.as_deref(),
            &shas,
        );
        update.execute(params![id, key])?;
        filled += 1;
    }
    Ok(filled)
}

#[derive(Clone)]
struct Cand {
    id: i64,
    source: String,
    att_count: i64,
}

fn flag_exact_content_key_dupes(
    conn: &Connection,
    prio: &HashMap<&str, usize>,
) -> Result<(u64, u64)> {
    let mut key_stmt = conn.prepare(
        r#"
        SELECT content_key
        FROM messages
        WHERE content_key IS NOT NULL AND content_key != ''
        GROUP BY content_key
        HAVING COUNT(DISTINCT source) > 1
        "#,
    )?;
    let keys: Vec<String> = key_stmt
        .query_map([], |row| row.get(0))?
        .collect::<Result<Vec<_>, _>>()?;
    drop(key_stmt);

    let mut cand_stmt = conn.prepare(
        r#"
        SELECT m.id, m.source,
               (SELECT COUNT(*) FROM attachments a
                WHERE a.message_id = m.id AND a.sha256 IS NOT NULL AND a.sha256 != '') AS att_count
        FROM messages m
        WHERE m.content_key = ?1
        "#,
    )?;
    let mut flag = conn.prepare(
        "UPDATE messages SET duplicate_of = ?2 WHERE id = ?1 AND (duplicate_of IS NULL OR duplicate_of != ?2)",
    )?;

    let mut groups = 0u64;
    let mut flagged = 0u64;

    for key in keys {
        let cands: Vec<Cand> = cand_stmt
            .query_map(params![key], |row| {
                Ok(Cand {
                    id: row.get(0)?,
                    source: row.get(1)?,
                    att_count: row.get(2)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        let sources: HashSet<&str> = cands.iter().map(|c| c.source.as_str()).collect();
        if sources.len() < 2 {
            continue;
        }
        groups += 1;
        let winner = pick_winner(&cands, prio);
        for c in &cands {
            if c.id == winner {
                continue;
            }
            flag.execute(params![c.id, winner])?;
            flagged += 1;
        }
    }
    Ok((groups, flagged))
}

fn pick_winner(cands: &[Cand], prio: &HashMap<&str, usize>) -> i64 {
    cands
        .iter()
        .min_by(|a, b| {
            b.att_count
                .cmp(&a.att_count)
                .then_with(|| {
                    let pa = prio.get(a.source.as_str()).copied().unwrap_or(usize::MAX);
                    let pb = prio.get(b.source.as_str()).copied().unwrap_or(usize::MAX);
                    pa.cmp(&pb)
                })
                .then_with(|| a.id.cmp(&b.id))
        })
        .map(|c| c.id)
        .unwrap_or(cands[0].id)
}

/// Parse RFC3339 (second precision) into Unix UTC seconds, honoring Z / ±HH:MM offsets.
fn parse_rfc3339_utc_secs(ts: &str) -> Option<i64> {
    let s = ts.trim();
    if s.len() < 19 {
        return None;
    }
    let date = &s[..10];
    let tsep = s.as_bytes().get(10).copied()?;
    if tsep != b'T' && tsep != b't' {
        return None;
    }
    let time = &s[11..19];
    let (y, mo, d) = (
        date.get(0..4)?.parse::<i64>().ok()?,
        date.get(5..7)?.parse::<i64>().ok()?,
        date.get(8..10)?.parse::<i64>().ok()?,
    );
    let (h, mi, se) = (
        time.get(0..2)?.parse::<i64>().ok()?,
        time.get(3..5)?.parse::<i64>().ok()?,
        time.get(6..8)?.parse::<i64>().ok()?,
    );

    let mut rest = &s[19..];
    if rest.starts_with('.') {
        rest = rest[1..].trim_start_matches(|c: char| c.is_ascii_digit());
    }
    let offset_secs = parse_offset_secs(rest)?;
    let local_as_utc = civil_to_unix_secs(y, mo, d, h, mi, se)?;
    Some(local_as_utc - offset_secs)
}

fn parse_offset_secs(rest: &str) -> Option<i64> {
    let rest = rest.trim();
    if rest.is_empty() || rest == "Z" || rest == "z" {
        return Some(0);
    }
    let sign = match rest.chars().next()? {
        '+' => 1i64,
        '-' => -1i64,
        _ => return None,
    };
    let body = &rest[1..];
    // HH:MM or HHMM
    let (oh, om) = if body.len() >= 5 && body.as_bytes().get(2) == Some(&b':') {
        (body.get(0..2)?.parse::<i64>().ok()?, body.get(3..5)?.parse::<i64>().ok()?)
    } else if body.len() >= 4 {
        (body.get(0..2)?.parse::<i64>().ok()?, body.get(2..4)?.parse::<i64>().ok()?)
    } else {
        return None;
    };
    Some(sign * (oh * 3600 + om * 60))
}

fn civil_to_unix_secs(y: i64, mo: i64, d: i64, h: i64, mi: i64, se: i64) -> Option<i64> {
    if !(1..=12).contains(&mo) || !(1..=31).contains(&d) {
        return None;
    }
    if h > 23 || mi > 59 || se > 60 {
        return None;
    }
    // Days from civil date (Howard Hinnant) → Unix seconds.
    let y = if mo <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y.rem_euclid(400);
    let mp = if mo > 2 { mo - 3 } else { mo + 9 };
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146097 + doe - 719468;
    Some(days * 86400 + h * 3600 + mi * 60 + se)
}

#[derive(Clone)]
struct NearRow {
    id: i64,
    source: String,
    is_from_me: i64,
    secs: i64,
    body_norm: String,
    att_fp: String,
    att_count: i64,
}

fn flag_near_time_dupes(
    conn: &Connection,
    prio: &HashMap<&str, usize>,
    window_secs: i64,
) -> Result<u64> {
    let conv_ids: Vec<i64> = conn
        .prepare("SELECT DISTINCT conversation_id FROM messages")?
        .query_map([], |row| row.get(0))?
        .collect::<Result<Vec<_>, _>>()?;

    let mut msg_stmt = conn.prepare(
        r#"
        SELECT m.id, m.source, m.is_from_me, m.timestamp_utc, m.timestamp, m.body
        FROM messages m
        WHERE m.conversation_id = ?1
          AND m.duplicate_of IS NULL
        "#,
    )?;
    let mut att_stmt = conn.prepare(
        "SELECT sha256 FROM attachments WHERE message_id = ?1 AND sha256 IS NOT NULL AND sha256 != ''",
    )?;
    let mut flag = conn.prepare("UPDATE messages SET duplicate_of = ?2 WHERE id = ?1")?;

    let mut flagged = 0u64;

    for conv_id in conv_ids {
        let msg_rows: Vec<(i64, String, i64, Option<String>, String, Option<String>)> = msg_stmt
            .query_map(params![conv_id], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        let mut rows: Vec<NearRow> = Vec::new();
        for (id, source, is_from_me, ts_utc, ts, body) in msg_rows {
            let Some(secs) = resolve_utc_secs(ts_utc.as_deref(), &ts) else {
                continue;
            };
            let mut shas: Vec<String> = att_stmt
                .query_map(params![id], |row| row.get(0))?
                .collect::<Result<Vec<_>, _>>()?;
            shas.sort();
            let att_count = shas.len() as i64;
            let att_fp = shas.join(",");
            rows.push(NearRow {
                id,
                source,
                is_from_me,
                secs,
                body_norm: normalize_body(body.as_deref()),
                att_fp,
                att_count,
            });
        }

        rows.sort_by(|a, b| a.secs.cmp(&b.secs).then(a.id.cmp(&b.id)));

        for i in 0..rows.len() {
            let already: bool = conn
                .query_row(
                    "SELECT duplicate_of IS NOT NULL FROM messages WHERE id = ?1",
                    params![rows[i].id],
                    |row| row.get(0),
                )
                .optional()?
                .unwrap_or(false);
            if already {
                continue;
            }

            let mut cluster: Vec<Cand> = vec![Cand {
                id: rows[i].id,
                source: rows[i].source.clone(),
                att_count: rows[i].att_count,
            }];

            for j in (i + 1)..rows.len() {
                if rows[j].secs - rows[i].secs > window_secs {
                    break;
                }
                if rows[j].is_from_me != rows[i].is_from_me {
                    continue;
                }
                if rows[j].source == rows[i].source {
                    continue;
                }
                let body_match = !rows[i].body_norm.is_empty()
                    && rows[j].body_norm == rows[i].body_norm;
                let att_match =
                    !rows[i].att_fp.is_empty() && rows[j].att_fp == rows[i].att_fp;
                if !body_match && !att_match {
                    continue;
                }
                let j_flagged: bool = conn
                    .query_row(
                        "SELECT duplicate_of IS NOT NULL FROM messages WHERE id = ?1",
                        params![rows[j].id],
                        |row| row.get(0),
                    )
                    .optional()?
                    .unwrap_or(false);
                if j_flagged {
                    continue;
                }
                cluster.push(Cand {
                    id: rows[j].id,
                    source: rows[j].source.clone(),
                    att_count: rows[j].att_count,
                });
            }

            let sources: HashSet<&str> = cluster.iter().map(|c| c.source.as_str()).collect();
            if sources.len() < 2 {
                continue;
            }
            let winner = pick_winner(&cluster, prio);
            for c in &cluster {
                if c.id == winner {
                    continue;
                }
                flag.execute(params![c.id, winner])?;
                flagged += 1;
            }
        }
    }

    Ok(flagged)
}

/// Open DB helpers used by CLI.
pub fn run_dedupe(
    db_path: &std::path::Path,
    source_priority: &[String],
    near_window_secs: i64,
) -> Result<DedupeStats> {
    let mut conn = Connection::open(db_path)
        .with_context(|| format!("failed to open database {}", db_path.display()))?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    crate::schema::ensure_messages_schema(&conn)?;
    dedupe_cross_source(&mut conn, source_priority, near_window_secs)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema;

    #[test]
    fn normalize_collapses_whitespace() {
        assert_eq!(normalize_body(Some("  hi   mom \n")), "hi mom");
    }

    #[test]
    fn content_key_stable_across_whitespace_and_utc_forms() {
        let a = compute_content_key(
            "+14075551212",
            true,
            Some("2015-03-12T18:04:22Z"),
            "x",
            Some("Running late"),
            &[],
        );
        let b = compute_content_key(
            "+14075551212",
            true,
            Some("2015-03-12T18:04:22+00:00"),
            "y",
            Some("  Running   late "),
            &[],
        );
        let c = compute_content_key(
            "+14075551212",
            true,
            None,
            "2015-03-12T14:04:22-04:00",
            Some("Running late"),
            &[],
        );
        assert_eq!(a, b);
        assert_eq!(a, c);
    }

    #[test]
    fn parse_rfc3339_applies_offset() {
        assert_eq!(
            parse_rfc3339_utc_secs("2015-03-12T18:04:22Z"),
            Some(1426183462)
        );
        assert_eq!(
            parse_rfc3339_utc_secs("2015-03-12T18:04:22+00:00"),
            Some(1426183462)
        );
        assert_eq!(
            parse_rfc3339_utc_secs("2015-03-12T14:04:22-04:00"),
            Some(1426183462)
        );
    }

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        schema::ensure_messages_schema(&conn).unwrap();
        conn.execute(
            r#"
            INSERT INTO conversations (chat_identifier, service, conv_type, group_title, exported_at, source_file)
            VALUES ('+14075551212', 'SMS', 'individual', NULL, NULL, 't.json')
            "#,
            [],
        )
        .unwrap();
        conn
    }

    fn insert_msg(
        conn: &Connection,
        source: &str,
        guid: &str,
        utc: &str,
        local: &str,
        from_me: i64,
        body: &str,
        sort_order: i64,
    ) -> i64 {
        conn.execute(
            r#"
            INSERT INTO messages (
                conversation_id, source, guid, timestamp, timestamp_utc, is_from_me,
                sender, subject, body, sort_order
            ) VALUES (1, ?1, ?2, ?3, ?4, ?5, NULL, NULL, ?6, ?7)
            "#,
            params![source, guid, local, utc, from_me, body, sort_order],
        )
        .unwrap();
        conn.last_insert_rowid()
    }

    #[test]
    fn integration_exact_flags_cross_source() {
        let mut conn = setup_db();
        let a = insert_msg(
            &conn,
            "go-sms-pro",
            "g1",
            "2015-03-12T18:04:22Z",
            "2015-03-12T14:04:22-04:00",
            1,
            "Running late",
            0,
        );
        let b = insert_msg(
            &conn,
            "sms-backup-plus",
            "g2",
            "2015-03-12T18:04:22+00:00",
            "2015-03-12T14:04:22-04:00",
            1,
            "Running late",
            0,
        );
        let stats = dedupe_cross_source(
            &mut conn,
            &["go-sms-pro".into(), "sms-backup-plus".into()],
            2,
        )
        .unwrap();
        assert_eq!(stats.exact_groups, 1);
        assert_eq!(stats.exact_flagged, 1);
        let dup: Option<i64> = conn
            .query_row(
                "SELECT duplicate_of FROM messages WHERE id = ?1",
                params![b],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(dup, Some(a));
        let keep: Option<i64> = conn
            .query_row(
                "SELECT duplicate_of FROM messages WHERE id = ?1",
                params![a],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(keep, None);
    }

    #[test]
    fn integration_near_flags_within_window() {
        let mut conn = setup_db();
        let a = insert_msg(
            &conn,
            "go-sms-pro",
            "g1",
            "2015-03-12T18:04:22Z",
            "2015-03-12T14:04:22-04:00",
            0,
            "On my way",
            0,
        );
        let b = insert_msg(
            &conn,
            "sms-backup-plus",
            "g2",
            "2015-03-12T18:04:24Z",
            "2015-03-12T14:04:24-04:00",
            0,
            "On my way",
            1,
        );
        let stats = dedupe_cross_source(
            &mut conn,
            &["go-sms-pro".into(), "sms-backup-plus".into()],
            2,
        )
        .unwrap();
        assert_eq!(stats.exact_flagged, 0);
        assert_eq!(stats.near_flagged, 1);
        let dup: Option<i64> = conn
            .query_row(
                "SELECT duplicate_of FROM messages WHERE id = ?1",
                params![b],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(dup, Some(a));
    }

    #[test]
    fn integration_negative_far_apart_not_flagged() {
        let mut conn = setup_db();
        insert_msg(
            &conn,
            "go-sms-pro",
            "g1",
            "2015-03-12T18:04:22Z",
            "2015-03-12T14:04:22-04:00",
            0,
            "On my way",
            0,
        );
        insert_msg(
            &conn,
            "sms-backup-plus",
            "g2",
            "2015-03-12T18:05:22Z",
            "2015-03-12T14:05:22-04:00",
            0,
            "On my way",
            1,
        );
        let stats = dedupe_cross_source(
            &mut conn,
            &["go-sms-pro".into(), "sms-backup-plus".into()],
            2,
        )
        .unwrap();
        assert_eq!(stats.exact_flagged, 0);
        assert_eq!(stats.near_flagged, 0);
        let hidden: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM messages WHERE duplicate_of IS NOT NULL",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(hidden, 0);
    }

    #[test]
    fn integration_priority_prefers_earlier_source() {
        let mut conn = setup_db();
        let later_priority = insert_msg(
            &conn,
            "sms-backup-plus",
            "g1",
            "2015-03-12T18:04:22Z",
            "2015-03-12T14:04:22-04:00",
            1,
            "Hello",
            0,
        );
        let earlier_priority = insert_msg(
            &conn,
            "go-sms-pro",
            "g2",
            "2015-03-12T18:04:22Z",
            "2015-03-12T14:04:22-04:00",
            1,
            "Hello",
            1,
        );
        dedupe_cross_source(
            &mut conn,
            &["go-sms-pro".into(), "sms-backup-plus".into()],
            2,
        )
        .unwrap();
        let dup_later: Option<i64> = conn
            .query_row(
                "SELECT duplicate_of FROM messages WHERE id = ?1",
                params![later_priority],
                |row| row.get(0),
            )
            .unwrap();
        let dup_earlier: Option<i64> = conn
            .query_row(
                "SELECT duplicate_of FROM messages WHERE id = ?1",
                params![earlier_priority],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(dup_earlier, None);
        assert_eq!(dup_later, Some(earlier_priority));
    }
}
