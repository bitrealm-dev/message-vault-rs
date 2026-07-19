//! Cross-platform GUI wrapper around the `vault-push` CLI.

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;

use eframe::egui;
use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize, Default)]
struct SavedPrefs {
    url: String,
    account: String,
    source_id: String,
    remember_token: bool,
    #[serde(default)]
    token: String,
}

struct App {
    url: String,
    token: String,
    account: String,
    source_id: String,
    input_dir: String,
    mode_append: bool,
    continue_on_error: bool,
    force_repush: bool,
    remember_token: bool,
    log: String,
    status: String,
    running: bool,
    last_report: Option<PathBuf>,
    last_log: Option<PathBuf>,
    rx: Option<Receiver<UiMsg>>,
}

enum UiMsg {
    Line(String),
    Done { code: i32, report: PathBuf, log: PathBuf },
}

impl Default for App {
    fn default() -> Self {
        let prefs = load_prefs();
        Self {
            url: prefs.url,
            token: if prefs.remember_token {
                prefs.token
            } else {
                String::new()
            },
            account: prefs.account,
            source_id: prefs.source_id,
            input_dir: String::new(),
            mode_append: true,
            continue_on_error: true,
            force_repush: false,
            remember_token: prefs.remember_token,
            log: String::new(),
            status: "Ready.".into(),
            running: false,
            last_report: None,
            last_log: None,
            rx: None,
        }
    }
}

fn prefs_path() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("message-vault")
        .join("vault-push-gui.json")
}

fn load_prefs() -> SavedPrefs {
    let path = prefs_path();
    fs_read_json(&path).unwrap_or_default()
}

fn save_prefs(app: &App) {
    let prefs = SavedPrefs {
        url: app.url.clone(),
        account: app.account.clone(),
        source_id: app.source_id.clone(),
        remember_token: app.remember_token,
        token: if app.remember_token {
            app.token.clone()
        } else {
            String::new()
        },
    };
    let path = prefs_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(text) = serde_json::to_string_pretty(&prefs) {
        let _ = std::fs::write(path, text);
    }
}

fn fs_read_json<T: for<'de> Deserialize<'de>>(path: &PathBuf) -> Option<T> {
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

fn find_vault_push() -> PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let sibling = dir.join("vault-push");
            if sibling.is_file() {
                return sibling;
            }
            #[cfg(windows)]
            {
                let sibling = dir.join("vault-push.exe");
                if sibling.is_file() {
                    return sibling;
                }
            }
        }
    }
    PathBuf::from("vault-push")
}

impl App {
    fn start_import(&mut self) {
        if self.running {
            return;
        }
        if self.url.trim().is_empty()
            || self.token.trim().is_empty()
            || self.account.trim().is_empty()
            || self.input_dir.trim().is_empty()
        {
            self.status = "Fill URL, token, account, and export folder.".into();
            return;
        }
        if self.source_id.trim().is_empty() {
            self.status = "Enter a source id (e.g. go-sms-pro, imessage).".into();
            return;
        }

        save_prefs(self);

        let input = PathBuf::from(self.input_dir.trim());
        let report = input.join("vault-push-report.json");
        let log = input.join("vault-push.log");
        let bin = find_vault_push();

        let mut cmd = Command::new(&bin);
        cmd.arg("--input")
            .arg(&input)
            .arg("--url")
            .arg(self.url.trim())
            .arg("--token")
            .arg(self.token.trim())
            .arg("--account")
            .arg(self.account.trim())
            .arg("--source-id")
            .arg(self.source_id.trim())
            .arg("--mode")
            .arg(if self.mode_append { "append" } else { "replace" })
            .arg("--report")
            .arg(&report)
            .arg("--log")
            .arg(&log)
            .arg("--checkpoint")
            .arg(input.join("vault-push-done.json"));
        if self.continue_on_error {
            cmd.arg("--continue-on-error");
        }
        if self.force_repush {
            cmd.arg("--force-repush");
        }
        cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

        self.log.clear();
        self.log.push_str(&format!("Running {} …\n", bin.display()));
        self.status = "Import running…".into();
        self.running = true;
        self.last_report = Some(report.clone());
        self.last_log = Some(log.clone());

        let (tx, rx): (Sender<UiMsg>, Receiver<UiMsg>) = mpsc::channel();
        self.rx = Some(rx);

        thread::spawn(move || {
            let mut child = match cmd.spawn() {
                Ok(c) => c,
                Err(e) => {
                    let _ = tx.send(UiMsg::Line(format!(
                        "failed to start vault-push ({bin:?}): {e}\n\
                         Put vault-push next to this app or on PATH."
                    )));
                    let _ = tx.send(UiMsg::Done {
                        code: 2,
                        report,
                        log,
                    });
                    return;
                }
            };

            let stdout = child.stdout.take();
            let stderr = child.stderr.take();
            let tx2 = tx.clone();
            let t_out = thread::spawn(move || {
                if let Some(out) = stdout {
                    for line in BufReader::new(out).lines().flatten() {
                        let _ = tx2.send(UiMsg::Line(line));
                    }
                }
            });
            let tx3 = tx.clone();
            let t_err = thread::spawn(move || {
                if let Some(err) = stderr {
                    for line in BufReader::new(err).lines().flatten() {
                        let _ = tx3.send(UiMsg::Line(line));
                    }
                }
            });
            let _ = t_out.join();
            let _ = t_err.join();
            let code = child.wait().ok().and_then(|s| s.code()).unwrap_or(1);
            let _ = tx.send(UiMsg::Done {
                code,
                report,
                log,
            });
        });
    }

