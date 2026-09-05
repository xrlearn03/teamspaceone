use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use nokhwa::{
    nokhwa_initialize,
    query,
    utils::{ApiBackend, CameraIndex, RequestedFormat, RequestedFormatType},
    Camera,
};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;

#[derive(Serialize, Clone)]
pub struct MediaDevice {
    pub id: String,
    pub name: String,
}

#[tauri::command(rename = "list-cameras")]
pub fn list_cameras(app: tauri::AppHandle) -> Result<Vec<MediaDevice>, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        nokhwa_initialize(move |granted| {
            let _ = tx.send(granted);
        });
    })
    .map_err(|e| e.to_string())?;

    let granted = rx
        .recv()
        .map_err(|_| "Camera permission request was cancelled".to_string())?;
    if !granted {
        return Err("Camera access was denied. Please enable it in System Settings > Privacy & Security > Camera.".into());
    }

    let backend = ApiBackend::Auto;
    let infos = query(backend).map_err(|e| e.to_string())?;
    Ok(infos
        .iter()
        .map(|info| MediaDevice {
            id: info.index().to_string(),
            name: info.human_name(),
        })
        .collect())
}

#[tauri::command(rename = "list-microphones")]
pub fn list_microphones() -> Result<Vec<MediaDevice>, String> {
    let host = cpal::default_host();
    let devices: Vec<_> = host
        .input_devices()
        .map_err(|e| e.to_string())?
        .collect();
    Ok(devices
        .into_iter()
        .enumerate()
        .map(|(i, d)| MediaDevice {
            id: i.to_string(),
            name: d.name().unwrap_or_else(|_| "Microphone".to_string()),
        })
        .collect())
}

pub struct CameraState {
    latest: Arc<Mutex<Option<Vec<u8>>>>,
    stop: Arc<AtomicBool>,
    handle: Mutex<Option<JoinHandle<()>>>,
}

impl CameraState {
    pub fn new() -> Self {
        Self {
            latest: Arc::new(Mutex::new(None)),
            stop: Arc::new(AtomicBool::new(true)),
            handle: Mutex::new(None),
        }
    }
}

#[tauri::command(rename = "start-camera")]
pub fn start_camera(state: tauri::State<CameraState>, index: u32) -> Result<(), String> {
    // Stop any existing capture first.
    state.stop.store(true, Ordering::Relaxed);
    if let Some(handle) = state.handle.lock().map_err(|e| e.to_string())?.take() {
        handle.join().ok();
    }
    *state.latest.lock().map_err(|e| e.to_string())? = None;

    let latest = state.latest.clone();
    let stop = state.stop.clone();
    state.stop.store(false, Ordering::Relaxed);

    let requested = RequestedFormat::new::<nokhwa::pixel_format::RgbFormat>(
        RequestedFormatType::AbsoluteHighestFrameRate,
    );

    let handle = std::thread::spawn(move || {
        let mut camera = match Camera::new(CameraIndex::Index(index), requested) {
            Ok(c) => c,
            Err(err) => {
                eprintln!("Failed to create camera: {err}");
                return;
            }
        };

        if let Err(err) = camera.open_stream() {
            eprintln!("Failed to open camera stream: {err}");
            return;
        }

        while !stop.load(Ordering::Relaxed) {
            match camera.frame() {
                Ok(frame) => match frame.decode_image::<nokhwa::pixel_format::RgbFormat>() {
                    Ok(image) => {
                        let mut jpeg = Vec::new();
                        let mut encoder = image::codecs::jpeg::JpegEncoder::new(&mut jpeg);
                        if encoder.encode_image(&image).is_ok() {
                            if let Ok(mut guard) = latest.lock() {
                                *guard = Some(jpeg);
                            }
                        }
                    }
                    Err(err) => eprintln!("Failed to decode camera frame: {err}"),
                },
                Err(err) => {
                    eprintln!("Failed to capture camera frame: {err}");
                    break;
                }
            }
            std::thread::sleep(Duration::from_millis(1));
        }

        let _ = camera.stop_stream();
    });

    *state.handle.lock().map_err(|e| e.to_string())? = Some(handle);
    Ok(())
}

#[tauri::command(rename = "stop-camera")]
pub fn stop_camera(state: tauri::State<CameraState>) -> Result<(), String> {
    state.stop.store(true, Ordering::Relaxed);
    if let Some(handle) = state.handle.lock().map_err(|e| e.to_string())?.take() {
        handle.join().ok();
    }
    *state.latest.lock().map_err(|e| e.to_string())? = None;
    Ok(())
}

#[tauri::command(rename = "get-camera-frame")]
pub fn get_camera_frame(state: tauri::State<CameraState>) -> Result<String, String> {
    let guard = state.latest.lock().map_err(|e| e.to_string())?;
    match guard.as_ref() {
        Some(jpeg) => Ok(format!("data:image/jpeg;base64,{}", BASE64.encode(jpeg))),
        None => Err("No camera frame available".to_string()),
    }
}

