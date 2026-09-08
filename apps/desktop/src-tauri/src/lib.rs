use tauri::{Url, WebviewUrl};
#[cfg(desktop)]
use tauri::WebviewWindowBuilder;
#[cfg(desktop)]
use tauri::{AppHandle, Manager};
#[cfg(desktop)]
use tauri::menu::{Menu, MenuItem};
#[cfg(desktop)]
use tauri::tray::TrayIconBuilder;
#[cfg(desktop)]
use tauri_plugin_deep_link::DeepLinkExt;
#[cfg(desktop)]
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_sql::{Migration, MigrationKind};

mod desktop;
mod media;
mod screen_share;
mod sfu;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg(desktop)]
fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&quit_i])?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("Teamspace One")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}

#[cfg(desktop)]
fn setup_global_shortcut(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyR);
    app.global_shortcut().register(shortcut)?;
    Ok(())
}

#[cfg(desktop)]
fn setup_deep_link(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(any(windows, target_os = "linux"))]
    {
        app.deep_link().register("teamspace-one")?;
    }

    app.deep_link().on_open_url(|_| {});

    let _ = app.deep_link().get_current()?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_offline_queue",
            sql: "CREATE TABLE IF NOT EXISTS offline_queue (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                payload TEXT NOT NULL,
                organisation_id TEXT NOT NULL,
                retry_count INTEGER DEFAULT 0,
                created_at TEXT NOT NULL
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_drafts",
            sql: "CREATE TABLE IF NOT EXISTS drafts (
                id TEXT PRIMARY KEY,
                organisation_id TEXT NOT NULL,
                workspace_id TEXT,
                type TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "create_cache",
            sql: "CREATE TABLE IF NOT EXISTS cache (
                key TEXT PRIMARY KEY,
                organisation_id TEXT NOT NULL,
                value TEXT NOT NULL,
                cached_at TEXT NOT NULL
            );",
            kind: MigrationKind::Up,
        },
    ];

    #[cfg(desktop)]
    let mut builder = tauri::Builder::default();
    #[cfg(not(desktop))]
    let builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}));
    }

    #[cfg(all(not(dev), desktop))]
    let port = portpicker::pick_unused_port().expect("failed to find unused port");

    #[cfg(all(not(dev), desktop))]
    {
        builder = builder.plugin(tauri_plugin_localhost::Builder::new(port).build());
    }

    #[cfg(desktop)]
    {
        builder = builder.plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|_app, shortcut, event| {
                    if shortcut == &Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyR) {
                        match event.state() {
                            ShortcutState::Pressed => println!("Ctrl+Shift+R Pressed"),
                            ShortcutState::Released => println!("Ctrl+Shift+R Released"),
                        }
                    }
                })
                .build(),
        );
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:teamspace-one.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .manage(media::CameraState::new())
        .manage(media::MicrophoneState::new())
        .manage(screen_share::ScreenShareState::new())
        .manage(sfu::SfuState::new())
        .invoke_handler(tauri::generate_handler![
            greet,
            desktop::store_secure_token,
            desktop::get_secure_token,
            desktop::delete_secure_token,
            desktop::show_notification,
            desktop::pick_file,
            desktop::get_deep_link,
            desktop::get_app_info,
            media::list_cameras,
            media::list_microphones,
            media::start_camera,
            media::stop_camera,
            media::get_camera_frame,
            media::start_microphone,
            media::stop_microphone,
            media::get_microphone_chunk,
            screen_share::start_screen_share,
            screen_share::stop_screen_share,
            sfu::sfu_join,
            sfu::sfu_leave,
        ])
        .setup(move |app| {
            #[cfg(desktop)]
            {
                setup_tray(app.app_handle())?;
                setup_global_shortcut(app.app_handle())?;
                setup_deep_link(app.app_handle())?;
            }

            #[cfg(desktop)]
            {
                #[cfg(dev)]
                let url = WebviewUrl::External("http://localhost:1420".parse::<Url>().unwrap());
                #[cfg(not(dev))]
                let url = WebviewUrl::External(format!("http://localhost:{}", port).parse::<Url>().unwrap());

                let _window = WebviewWindowBuilder::new(app, "main".to_string(), url)
                    .title("Teamspace One")
                    .inner_size(1200.0, 800.0)
                    .min_inner_size(800.0, 600.0)
                    .disable_drag_drop_handler()
                    .devtools(cfg!(debug_assertions))
                    .build()?;

                // Open the web inspector so console errors are visible during testing.
                #[cfg(debug_assertions)]
                {
                    let _ = _window.open_devtools();
                }
            }

            // On iOS and Android Tauri creates the main webview automatically from
            // tauri.conf.json / tauri.{ios,android}.conf.json, so we do not build one here.
            #[cfg(not(desktop))]
            {
                let _ = ();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

