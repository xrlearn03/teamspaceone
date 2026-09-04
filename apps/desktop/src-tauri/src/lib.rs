use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_sql::{Migration, MigrationKind};

mod desktop;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

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

fn setup_global_shortcut(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let shortcut = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyR);
    app.global_shortcut().register(shortcut)?;
    Ok(())
}

fn setup_deep_link(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(any(windows, target_os = "linux"))]
    {
        app.deep_link().register("reactify")?;
    }

    app.deep_link().on_open_url(|event| {
        println!("deep link URLs: {:?}", event.urls());
    });

    if let Some(urls) = app.deep_link().get_current()? {
        println!("app opened with deep links: {:?}", urls);
    }

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

    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {}));
    }

    builder
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:reactify.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(
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
        )
        .invoke_handler(tauri::generate_handler![
            greet,
            desktop::store_secure_token,
            desktop::get_secure_token,
            desktop::delete_secure_token,
            desktop::show_notification,
            desktop::pick_file,
            desktop::get_deep_link,
            desktop::get_app_info,
        ])
        .setup(|app| {
            #[cfg(desktop)]
            {
                setup_tray(app.app_handle())?;
                setup_global_shortcut(app.app_handle())?;
                setup_deep_link(app.app_handle())?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
