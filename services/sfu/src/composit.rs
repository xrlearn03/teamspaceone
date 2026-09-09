//! Composited meeting recording post-processing with ffmpeg.
//!
//! The per-track recorder writes Opus/`.ogg`, VP8/VP9/`.ivf`, and H.264/`.h264`
//! files under `SFU_RECORDING_DIR/<room>/`. This module combines those into a
//! single grid-layout `.mp4` after recording stops.

use anyhow::{anyhow, Result};
use std::path::{Path, PathBuf};
use tokio::process::Command;
use tracing::{info, warn};

/// Check whether `ffmpeg` is available on PATH.
pub async fn ffmpeg_available() -> bool {
    match Command::new("ffmpeg").arg("-version").output().await {
        Ok(_) => true,
        Err(e) => {
            warn!("ffmpeg not available: {}", e);
            false
        }
    }
}

/// Return which codec types a recording file contains (`video`/`audio`).
async fn probe_codec_types(path: &Path) -> Result<Vec<String>> {
    let out = Command::new("ffprobe")
        .arg("-v")
        .arg("error")
        .arg("-show_entries")
        .arg("stream=codec_type")
        .arg("-of")
        .arg("csv=p=0")
        .arg(path)
        .output()
        .await
        .map_err(|e| anyhow!("ffprobe failed for {}: {}", path.display(), e))?;

    if !out.status.success() {
        return Err(anyhow!(
            "ffprobe failed for {}: {}",
            path.display(),
            String::from_utf8_lossy(&out.stderr)
        ));
    }

    Ok(String::from_utf8_lossy(&out.stdout)
        .lines()
        .map(|s| s.trim().to_lowercase())
        .filter(|s| !s.is_empty())
        .collect())
}

fn xstack_layout(n: usize) -> String {
    match n {
        1 => "0_0".to_string(),
        2 => "0_0|W_0".to_string(),
        3 => "0_0|W_0|0_H".to_string(),
        _ => "0_0|W_0|0_H|W_H".to_string(),
    }
}

/// Composite a room's per-track recording files into a single `output` video.
///
/// Up to four video streams are tiled in a grid, and all audio streams are
/// mixed together. The result is written as an MP4 with H.264/AAC.
pub async fn compose_room(room_id: &str, files: &[PathBuf], output: &Path) -> Result<PathBuf> {
    if !ffmpeg_available().await {
        return Err(anyhow!("ffmpeg not found in PATH"));
    }
    if files.is_empty() {
        return Err(anyhow!(
            "no recording files to compose for room {}",
            room_id
        ));
    }

    let mut video_inputs: Vec<(usize, PathBuf)> = Vec::new();
    let mut audio_inputs: Vec<(usize, PathBuf)> = Vec::new();

    for (idx, file) in files.iter().enumerate() {
        let types = probe_codec_types(file).await.unwrap_or_default();
        if types.iter().any(|t| t == "video") {
            video_inputs.push((idx, file.clone()));
        }
        if types.iter().any(|t| t == "audio") {
            audio_inputs.push((idx, file.clone()));
        }
    }

    if video_inputs.is_empty() {
        return Err(anyhow!("no video streams to compose for room {}", room_id));
    }

    if video_inputs.len() > 4 {
        warn!(
            "Room {} has {} video tracks; compositing only the first 4",
            room_id,
            video_inputs.len()
        );
        video_inputs.truncate(4);
    }

    info!(
        "Compositing room {}: {} video files, {} audio files -> {}",
        room_id,
        video_inputs.len(),
        audio_inputs.len(),
        output.display()
    );

    // Build filter_complex.
    let mut filter_parts: Vec<String> = Vec::new();

    // Video: scale each to a common cell and label it.
    for (local_idx, (global_idx, _)) in video_inputs.iter().enumerate() {
        filter_parts.push(format!(
            "[{}:v]scale=640:480:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=640:480:(ow-iw)/2:(oh-ih)/2,setsar=1,setpts=PTS-STARTPTS[v{}]",
            global_idx, local_idx
        ));
    }

    // Tile them in a grid.
    if video_inputs.len() == 1 {
        filter_parts.push("[v0]copy[vout]".to_string());
    } else {
        let inputs = video_inputs.len();
        let labels: String = (0..inputs).map(|i| format!("[v{}]", i)).collect();
        let layout = xstack_layout(inputs);
        filter_parts.push(format!(
            "{}xstack=inputs={}:layout={}[vout]",
            labels, inputs, layout
        ));
    }

    // Audio: format each stream and mix (or copy if only one).
    if audio_inputs.len() > 1 {
        let formatted: Vec<String> = audio_inputs
            .iter()
            .enumerate()
            .map(|(i, (global_idx, _))| {
                format!(
                    "[{}:a]aformat=sample_fmts=fltp:channel_layouts=stereo[a{}]",
                    global_idx, i
                )
            })
            .collect();
        filter_parts.extend(formatted);

        let labels: String = (0..audio_inputs.len())
            .map(|i| format!("[a{}]", i))
            .collect();
        filter_parts.push(format!(
            "{}amix=inputs={}:duration=longest:dropout_transition=3[aout]",
            labels,
            audio_inputs.len()
        ));
    } else if audio_inputs.len() == 1 {
        let global_idx = audio_inputs[0].0;
        filter_parts.push(format!(
            "[{}:a]aformat=sample_fmts=fltp:channel_layouts=stereo[aout]",
            global_idx
        ));
    }

    let filter_complex = filter_parts.join(";");

    let mut cmd = Command::new("ffmpeg");
    cmd.arg("-y");
    for file in files {
        cmd.arg("-i").arg(file);
    }
    cmd.arg("-filter_complex").arg(filter_complex);
    cmd.arg("-map").arg("[vout]");
    if !audio_inputs.is_empty() {
        cmd.arg("-map").arg("[aout]");
    }
    cmd.arg("-c:v")
        .arg("libx264")
        .arg("-preset")
        .arg("ultrafast")
        .arg("-crf")
        .arg("28");
    if !audio_inputs.is_empty() {
        cmd.arg("-c:a").arg("aac");
    }
    cmd.arg("-f").arg("mp4").arg(output);

    let out = cmd
        .output()
        .await
        .map_err(|e| anyhow!("failed to run ffmpeg for room {}: {}", room_id, e))?;

    if !out.status.success() {
        return Err(anyhow!(
            "ffmpeg failed for room {}: {}",
            room_id,
            String::from_utf8_lossy(&out.stderr)
        ));
    }

    info!("Composited recording written to {}", output.display());
    Ok(output.to_path_buf())
}
