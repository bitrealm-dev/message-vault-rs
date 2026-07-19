use std::path::{Component, Path, PathBuf};
use std::sync::Arc;

use axum::extract::{FromRequest, Multipart, Query, Request, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use tower_http::limit::RequestBodyLimitLayer;

use rusqlite::{params, Connection, OptionalExtension};

use crate::config::Config;
use crate::dedupe;
use crate::import::{self, ImportMode, ImportOptions, ImportStats};
use crate::schema;

const MAX_BODY_BYTES: usize = 512 * 1024 * 1024; // 512 MiB (multipart uploads)

#[derive(Clone)]
struct AppState {
    cfg: Arc<Config>,
    /// Serialize imports — SQLite writes are not safe to overlap from this process.
    import_lock: Arc<Mutex<()>>,
}

#[derive(Debug, Deserialize)]
struct ImportQuery {
    source: String,
    account: String,
    #[serde(default = "default_import_mode")]
    mode: String,
    /// Run cross-source soft-dedupe after import.
    #[serde(default)]
    dedupe: bool,
}

fn default_import_mode() -> String {
    "append".to_string()
}

#[derive(Debug, Serialize)]
struct ImportResponse {
    ok: bool,
    source: String,
    account: String,
    #[serde(flatten)]
    stats: ImportStats,
    #[serde(skip_serializing_if = "Option::is_none")]
    dedupe: Option<DedupeResponse>,
}

#[derive(Debug, Serialize)]
struct DedupeResponse {
    keys_filled: u64,
    exact_groups: u64,
    exact_flagged: u64,
    near_flagged: u64,
}

#[derive(Debug, Serialize)]
struct ErrorBody {
    ok: bool,
    error: String,
}

enum ApiError {
    Unauthorized(String),
    BadRequest(String),
    Internal(String),
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            Self::Unauthorized(m) => (StatusCode::UNAUTHORIZED, m),
            Self::BadRequest(m) => (StatusCode::BAD_REQUEST, m),
            Self::Internal(m) => (StatusCode::INTERNAL_SERVER_ERROR, m),
        };
        (
            status,
            Json(ErrorBody {
                ok: false,
                error: message,
            }),
        )
            .into_response()
    }
}

pub async fn run(cfg: Config) -> anyhow::Result<()> {
    let server = cfg.require_server()?.clone();
    let bind = server.bind.clone();

    let state = AppState {
        cfg: Arc::new(cfg),
        import_lock: Arc::new(Mutex::new(())),
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/v1/auth/check", get(auth_check))
        .route("/v1/import", post(import_handler))
        .layer(RequestBodyLimitLayer::new(MAX_BODY_BYTES))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(&bind).await?;
    eprintln!("message-vault-rs serve listening on http://{bind}");
    eprintln!("  GET  /health");
    eprintln!("  GET  /v1/auth/check?account=   (Bearer token)");
    eprintln!(
        "  POST /v1/import?source=&account=&mode=append|replace&dedupe=false"
    );
    eprintln!("       Content-Type: application/x-ndjson  (body only; assets from export_dir)");
    eprintln!(
        "       Content-Type: multipart/form-data   (field ndjson + file parts; remote push)"
    );
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
    eprintln!("shutting down");
}

async fn health() -> impl IntoResponse {
    (StatusCode::OK, "ok\n")
}

#[derive(Debug, Deserialize)]
struct AuthCheckQuery {
    #[serde(default)]
    account: Option<String>,
}

#[derive(Debug, Serialize)]
struct AuthCheckResponse {
    ok: bool,
    sources: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    account_ok: Option<bool>,
}

async fn auth_check(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<AuthCheckQuery>,
) -> Result<Json<AuthCheckResponse>, ApiError> {
    let server = state
        .cfg
        .require_server()
        .map_err(|e| ApiError::Internal(e.to_string()))?;
    check_bearer(&headers, &server.api_token)?;

    let sources: Vec<String> = state.cfg.sources.iter().map(|s| s.id.clone()).collect();

    let account_ok = if let Some(account) = query.account.as_deref().map(str::trim) {
        if account.is_empty() {
            Some(false)
        } else {
            let db = state.cfg.paths.db.clone();
            let account = account.to_string();
            let exists = tokio::task::spawn_blocking(move || account_exists(&db, &account))
                .await
                .map_err(|e| ApiError::Internal(format!("auth check task: {e}")))?
                .map_err(|e| ApiError::Internal(e.to_string()))?;
            Some(exists)
        }
    } else {
        None
    };

    Ok(Json(AuthCheckResponse {
        ok: true,
        sources,
        account_ok,
    }))
}

fn account_exists(db_path: &Path, account_id: &str) -> anyhow::Result<bool> {
    let conn = Connection::open(db_path)?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    schema::ensure_accounts_schema(&conn)?;
    let found: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM accounts WHERE id = ?1",
            params![account_id],
            |row| row.get(0),
        )
        .optional()?;
    Ok(found.is_some())
}

