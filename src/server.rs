use std::sync::Arc;

use axum::body::Bytes;
use axum::extract::{Query, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use tower_http::limit::RequestBodyLimitLayer;

use crate::config::Config;
use crate::dedupe;
use crate::import::{self, ImportMode, ImportOptions, ImportStats};

const MAX_BODY_BYTES: usize = 256 * 1024 * 1024; // 256 MiB

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
        .route("/v1/import", post(import_ndjson))
        .layer(RequestBodyLimitLayer::new(MAX_BODY_BYTES))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(&bind).await?;
    eprintln!("message-vault-rs serve listening on http://{bind}");
    eprintln!("  GET  /health");
    eprintln!("  POST /v1/import?source=&account=&mode=append|replace&dedupe=false");
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

fn content_type_ok(headers: &HeaderMap) -> bool {
    let Some(ct) = headers.get(header::CONTENT_TYPE) else {
        return false;
    };
    let Ok(ct) = ct.to_str() else {
        return false;
    };
    let base = ct.split(';').next().unwrap_or(ct).trim();
    base.eq_ignore_ascii_case("application/x-ndjson")
        || base.eq_ignore_ascii_case("application/ndjson")
}

async fn import_ndjson(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ImportQuery>,
    body: Bytes,
) -> Result<Json<ImportResponse>, ApiError> {
    let server = state
        .cfg
        .require_server()
        .map_err(|e| ApiError::Internal(e.to_string()))?;
    check_bearer(&headers, &server.api_token)?;

    if !content_type_ok(&headers) {
        return Err(ApiError::BadRequest(
            "Content-Type must be application/x-ndjson (or application/ndjson)".into(),
        ));
    }
    if query.source.trim().is_empty() {
        return Err(ApiError::BadRequest("query param source is required".into()));
    }
    if query.account.trim().is_empty() {
        return Err(ApiError::BadRequest("query param account is required".into()));
    }
    if body.is_empty() {
        return Err(ApiError::BadRequest("request body is empty".into()));
    }

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
    let body = body.to_vec();

    let _guard = state.import_lock.lock().await;

    let result = tokio::task::spawn_blocking(move || {
        let assets_dir = source.resolved_assets_dir_for_account(&cfg.paths, &account);
        let opts = ImportOptions {
            db_path: &cfg.paths.db,
            assets_dir: &assets_dir,
            asset_root: &source.export_dir,
            contacts_csv: &cfg.paths.contacts_csv,
            exclude_csv: &cfg.paths.exclude_csv,
            overwrite_contacts: false,
            mode,
            source: &source_id,
            account_id: &account,
        };
        let stats = import::import_ndjson_bytes(&body, &opts)?;
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
