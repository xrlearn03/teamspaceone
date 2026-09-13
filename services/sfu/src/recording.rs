//! Per-participant server-side recording.
//!
//! When recording is active for a room, every published track's RTP packets are
//! teed into a media writer (Opus -> `.ogg`, VP8/VP9 -> `.ivf`, H.264 -> `.h264`)
//! under `SFU_RECORDING_DIR/<room>/`. On stop, writers are finalized and the
//! files are uploaded to the file-storage service via `POST /files/upload`
//! using the internal service-to-service headers.

use anyhow::{anyhow, Result};
use serde_json::json;
use std::fs::File;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::{info, warn};
use webrtc::media::io::h264_writer::H264Writer;
use webrtc::media::io::ivf_reader::IVFFileHeader;
use webrtc::media::io::ivf_writer::IVFWriter;
use webrtc::media::io::ogg_writer::OggWriter;
use webrtc::media::io::Writer;
use webrtc::rtp::packet::Packet as RtpPacket;
use webrtc::track::track_remote::TrackRemote;

#[cfg(feature = "rtc")]
use rtc::rtp_transceiver::rtp_sender::RTCRtpCodec;

fn sanitize(s: &str) -> String {
    s.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

fn ivf_header(four_cc: [u8; 4], clock_rate: u32) -> IVFFileHeader {
    IVFFileHeader {
        signature: *b"DKIF",
        version: 0,
        header_size: 32,
        four_cc,
        width: 0,
        height: 0,
        timebase_denominator: clock_rate,
        timebase_numerator: 1,
        num_frames: 0,
        unused: 0,
    }
}

/// One published track's media writer plus the path it is writing to.
pub enum TrackWriter {
    Ivf(IVFWriter<File>),
    Ogg(OggWriter<File>),
    H264(H264Writer<File>),
}

impl TrackWriter {
    /// Creates a writer for `remote` if its codec is recordable, writing to
    /// `dir/<room>-<publisher>-<track>.<ext>`. Returns `None` for codecs we
    /// cannot containerize without decoding (e.g. AV1).
    pub fn create(
        dir: &Path,
        room_id: &str,
        publisher: &str,
        track_id: &str,
        remote: &TrackRemote,
    ) -> Result<Option<(Self, PathBuf)>> {
        let cap = remote.codec().capability;
        let mime = cap.mime_type.to_ascii_lowercase();
        let ext = match mime.as_str() {
            "audio/opus" => "ogg",
            "video/vp8" | "video/vp9" => "ivf",
            "video/h264" => "h264",
            _ => return Ok(None),
        };
        let file_name = format!(
            "{}-{}-{}.{}",
            sanitize(room_id),
            sanitize(publisher),
            sanitize(track_id),
            ext
        );
        let path = dir.join(&file_name);
        let file = File::create(&path)?;
        let writer = match mime.as_str() {
            "audio/opus" => Self::Ogg(OggWriter::new(
                file,
                cap.clock_rate,
                u8::try_from(cap.channels).unwrap_or(2),
            )?),
            "video/vp8" => Self::Ivf(IVFWriter::new(file, &ivf_header(*b"VP80", cap.clock_rate))?),
            "video/vp9" => Self::Ivf(IVFWriter::new(file, &ivf_header(*b"VP90", cap.clock_rate))?),
            "video/h264" => Self::H264(H264Writer::new(file)),
            _ => unreachable!(),
        };
        Ok(Some((writer, path)))
    }

    /// Create a writer from an `rtc` codec descriptor instead of a webrtc `TrackRemote`.
    #[cfg(feature = "rtc")]
    pub fn create_from_rtc_codec(
        dir: &Path,
        room_id: &str,
        publisher: &str,
        track_id: &str,
        codec: &RTCRtpCodec,
    ) -> Result<Option<(Self, PathBuf)>> {
        let mime = codec.mime_type.to_ascii_lowercase();
        let ext = match mime.as_str() {
            "audio/opus" => "ogg",
            "video/vp8" | "video/vp9" => "ivf",
            "video/h264" => "h264",
            _ => return Ok(None),
        };
        let file_name = format!(
            "{}-{}-{}.{}",
            sanitize(room_id),
            sanitize(publisher),
            sanitize(track_id),
            ext
        );
        let path = dir.join(&file_name);
        let file = File::create(&path)?;
        let writer = match mime.as_str() {
            "audio/opus" => Self::Ogg(OggWriter::new(
                file,
                codec.clock_rate,
                u8::try_from(codec.channels).unwrap_or(2),
            )?),
            "video/vp8" => Self::Ivf(IVFWriter::new(
                file,
                &ivf_header(*b"VP80", codec.clock_rate),
            )?),
            "video/vp9" => Self::Ivf(IVFWriter::new(
                file,
                &ivf_header(*b"VP90", codec.clock_rate),
            )?),
            "video/h264" => Self::H264(H264Writer::new(file)),
            _ => unreachable!(),
        };
        Ok(Some((writer, path)))
    }

    pub fn write_rtp(&mut self, pkt: &RtpPacket) {
        let result = match self {
            Self::Ivf(w) => w.write_rtp(pkt),
            Self::Ogg(w) => w.write_rtp(pkt),
            Self::H264(w) => w.write_rtp(pkt),
        };
        if let Err(e) = result {
            warn!("recording write_rtp failed: {}", e);
        }
    }

    pub fn close(mut self) {
        let result = match &mut self {
            Self::Ivf(w) => w.close(),
            Self::Ogg(w) => w.close(),
            Self::H264(w) => w.close(),
        };
        if let Err(e) = result {
            warn!("recording close failed: {}", e);
        }
    }
}

pub type SharedTrackWriter = Arc<Mutex<Option<(TrackWriter, PathBuf)>>>;

pub fn new_track_writer_slot() -> SharedTrackWriter {
    Arc::new(Mutex::new(None))
}

/// Per-room recording state.
pub struct Recorder {
    pub dir: PathBuf,
    /// The room these recordings belong to; used as the file-storage
    /// `resourceId` so uploaded files are ACL'd to meeting attendees.
    pub room_id: String,
    pub organisation_id: String,
    pub actor_id: String,
    /// Tracks whose writers already ended mid-recording (camera off, screenshare
    /// stopped, peer left). Their files are closed and awaiting upload.
    pub finished_files: Mutex<Vec<PathBuf>>,
}

pub fn recording_base_dir() -> PathBuf {
    PathBuf::from(std::env::var("SFU_RECORDING_DIR").unwrap_or_else(|_| "./recordings".to_string()))
}

/// Starts recording every currently published track in the room. Called from
/// the control API while holding the room lock is NOT required — takes its own.
/// Returns the recorder so it can be stored on the room.
pub fn create_recorder(
    room_id: &str,
    organisation_id: &str,
    actor_id: &str,
) -> Result<Arc<Recorder>> {
    let dir = recording_base_dir().join(sanitize(room_id));
    std::fs::create_dir_all(&dir)?;
    Ok(Arc::new(Recorder {
        dir,
        room_id: room_id.to_string(),
        organisation_id: organisation_id.to_string(),
        actor_id: actor_id.to_string(),
        finished_files: Mutex::new(Vec::new()),
    }))
}

/// Begins writing a single track into the recorder. Video files wait for a
/// keyframe before the first frame is written (IVFWriter handles this), so
/// callers should PLI the publisher right after attaching.
pub fn attach_track_writer(
    rec: &Recorder,
    slot: &SharedTrackWriter,
    room_id: &str,
    publisher: &str,
    track_id: &str,
    remote: &TrackRemote,
) {
    match TrackWriter::create(&rec.dir, room_id, publisher, track_id, remote) {
        Ok(Some(w)) => {
            info!(
                "Recording track {} from {} -> {}",
                track_id,
                publisher,
                w.1.display()
            );
            let slot = slot.clone();
            tokio::spawn(async move {
                *slot.lock().await = Some(w);
            });
        }
        Ok(None) => {
            info!(
                "Skipping recording for track {} from {} (unsupported codec)",
                track_id, publisher
            );
        }
        Err(e) => warn!("Failed to create recorder for track {}: {}", track_id, e),
    }
}

/// `rtc` variant of `attach_track_writer`.
#[cfg(feature = "rtc")]
pub fn attach_rtc_track_writer(
    rec: &Recorder,
    slot: &SharedTrackWriter,
    room_id: &str,
    publisher: &str,
    track_id: &str,
    codec: Option<&RTCRtpCodec>,
) {
    if let Some(codec) = codec {
        match TrackWriter::create_from_rtc_codec(&rec.dir, room_id, publisher, track_id, codec) {
            Ok(Some(w)) => {
                info!(
                    "Recording rtc track {} from {} -> {}",
                    track_id,
                    publisher,
                    w.1.display()
                );
                let slot = slot.clone();
                tokio::spawn(async move {
                    *slot.lock().await = Some(w);
                });
            }
            Ok(None) => {
                info!(
                    "Skipping recording for rtc track {} from {} (unsupported codec)",
                    track_id, publisher
                );
            }
            Err(e) => warn!(
                "Failed to create rtc recorder for track {}: {}",
                track_id, e
            ),
        }
    } else {
        info!(
            "Skipping recording for rtc track {} from {} (no codec)",
            track_id, publisher
        );
    }
}

/// Closes a track's writer and moves its file to the finished list for upload.
pub async fn finish_track_writer(rec: &Recorder, slot: &SharedTrackWriter) {
    if let Some((writer, path)) = slot.lock().await.take() {
        writer.close();
        rec.finished_files.lock().await.push(path);
    }
}

/// Uploads finished recording files to the file-storage service. Best-effort:
/// files that fail to upload stay on local disk under the recorder's dir.
pub async fn upload_files(
    file_storage_url: &str,
    internal_api_key: &str,
    rec: &Recorder,
    paths: Vec<PathBuf>,
) -> Vec<serde_json::Value> {
    let client = reqwest::Client::new();
    let url = format!("{}/files/upload", file_storage_url.trim_end_matches('/'));
    let mut uploaded = Vec::new();

    for path in paths {
        let file_name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "recording.bin".to_string());
        let mime = match path.extension().and_then(|e| e.to_str()) {
            Some("ogg") => "audio/ogg",
            Some("ivf") => "video/x-ivf",
            Some("h264") => "video/h264",
            _ => "application/octet-stream",
        };
        let result: Result<serde_json::Value> = async {
            let file = tokio::fs::File::open(&path).await?;
            let part = reqwest::multipart::Part::stream(reqwest::Body::from(file))
                .file_name(file_name.clone())
                .mime_str(mime)?;
            let form = reqwest::multipart::Form::new()
                .part("file", part)
                .text("resourceType", "meeting".to_string())
                .text("resourceId", rec.room_id.clone());
            let resp = client
                .post(&url)
                .header("x-internal-api-key", internal_api_key)
                .header("x-internal-caller", "sfu")
                .header("x-actor-id", &rec.actor_id)
                .header("x-organisation-id", &rec.organisation_id)
                .multipart(form)
                .send()
                .await?
                .error_for_status()?;
            Ok(resp.json::<serde_json::Value>().await?)
        }
        .await;

        match result {
            Ok(record) => {
                info!("Uploaded recording {} to file-storage", file_name);
                uploaded.push(record);
                if let Err(e) = tokio::fs::remove_file(&path).await {
                    warn!("Failed to remove uploaded recording {}: {}", file_name, e);
                }
            }
            Err(e) => {
                warn!(
                    "Failed to upload recording {} (kept at {}): {}",
                    file_name,
                    path.display(),
                    e
                );
            }
        }
    }

    uploaded
}