fn check_bearer(headers: &HeaderMap, expected: &str) -> Result<(), ApiError> {
    let Some(value) = headers.get(header::AUTHORIZATION) else {
        return Err(ApiError::Unauthorized(
            "missing Authorization: Bearer <token>".into(),
        ));
    };
    let value = value
        .to_str()
        .map_err(|_| ApiError::Unauthorized("invalid Authorization header".into()))?;
    let Some(token) = value.strip_prefix("Bearer ") else {
        return Err(ApiError::Unauthorized(
            "Authorization must be Bearer <token>".into(),
        ));
    };
    if token != expected {
        return Err(ApiError::Unauthorized("invalid API token".into()));
    }
    Ok(())
}

fn content_type_base(headers: &HeaderMap) -> Option<&str> {
    let ct = headers.get(header::CONTENT_TYPE)?.to_str().ok()?;
    Some(ct.split(';').next().unwrap_or(ct).trim())
}

fn is_ndjson_content_type(base: &str) -> bool {
    base.eq_ignore_ascii_case("application/x-ndjson")
        || base.eq_ignore_ascii_case("application/ndjson")
}

fn is_multipart_content_type(base: &str) -> bool {
    base.eq_ignore_ascii_case("multipart/form-data")
}

/// Reject path traversal; allow only relative Normal/CurDir components.
fn safe_rel_path(name: &str) -> Result<PathBuf, ApiError> {
    let name = name.trim();
    if name.is_empty() {
        return Err(ApiError::BadRequest("empty attachment path".into()));
    }
    let path = Path::new(name);
    if path.is_absolute() {
        return Err(ApiError::BadRequest(format!(
            "attachment path must be relative: {name}"
        )));
    }
    let mut out = PathBuf::new();
    for comp in path.components() {
        match comp {
            Component::Normal(s) => out.push(s),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(ApiError::BadRequest(format!(
                    "unsafe attachment path: {name}"
                )));
            }
        }
    }
    if out.as_os_str().is_empty() {
        return Err(ApiError::BadRequest(format!(
            "empty attachment path after normalize: {name}"
        )));
    }
    Ok(out)
}

async fn import_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ImportQuery>,
    request: Request,
) -> Result<Json<ImportResponse>, ApiError> {
    let server = state
        .cfg
        .require_server()
        .map_err(|e| ApiError::Internal(e.to_string()))?;
    check_bearer(&headers, &server.api_token)?;

    let Some(ct) = content_type_base(&headers) else {
        return Err(ApiError::BadRequest(
            "Content-Type required (application/x-ndjson or multipart/form-data)".into(),
        ));
    };

    validate_import_query(&query)?;

    if is_multipart_content_type(ct) {
        let multipart = Multipart::from_request(request, &state)
            .await
            .map_err(|e| ApiError::BadRequest(format!("invalid multipart body: {e}")))?;
        return import_multipart(state, query, multipart).await;
    }

    if is_ndjson_content_type(ct) {
        let body = axum::body::to_bytes(request.into_body(), MAX_BODY_BYTES)
            .await
            .map_err(|e| ApiError::BadRequest(format!("failed to read body: {e}")))?;
        if body.is_empty() {
            return Err(ApiError::BadRequest("request body is empty".into()));
        }
        return run_import(state, query, body.to_vec(), None).await;
    }

    Err(ApiError::BadRequest(
        "Content-Type must be application/x-ndjson or multipart/form-data".into(),
    ))
}

fn validate_import_query(query: &ImportQuery) -> Result<(), ApiError> {
    if query.source.trim().is_empty() {
        return Err(ApiError::BadRequest("query param source is required".into()));
    }
    if query.account.trim().is_empty() {
        return Err(ApiError::BadRequest("query param account is required".into()));
    }
    Ok(())
}

async fn stream_field_to_file(
    mut field: axum::extract::multipart::Field<'_>,
    dest: &Path,
) -> Result<u64, ApiError> {
    use tokio::io::AsyncWriteExt;

    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent).await.map_err(|e| {
            ApiError::Internal(format!("mkdir {}: {e}", parent.display()))
        })?;
    }
    let mut file = tokio::fs::File::create(dest)
        .await
        .map_err(|e| ApiError::Internal(format!("create {}: {e}", dest.display())))?;
    let mut written = 0u64;
    while let Some(chunk) = field
        .chunk()
        .await
        .map_err(|e| ApiError::BadRequest(format!("multipart chunk: {e}")))?
    {
        file.write_all(&chunk)
            .await
            .map_err(|e| ApiError::Internal(format!("write {}: {e}", dest.display())))?;
        written += chunk.len() as u64;
    }
    file.flush()
        .await
        .map_err(|e| ApiError::Internal(format!("flush {}: {e}", dest.display())))?;
    Ok(written)
}

