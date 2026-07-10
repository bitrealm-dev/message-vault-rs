use std::fs::{self, File};
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use sha2::{Digest, Sha256};

#[derive(Debug, Default)]
pub struct AssetStats {
    pub copied: u64,
    pub deduped: u64,
    pub missing: u64,
}

#[derive(Debug, Clone)]
pub struct StoredAsset {
    pub sha256: String,
    pub assets_path: String,
    pub mime_type: Option<String>,
}

/// Hash `source` and store under `assets_root/<sha[0:2]>/<sha><ext>`.
/// If the blob already exists, skip the copy and count as deduped.
pub fn hash_and_store(
    source: &Path,
    assets_root: &Path,
    export_mime: Option<&str>,
    stats: &mut AssetStats,
) -> Result<Option<StoredAsset>> {
    if !source.is_file() {
        stats.missing += 1;
        return Ok(None);
    }

    let sha = hash_file(source)
        .with_context(|| format!("failed to hash {}", source.display()))?;
    let ext = normalize_ext(source.extension().and_then(|e| e.to_str()));
    let rel = format!("{}/{}{}", &sha[..2], sha, ext);
    let dest = assets_root.join(&rel);

    if dest.is_file() {
        stats.deduped += 1;
    } else {
        // Dedupe across extension variants for the same hash.
        if let Some(existing) = find_existing(assets_root, &sha) {
            stats.deduped += 1;
            let assets_path = path_relative_to(assets_root, &existing)?;
            return Ok(Some(StoredAsset {
                sha256: sha,
                assets_path,
                mime_type: resolve_mime(export_mime, source),
            }));
        }

        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)
                .with_context(|| format!("failed to create {}", parent.display()))?;
        }
        fs::copy(source, &dest).with_context(|| {
            format!(
                "failed to copy {} → {}",
                source.display(),
                dest.display()
            )
        })?;
        stats.copied += 1;
    }

    Ok(Some(StoredAsset {
        sha256: sha,
        assets_path: rel,
        mime_type: resolve_mime(export_mime, source),
    }))
}

fn hash_file(path: &Path) -> Result<String> {
    let file = File::open(path)?;
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 1024 * 1024];
    loop {
        let n = reader.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect())
}

fn normalize_ext(ext: Option<&str>) -> String {
    let Some(ext) = ext else {
        return String::new();
    };
    let ext = ext.to_ascii_lowercase();
    let ext = if ext == "jpeg" { "jpg" } else { &ext };
    format!(".{ext}")
}

fn find_existing(assets_root: &Path, sha: &str) -> Option<PathBuf> {
    let shard = assets_root.join(&sha[..2]);
    if !shard.is_dir() {
        return None;
    }
    let mut matches: Vec<_> = fs::read_dir(&shard)
        .ok()?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.file_stem()
                .and_then(|s| s.to_str())
                .is_some_and(|stem| stem == sha)
                && p.is_file()
        })
        .collect();
    matches.sort();
    matches.into_iter().next()
}

fn path_relative_to(root: &Path, path: &Path) -> Result<String> {
    Ok(path
        .strip_prefix(root)
        .with_context(|| {
            format!(
                "asset path {} is not under {}",
                path.display(),
                root.display()
            )
        })?
        .to_string_lossy()
        .replace('\\', "/"))
}

fn resolve_mime(export_mime: Option<&str>, source: &Path) -> Option<String> {
    if let Some(mime) = export_mime.filter(|m| !m.is_empty()) {
        return Some(mime.to_string());
    }
    guess_mime(source.extension().and_then(|e| e.to_str()))
}

fn guess_mime(ext: Option<&str>) -> Option<String> {
    let ext = ext?.to_ascii_lowercase();
    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "heic" | "heif" => "image/heic",
        "webp" => "image/webp",
        "mp4" | "m4v" => "video/mp4",
        "mov" => "video/quicktime",
        "mp3" => "audio/mpeg",
        "m4a" | "aac" => "audio/mp4",
        "caf" => "audio/x-caf",
        "pdf" => "application/pdf",
        "vcf" => "text/vcard",
        _ => return None,
    };
    Some(mime.to_string())
}
