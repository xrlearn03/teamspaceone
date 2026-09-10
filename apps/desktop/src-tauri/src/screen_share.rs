#[cfg(desktop)]
mod desktop {
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use image::codecs::jpeg::JpegEncoder;
use scap::capturer::{Capturer, CapturerBuildError, Options, Resolution};
use scap::frame::{Frame, FrameType};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use tauri::{AppHandle, Emitter};

pub struct ScreenShareState {
    pub latest: Arc<Mutex<Option<Vec<u8>>>>,
    pub stop: Arc<AtomicBool>,
    pub handle: Mutex<Option<JoinHandle<()>>>,
}

impl ScreenShareState {
    pub fn new() -> Self {
        Self {
            latest: Arc::new(Mutex::new(None)),
            stop: Arc::new(AtomicBool::new(true)),
            handle: Mutex::new(None),
        }
    }
}

fn encode_rgb_to_jpeg(data: &[u8], width: u32, height: u32) -> Option<Vec<u8>> {
    let img = image::RgbImage::from_raw(width, height, data.to_vec())?;
    let mut out = Vec::new();
    let mut encoder = JpegEncoder::new_with_quality(&mut out, 60);
    encoder.encode_image(&img).ok()?;
    Some(out)
}

#[tauri::command(rename = "start-screen-share")]
pub fn start_screen_share(
    app: AppHandle,
    state: tauri::State<'_, ScreenShareState>,
) -> Result<(), String> {
    stop_screen_share_state(&state);

    if !scap::is_supported() {
        return Err("Screen capture is not supported on this platform".into());
    }

    // macOS requires screen-capture permission requests to run on the main thread
    // so the system dialog can be shown and brought to the foreground.
    if !scap::has_permission() {
        let (tx, rx) = std::sync::mpsc::channel();
        app.run_on_main_thread(move || {
            let granted = scap::request_permission();
            let _ = tx.send(granted);
        })
        .map_err(|err| format!("Failed to request screen capture permission: {err}"))?;

        let granted = rx
            .recv()
            .map_err(|_| "Screen capture permission request was cancelled".to_string())?;
        if !granted {
            return Err("Screen capture permission was denied. Please enable it in System Settings > Privacy & Security > Screen Recording.".into());
        }
    }

    if !scap::has_permission() {
        return Err("Screen capture permission was not granted.".into());
    }

    let latest = state.latest.clone();
    let stop = state.stop.clone();
    stop.store(false, Ordering::Relaxed);

    let handle = std::thread::spawn(move || {
        let options = Options {
            fps: 15,
            target: None,
            show_cursor: true,
            show_highlight: false,
            excluded_targets: None,
            output_type: FrameType::RGB,
            output_resolution: Resolution::_720p,
            crop_area: None,
        };

        let mut capturer = match Capturer::build(options) {
            Ok(c) => c,
            Err(CapturerBuildError::NotSupported) => {
                eprintln!("Screen capture is not supported");
                return;
            }
            Err(CapturerBuildError::PermissionNotGranted) => {
                eprintln!("Screen capture permission not granted");
                return;
            }
        };

        capturer.start_capture();

        while !stop.load(Ordering::Relaxed) {
            match capturer.get_next_frame() {
                Ok(Frame::RGB(frame)) => {
                    if let Some(jpeg) =
                        encode_rgb_to_jpeg(&frame.data, frame.width as u32, frame.height as u32)
                    {
                        if let Ok(mut guard) = latest.lock() {
                            *guard = Some(jpeg.clone());
                        }
                        let payload = format!("data:image/jpeg;base64,{}", BASE64.encode(&jpeg));
                        if let Err(err) = app.emit("screen-frame", payload) {
                            eprintln!("Failed to emit screen frame: {}", err);
                        }
                    }
                }
                Ok(_) => {}
                Err(err) => {
                    eprintln!("Screen capture frame error: {}", err);
                    break;
                }
            }
        }

        capturer.stop_capture();
    });

    *state.handle.lock().map_err(|e| e.to_string())? = Some(handle);
    Ok(())
}

#[tauri::command(rename = "stop-screen-share")]
pub fn stop_screen_share(state: tauri::State<'_, ScreenShareState>) -> Result<(), String> {
    stop_screen_share_state(&state);
    Ok(())
}

fn stop_screen_share_state(state: &ScreenShareState) {
    state.stop.store(true, Ordering::Relaxed);
    if let Ok(mut guard) = state.handle.lock() {
        if let Some(handle) = guard.take() {
            handle.join().ok();
        }
    }
    if let Ok(mut guard) = state.latest.lock() {
        *guard = None;
    }
}
}
#[cfg(desktop)]
pub use desktop::*;

#[cfg(not(desktop))]
mod mobile {
    use std::sync::atomic::AtomicBool;
    use std::sync::{Arc, Mutex};
    use std::thread::JoinHandle;

    pub struct ScreenShareState {
        pub latest: Arc<Mutex<Option<Vec<u8>>>>,
        pub stop: Arc<AtomicBool>,
        pub handle: Mutex<Option<JoinHandle<()>>>,
    }

    impl ScreenShareState {
        pub fn new() -> Self {
            Self {
                latest: Arc::new(Mutex::new(None)),
                stop: Arc::new(AtomicBool::new(true)),
                handle: Mutex::new(None),
            }
        }
    }

    #[tauri::command(rename = "start-screen-share")]
    pub fn start_screen_share(
        _app: tauri::AppHandle,
        _state: tauri::State<'_, ScreenShareState>,
    ) -> Result<(), String> {
        Err("Screen sharing is not supported on this platform".into())
    }

    #[tauri::command(rename = "stop-screen-share")]
    pub fn stop_screen_share(_state: tauri::State<'_, ScreenShareState>) -> Result<(), String> {
        Err("Screen sharing is not supported on this platform".into())
    }
}

#[cfg(not(desktop))]
pub use mobile::*;