async fn import_multipart(
    state: AppState,
    query: ImportQuery,
    mut multipart: Multipart,
) -> Result<Json<ImportResponse>, ApiError> {
    let temp = tempfile::tempdir()
        .map_err(|e| ApiError::Internal(format!("temp dir: {e}")))?;
    let asset_root = temp.path().to_path_buf();
    let ndjson_path = asset_root.join("_import.ndjson");
    let mut have_ndjson = false;
    let mut file_count = 0u64;

    while let Some(mut field) = multipart
        .next_field()
        .await
        .map_err(|e| ApiError::BadRequest(format!("multipart field error: {e}")))?
    {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "ndjson" => {
                let n = stream_field_to_file(field, &ndjson_path).await?;
                if n == 0 {
                    return Err(ApiError::BadRequest("ndjson part is empty".into()));
                }
                have_ndjson = true;
            }
            "file" => {
                let filename = field
                    .file_name()
                    .map(|s| s.to_string())
                    .filter(|s| !s.is_empty())
                    .ok_or_else(|| {
                        ApiError::BadRequest(
                            "file part missing filename (use relative path e.g. attachments/a.jpg)"
                                .into(),
                        )
                    })?;
                let rel = safe_rel_path(&filename)?;
                let dest = asset_root.join(&rel);
                stream_field_to_file(field, &dest).await?;
                file_count += 1;
            }
            other => {
                while let Some(chunk) = field
                    .chunk()
                    .await
                    .map_err(|e| ApiError::BadRequest(format!("multipart chunk: {e}")))?
                {
                    let _ = chunk;
                }
                eprintln!("import: ignoring unknown multipart field {other:?}");
            }
        }
    }

    if !have_ndjson {
        return Err(ApiError::BadRequest(
            "multipart missing required field 'ndjson'".into(),
        ));
    }
    let ndjson = tokio::fs::read(&ndjson_path)
        .await
        .map_err(|e| ApiError::Internal(format!("read ndjson temp: {e}")))?;
    eprintln!("import: multipart ndjson + {file_count} file(s)");

    let response = run_import(state, query, ndjson, Some(asset_root)).await;
    drop(temp);
    response
}

async fn run_import(
    state: AppState,
    query: ImportQuery,
    ndjson: Vec<u8>,
    asset_root_override: Option<PathBuf>,
) -> Result<Json<ImportResponse>, ApiError> {
    let mode = ImportMode::parse(&query.mode).map_err(|e| ApiError::BadRequest(e.to_string()))?;
    let source = state
        .cfg
        .source(&query.source)
        .map_err(|e| ApiError::BadRequest(e.to_string()))?
        .clone();

    let cfg = Arc::clone(&state.cfg);
    let account = query.account.clone();
    let source_id = source.id.clone();
    let do_dedupe = query.dedupe;

    let _guard = state.import_lock.lock().await;

    let result = tokio::task::spawn_blocking(move || {
        let assets_dir = source.resolved_assets_dir_for_account(&cfg.paths, &account);
        let asset_root = asset_root_override
            .as_deref()
            .unwrap_or(source.export_dir.as_path());
        let opts = ImportOptions {
            db_path: &cfg.paths.db,
            assets_dir: &assets_dir,
            asset_root,
            contacts_csv: &cfg.paths.contacts_csv,
            exclude_csv: &cfg.paths.exclude_csv,
            overwrite_contacts: false,
            mode,
            source: &source_id,
            account_id: &account,
        };
        let stats = import::import_ndjson_bytes(&ndjson, &opts)?;
        let dedupe_stats = if do_dedupe {
            let priority: Vec<String> = cfg.sources.iter().map(|s| s.id.clone()).collect();
            Some(dedupe::run_dedupe(&cfg.paths.db, &account, &priority, 2)?)
        } else {
            None
        };
        Ok::<_, anyhow::Error>((stats, dedupe_stats, source_id, account))
    })
    .await
    .map_err(|e| ApiError::Internal(format!("import task failed: {e}")))?
    .map_err(|e| ApiError::Internal(e.to_string()))?;

    let (stats, dedupe_stats, source_id, account) = result;
    Ok(Json(ImportResponse {
        ok: true,
        source: source_id,
        account,
        stats,
        dedupe: dedupe_stats.map(|d| DedupeResponse {
            keys_filled: d.keys_filled,
            exact_groups: d.exact_groups,
            exact_flagged: d.exact_flagged,
            near_flagged: d.near_flagged,
        }),
    }))
}