/// Stops recording for a room: closes every track writer and returns the file
/// paths plus the recorder so the caller can upload them.
pub async fn collect_recording_files(
    rec: &Arc<Recorder>,
    writer_slots: Vec<SharedTrackWriter>,
) -> Vec<PathBuf> {
    let mut paths = rec.finished_files.lock().await.clone();
    for slot in writer_slots {
        if let Some((writer, path)) = slot.lock().await.take() {
            writer.close();
            paths.push(path);
        }
    }
    paths
}

/// Build JSON records for finalized recording files that are staying local
/// because upload is disabled or failed. This lets the `stop` endpoint still
/// report what was produced on disk.
pub fn local_file_records(paths: &[PathBuf]) -> Vec<serde_json::Value> {
    paths
        .iter()
        .map(|path| {
            let file_name = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "recording.bin".to_string());
            let mime = match path.extension().and_then(|e| e.to_str()) {
                Some("ogg") => "audio/ogg",
                Some("ivf") => "video/x-ivf",
                Some("h264") => "video/h264",
                Some("mp4") => "video/mp4",
                _ => "application/octet-stream",
            };
            let size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
            json!({
                "name": file_name,
                "path": path.to_string_lossy(),
                "mimeType": mime,
                "size": size,
                "status": "local",
            })
        })
        .collect()
}

pub fn require_recording_env() -> Result<(String, String)> {
    let url = std::env::var("FILE_STORAGE_SERVICE_URL")
        .map_err(|_| anyhow!("FILE_STORAGE_SERVICE_URL is required to upload recordings"))?;
    let key = std::env::var("INTERNAL_API_KEY")
        .map_err(|_| anyhow!("INTERNAL_API_KEY is required to upload recordings"))?;
    Ok((url, key))
}
