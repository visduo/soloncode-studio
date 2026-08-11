use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, RunEvent, WindowEvent,
};
use tauri_plugin_notification::NotificationExt;

mod cli_session;
mod context_menu;
mod frame_http_auth;
mod http_auth;
mod installer;
mod models;
mod platform;
mod process;
mod session;
mod state;
mod version;
mod web_session;
mod workspace;

use cli_session::send_cli_input;
use context_menu::context_menu_script;
use frame_http_auth::frame_http_auth_script;
use http_auth::check_http_auth;
use installer::{install_soloncode, uninstall_soloncode};
#[cfg(target_os = "linux")]
use platform::configure_linux_webkit_gpu_fallback;
use platform::{
    open_external_url, open_soloncode_system_terminal, open_studio_github_release_page,
};
use process::{cleanup_soloncode_process, start_soloncode, stop_soloncode};
use state::SolonState;
use version::{
    check_java, check_soloncode, check_versions, pick_java_executable,
    resolve_system_java_executable, studio_version,
};
use workspace::{home_workspace_path, pick_workspace, reveal_workspace};

const TRAY_MENU_OPEN: &str = "open";
const TRAY_MENU_QUIT: &str = "quit";

fn mark_should_exit(state: &SolonState) {
    if let Ok(mut should_exit) = state.should_exit.lock() {
        *should_exit = true;
    }
}

fn should_exit(state: &SolonState) -> bool {
    state
        .should_exit
        .lock()
        .map(|should_exit| *should_exit)
        .unwrap_or(true)
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn minimize_main_window_to_tray(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

#[tauri::command]
fn open_devtools(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        window.open_devtools();
    }
}

fn exit_app(app: &tauri::AppHandle) {
    let state = app.state::<SolonState>();
    mark_should_exit(&state);
    app.exit(0);
}

fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, TRAY_MENU_OPEN, "打开", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, TRAY_MENU_QUIT, "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;
    #[cfg(target_os = "macos")]
    let tray_menu = menu.clone();
    let mut tray = TrayIconBuilder::new()
        .show_menu_on_left_click(false)
        .tooltip("SolonCode Studio")
        .on_tray_icon_event(move |tray, event| match event {
            tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                button_state: tauri::tray::MouseButtonState::Up,
                ..
            }
            | tauri::tray::TrayIconEvent::DoubleClick {
                button: tauri::tray::MouseButton::Left,
                ..
            } => show_main_window(tray.app_handle()),
            #[cfg(target_os = "macos")]
            tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Right,
                button_state: tauri::tray::MouseButtonState::Up,
                ..
            } => {
                if let Some(window) = tray.app_handle().get_webview_window("main") {
                    let _ = window.popup_menu(&tray_menu);
                }
            }
            _ => {}
        })
        .on_menu_event(
            |app, event: tauri::menu::MenuEvent| match event.id().as_ref() {
                TRAY_MENU_OPEN => show_main_window(app),
                TRAY_MENU_QUIT => exit_app(app),
                _ => {}
            },
        );
    #[cfg(not(target_os = "macos"))]
    {
        tray = tray.menu(&menu);
    }
    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }
    tray.build(app)?;
    Ok(())
}

#[tauri::command]
fn go_home(app: tauri::AppHandle) -> Result<(), String> {
    app.emit("soloncode-go-home", ()).map_err(|e| e.to_string())
}

#[tauri::command]
fn minimize_to_tray(app: tauri::AppHandle) -> Result<(), String> {
    minimize_main_window_to_tray(&app);
    Ok(())
}

#[tauri::command]
fn quit_studio(app: tauri::AppHandle) -> Result<(), String> {
    exit_app(&app);
    Ok(())
}

#[tauri::command]
fn show_task_finished_notification(
    app: tauri::AppHandle,
    title: String,
    body: String,
) -> Result<(), String> {
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .sound("default")
        .show()
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    configure_linux_webkit_gpu_fallback();

    tauri::Builder::default()
        .plugin(
            tauri::plugin::Builder::<_, ()>::new("frame-http-auth")
                .js_init_script_on_all_frames(frame_http_auth_script())
                .build(),
        )
        .plugin(
            tauri::plugin::Builder::<_, ()>::new("disable-context-menu")
                .js_init_script_on_all_frames(context_menu_script())
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .manage(SolonState {
            processes: Mutex::new(HashMap::new()),
            cli_outputs: Arc::new(Mutex::new(HashMap::new())),
            should_exit: Mutex::new(false),
        })
        .setup(|app| {
            setup_tray(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            check_soloncode,
            check_java,
            check_http_auth,
            resolve_system_java_executable,
            pick_java_executable,
            studio_version,
            check_versions,
            pick_workspace,
            home_workspace_path,
            reveal_workspace,
            open_studio_github_release_page,
            open_external_url,
            open_soloncode_system_terminal,
            install_soloncode,
            uninstall_soloncode,
            start_soloncode,
            stop_soloncode,
            send_cli_input,
            go_home,
            minimize_to_tray,
            open_devtools,
            quit_studio,
            show_task_finished_notification,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| match event {
            #[cfg(target_os = "macos")]
            RunEvent::Reopen { .. } => {
                show_main_window(app_handle);
            }
            RunEvent::WindowEvent {
                event: WindowEvent::CloseRequested { api, .. },
                ..
            } => {
                let state = app_handle.state::<SolonState>();
                if !should_exit(&state) {
                    api.prevent_close();
                    let _ = app_handle.emit("soloncode-close-requested", ());
                }
            }
            RunEvent::ExitRequested { .. } | RunEvent::Exit => {
                let state = app_handle.state::<SolonState>();
                cleanup_soloncode_process(&state);
            }
            _ => {}
        });
}