    fn poll_child(&mut self, ctx: &egui::Context) {
        let Some(rx) = &self.rx else {
            return;
        };
        while let Ok(msg) = rx.try_recv() {
            match msg {
                UiMsg::Line(line) => {
                    self.log.push_str(&line);
                    self.log.push('\n');
                }
                UiMsg::Done { code, report, log } => {
                    self.running = false;
                    self.rx = None;
                    self.last_report = Some(report);
                    self.last_log = Some(log);
                    self.status = if code == 0 {
                        "Import finished successfully.".into()
                    } else {
                        format!("Import finished with errors (exit {code}). See report.")
                    };
                    break;
                }
            }
        }
        if self.running {
            ctx.request_repaint_after(std::time::Duration::from_millis(100));
        }
    }
}

impl eframe::App for App {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        self.poll_child(ctx);

        egui::CentralPanel::default().show(ctx, |ui| {
            ui.heading("Message Vault Import");
            ui.label("Connect to your vault, choose the folder from your exporter, then Import.");
            ui.add_space(8.0);

            egui::Grid::new("conn")
                .num_columns(2)
                .spacing([8.0, 6.0])
                .show(ui, |ui| {
                    ui.label("Vault URL");
                    ui.add(
                        egui::TextEdit::singleline(&mut self.url)
                            .desired_width(400.0)
                            .hint_text("http://127.0.0.1:8080"),
                    );
                    ui.end_row();

                    ui.label("API token");
                    ui.add(
                        egui::TextEdit::singleline(&mut self.token)
                            .password(true)
                            .desired_width(400.0),
                    );
                    ui.end_row();

                    ui.label("Account ID");
                    ui.add(
                        egui::TextEdit::singleline(&mut self.account)
                            .desired_width(400.0)
                            .hint_text("uuid"),
                    );
                    ui.end_row();

                    ui.label("Source");
                    ui.add(
                        egui::TextEdit::singleline(&mut self.source_id)
                            .desired_width(400.0)
                            .hint_text("go-sms-pro / imessage / …"),
                    );
                    ui.end_row();

                    ui.label("Export folder");
                    ui.horizontal(|ui| {
                        ui.add(
                            egui::TextEdit::singleline(&mut self.input_dir).desired_width(320.0),
                        );
                        if ui.button("Browse…").clicked() {
                            if let Some(path) = rfd::FileDialog::new().pick_folder() {
                                self.input_dir = path.display().to_string();
                            }
                        }
                    });
                    ui.end_row();
                });

            ui.horizontal(|ui| {
                ui.checkbox(&mut self.mode_append, "Append (resume-safe)");
                if !self.mode_append {
                    ui.colored_label(egui::Color32::from_rgb(180, 100, 40), "Replace wipes source on first chat");
                }
                ui.checkbox(&mut self.continue_on_error, "Continue on error");
                ui.checkbox(&mut self.force_repush, "Force re-upload all");
                ui.checkbox(&mut self.remember_token, "Remember token");
            });

            ui.add_space(6.0);
            ui.horizontal(|ui| {
                let import = ui.add_enabled(!self.running, egui::Button::new("Import"));
                if import.clicked() {
                    self.start_import();
                }
                ui.label(&self.status);
            });

            ui.add_space(6.0);
            ui.label("Log");
            egui::ScrollArea::vertical()
                .max_height(280.0)
                .stick_to_bottom(true)
                .show(ui, |ui| {
                    ui.add(
                        egui::TextEdit::multiline(&mut self.log)
                            .desired_width(f32::INFINITY)
                            .font(egui::TextStyle::Monospace)
                            .interactive(false),
                    );
                });

            ui.horizontal(|ui| {
                if let Some(path) = &self.last_report {
                    if ui.button("Open report").clicked() {
                        let _ = open::that(path);
                    }
                    ui.label(path.display().to_string());
                }
                if let Some(path) = &self.last_log {
                    if ui.button("Open log").clicked() {
                        let _ = open::that(path);
                    }
                }
            });
        });
    }
}

fn main() -> eframe::Result<()> {
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([720.0, 560.0])
            .with_title("Message Vault Import"),
        ..Default::default()
    };
    eframe::run_native(
        "Message Vault Import",
        options,
        Box::new(|_cc| Ok(Box::new(App::default()))),
    )
}