pub struct MicrophoneState {
    buffer: Arc<Mutex<Vec<f32>>>,
    stop: Arc<AtomicBool>,
    handle: Mutex<Option<JoinHandle<()>>>,
}

impl MicrophoneState {
    pub fn new() -> Self {
        Self {
            buffer: Arc::new(Mutex::new(Vec::new())),
            stop: Arc::new(AtomicBool::new(true)),
            handle: Mutex::new(None),
        }
    }
}

#[derive(Serialize, Clone, Copy)]
pub struct MicFormat {
    pub sample_rate: u32,
    pub channels: u16,
}

#[tauri::command(rename = "start-microphone")]
pub fn start_microphone(state: tauri::State<MicrophoneState>, index: usize) -> Result<MicFormat, String> {
    state.stop.store(true, Ordering::Relaxed);
    if let Some(handle) = state.handle.lock().map_err(|e| e.to_string())?.take() {
        handle.join().ok();
    }
    *state.buffer.lock().map_err(|e| e.to_string())? = Vec::new();
    state.stop.store(false, Ordering::Relaxed);

    let buffer = state.buffer.clone();
    let stop = state.stop.clone();
    let (fmt_tx, fmt_rx) = std::sync::mpsc::channel();

    let handle = std::thread::spawn(move || {
        let host = cpal::default_host();
        let devices: Vec<_> = match host.input_devices() {
            Ok(d) => d.collect(),
            Err(_) => Vec::new(),
        };
        let device = match devices.get(index).cloned().or_else(|| host.default_input_device()) {
            Some(d) => d,
            None => {
                eprintln!("No microphone available");
                return;
            }
        };

        let supported: Vec<_> = match device.supported_input_configs() {
            Ok(c) => c.collect(),
            Err(err) => {
                eprintln!("Failed to get microphone configs: {err}");
                return;
            }
        };
        if supported.is_empty() {
            eprintln!("No supported microphone configs");
            return;
        }

        let config_range = match supported
            .into_iter()
            .find(|c| c.sample_format() == cpal::SampleFormat::F32)
        {
            Some(c) => c,
            None => {
                eprintln!("No F32 microphone config available");
                return;
            }
        };
        let config = config_range.with_max_sample_rate();
        let format = MicFormat {
            sample_rate: config.sample_rate().0,
            channels: config.channels(),
        };
        let _ = fmt_tx.send(format);

        let stream_config = config.config();
        let max_samples = (format.sample_rate as usize) * (format.channels as usize) * 5;

        let run = stop.clone();
        let err_fn = move |err: cpal::StreamError| {
            eprintln!("CPAL microphone error: {err}");
        };
        let data_fn = move |data: &[f32], _: &cpal::InputCallbackInfo| {
            if stop.load(Ordering::Relaxed) {
                return;
            }
            let mut guard = buffer.lock().unwrap_or_else(|e| e.into_inner());
            guard.extend_from_slice(data);
            if guard.len() > max_samples {
                let overflow = guard.len() - max_samples;
                guard.drain(0..overflow);
            }
        };

        let stream = match device.build_input_stream::<f32, _, _>(&stream_config, data_fn, err_fn, None) {
            Ok(s) => s,
            Err(err) => {
                eprintln!("Failed to build microphone stream: {err}");
                return;
            }
        };

        if let Err(err) = stream.play() {
            eprintln!("Failed to play microphone stream: {err}");
            return;
        }

        while !run.load(Ordering::Relaxed) {
            std::thread::sleep(Duration::from_millis(50));
        }
    });

    *state.handle.lock().map_err(|e| e.to_string())? = Some(handle);
    let format = fmt_rx
        .recv_timeout(Duration::from_secs(5))
        .map_err(|_| "Microphone failed to start".to_string())?;
    Ok(format)
}

#[tauri::command(rename = "stop-microphone")]
pub fn stop_microphone(state: tauri::State<MicrophoneState>) -> Result<(), String> {
    state.stop.store(true, Ordering::Relaxed);
    if let Some(handle) = state.handle.lock().map_err(|e| e.to_string())?.take() {
        handle.join().ok();
    }
    *state.buffer.lock().map_err(|e| e.to_string())? = Vec::new();
    Ok(())
}

#[tauri::command(rename = "get-microphone-chunk")]
pub fn get_microphone_chunk(
    state: tauri::State<MicrophoneState>,
    chunk_size: Option<usize>,
) -> Result<String, String> {
    let mut guard = state.buffer.lock().map_err(|e| e.to_string())?;
    let requested = chunk_size.unwrap_or(2048).min(guard.len());
    if requested == 0 {
        return Ok("".to_string());
    }
    let chunk: Vec<f32> = guard.drain(0..requested).collect();
    let bytes: Vec<u8> = chunk.iter().flat_map(|&f| f.to_le_bytes()).collect();
    Ok(BASE64.encode(&bytes))
}
