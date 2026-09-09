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

/// Composite a room's per-track recording files into a single `output` video.
///
/// This is a skeleton: it validates `ffmpeg` and the inputs, then logs the
/// intended output. The filter-complex command will be added in the next pass.
#[allow(dead_code)]
pub async fn compose_room(
    room_id: &str,
    files: &[PathBuf],
    output: &Path,
) -> Result<PathBuf> {
    if !ffmpeg_available().await {
        return Err(anyhow!("ffmpeg not found in PATH"));
    }
    if files.is_empty() {
        return Err(anyhow!("no recording files to compose for room {}", room_id));
    }

    info!(
        "Compositing room {} ({} files) -> {}",
        room_id,
        files.len(),
        output.display()
    );

    // TODO: build a `filter_complex` that:
    //   - scales each video to a target grid cell,
    //   - tiles video streams with `xstack`/`vstack`,
    //   - mixes audio streams with `amix`,
    //   - writes a single `.mp4`.
    Ok(output.to_path_buf())
}
