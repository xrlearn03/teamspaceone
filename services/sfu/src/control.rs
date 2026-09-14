//! Internal control API for the SFU (recording on/off).
//!
//! Bound on a separate port (`SFU_CONTROL_PORT`, default 8445) that is not
//! published publicly — it is reachable only on the service network/localhost.
//! Requests must carry `x-sfu-control-token`, an HMAC of
//! `control.<roomB64>.<exp>` signed with `SFU_TOKEN_SECRET`, minted by
//! meeting-service after it has authorized the caller.

use anyhow::{anyhow, Result};
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::json;
use tracing::{info, warn};
use webrtc::rtcp::payload_feedbacks::picture_loss_indication::PictureLossIndication;

#[cfg(feature = "rtc")]
use rtc::rtp_transceiver::rtp_sender::RtpCodecKind as RtcCodecKind;
#[cfg(feature = "rtc")]
use rtcp::payload_feedbacks::picture_loss_indication::PictureLossIndication as RtcpPictureLossIndication;

use crate::composit;
use crate::recording;
use crate::{decode_base64url, decode_hex, now_unix, SharedState};
use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

#[derive(Clone)]
pub struct ControlState {
    pub state: SharedState,
    pub token_secret: String,
}

#[derive(Deserialize)]
struct RecordRequest {
    organisation_id: String,
    actor_id: String,
}

fn verify_control_token(headers: &HeaderMap, room: &str, secret: &str) -> Result<()> {
    let token = headers
        .get("x-sfu-control-token")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| anyhow!("missing x-sfu-control-token"))?;
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 4 || parts[0] != "control" {
        return Err(anyhow!("invalid control token format"));
    }
    if decode_base64url(parts[1])? != room {
        return Err(anyhow!("control token room mismatch"));
    }
    let exp: u64 = parts[2]
        .parse()
        .map_err(|_| anyhow!("invalid control token expiry"))?;
    if exp < now_unix() {
        return Err(anyhow!("control token expired"));
    }
    let base = format!("{}.{}.{}", parts[0], parts[1], parts[2]);
    let mut mac =
        HmacSha256::new_from_slice(secret.as_bytes()).map_err(|_| anyhow!("invalid hmac key"))?;
    mac.update(base.as_bytes());
    let expected = decode_hex(parts[3]).ok_or_else(|| anyhow!("invalid signature encoding"))?;
    mac.verify_slice(&expected)
        .map_err(|_| anyhow!("invalid control token signature"))
}

fn err(status: StatusCode, message: &str) -> Response {
    (status, Json(json!({ "error": message }))).into_response()
}

async fn start_recording(
    State(app): State<ControlState>,
    Path(room_id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<RecordRequest>,
) -> Response {
    if let Err(e) = verify_control_token(&headers, &room_id, &app.token_secret) {
        return err(StatusCode::UNAUTHORIZED, &e.to_string());
    }

    let mut s = app.state.write().await;
    let Some(room) = s.rooms.get_mut(&room_id) else {
        return err(StatusCode::NOT_FOUND, "room not found");
    };
    if room.recording.is_some() {
        return err(StatusCode::CONFLICT, "recording already in progress");
    }

    let rec = match recording::create_recorder(&room_id, &body.organisation_id, &body.actor_id) {
        Ok(r) => r,
        Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
    };
    room.recording = Some(rec.clone());

    // Attach a writer to every currently published track and ask each publisher
    // for a keyframe so video files start cleanly.
    let tracks = room.tracks.clone();
    for rt in tracks.iter() {
        let speaker = room
            .participants
            .get(&rt.publisher)
            .map(|p| {
                if p.display_name.is_empty() {
                    p.user_id.clone().unwrap_or_else(|| rt.publisher.clone())
                } else {
                    p.display_name.clone()
                }
            });
        recording::attach_track_writer(
            &rec,
            &rt.recorder,
            &room_id,
            &rt.publisher,
            &rt.track_id,
            &rt.remote,
            speaker,
        );
        if let Some(pc) = room
            .participants
            .get(&rt.publisher)
            .and_then(|p| p.pc.clone())
        {
            let ssrc = rt.remote.ssrc();
            tokio::spawn(async move {
                let _ = pc
                    .write_rtcp(&[Box::new(PictureLossIndication {
                        sender_ssrc: 0,
                        media_ssrc: ssrc,
                    })])
                    .await;
            });
        }
    }

    // Same for rtc-published tracks when the rtc migration feature is enabled.
    #[cfg(feature = "rtc")]
    {
        let rtc_tracks: Vec<(String, crate::rtc_peer::RtcRoomTrack)> = s
            .rtc_tracks
            .iter()
            .filter(|(_, t)| t.room_id == room_id)
            .map(|(id, t)| (id.clone(), t.clone()))
            .collect();
        for (track_id, rt) in rtc_tracks {
            if rt.writer.is_none() {
                let slot = recording::new_track_writer_slot();
                let speaker = s
                    .rooms
                    .get(&room_id)
                    .and_then(|r| r.participants.get(&rt.publisher))
                    .map(|p| {
                        if p.display_name.is_empty() {
                            p.user_id.clone().unwrap_or_else(|| rt.publisher.clone())
                        } else {
                            p.display_name.clone()
                        }
                    });
                recording::attach_rtc_track_writer(
                    &rec,
                    &slot,
                    &room_id,
                    &rt.publisher,
                    &track_id,
                    rt.codec.as_ref(),
                    speaker,
                );
                s.rtc_tracks.get_mut(&track_id).unwrap().writer = Some(slot);
            }
            if rt.kind == RtcCodecKind::Video {
                if let (Some(receiver_id), Some(publisher_peer), Some(ssrc)) = (
                    rt.receiver_id,
                    s.rtc_peers.get(&rt.publisher).cloned(),
                    rt.ssrcs.first().copied(),
                ) {
                    let pli = Box::new(RtcpPictureLossIndication {
                        sender_ssrc: 0,
                        media_ssrc: ssrc,
                    });
                    tokio::spawn(async move {
                        let _ = publisher_peer
                            .write_receiver_rtcp(receiver_id, vec![pli])
                            .await;
                    });
                }
            }
        }
    }

    info!("Recording started for room {}", room_id);
    Json(json!({ "recording": true })).into_response()
}

/// Shared finalization path used by both the `stop` endpoint and the
/// room-drained auto-stop. Closes all writers and uploads the files.
pub async fn finalize_recording(state: SharedState, room_id: &str) -> Vec<serde_json::Value> {
    let (rec, slots) = {
        let mut s = state.write().await;
        let Some(room) = s.rooms.get_mut(room_id) else {
            return Vec::new();
        };
        let Some(rec) = room.recording.take() else {
            return Vec::new();
        };
        #[cfg(feature = "rtc")]
        let mut slots: Vec<recording::SharedTrackWriter> =
            room.tracks.iter().map(|rt| rt.recorder.clone()).collect();
        #[cfg(not(feature = "rtc"))]
        let slots: Vec<recording::SharedTrackWriter> =
            room.tracks.iter().map(|rt| rt.recorder.clone()).collect();

        #[cfg(feature = "rtc")]
        {
            slots.extend(
                s.rtc_tracks
                    .iter()
                    .filter(|(_, t)| t.room_id == room_id)
                    .filter_map(|(_, t)| t.writer.clone()),
            );
        }
        (rec, slots)
    };

    let mut files = recording::collect_recording_files(&rec, slots).await;
    if files.is_empty() {
        return Vec::new();
    }

    let composited = rec.dir.join("composited.mp4");
    let media_paths: Vec<std::path::PathBuf> = files.iter().map(|f| f.path.clone()).collect();
    match composit::compose_room(room_id, &media_paths, &composited).await {
        Ok(_) => {
            files.push(recording::FinishedFile {
                path: composited,
                speaker: None,
            });
        }
        Err(e) => {
            warn!("Compositing failed for room {}: {}", room_id, e);
        }
    }

    // Always produce records for the files that were finalized on disk; when
    // upload is disabled (or fails) these are the only records we can return.
    let local_files = recording::local_file_records(&files);

    match recording::require_recording_env() {
        Ok((url, key)) => {
            let uploaded = recording::upload_files(&url, &key, &rec, files).await;
            if uploaded.is_empty() {
                local_files
            } else {
                uploaded
            }
        }
        Err(e) => {
            warn!("Cannot upload recordings for room {}: {}", room_id, e);
            local_files
        }
    }
}

async fn stop_recording(
    State(app): State<ControlState>,
    Path(room_id): Path<String>,
    headers: HeaderMap,
) -> Response {
    if let Err(e) = verify_control_token(&headers, &room_id, &app.token_secret) {
        return err(StatusCode::UNAUTHORIZED, &e.to_string());
    }

    let files = finalize_recording(app.state.clone(), &room_id).await;
    info!("Recording stopped for room {}", room_id);
    Json(json!({ "recording": false, "files": files })).into_response()
}

async fn health() -> Response {
    Json(json!({ "status": "ok" })).into_response()
}

async fn metrics(State(app): State<ControlState>) -> Response {
    let s = app.state.read().await;
    let rooms = s.rooms.len();
    let peers = s.peers.len();
    let tracks: usize = s.rooms.values().map(|r| r.tracks.len()).sum();

    #[cfg(feature = "rtc")]
    let mut body = json!({
        "rooms": rooms,
        "peers": peers,
        "tracks": tracks,
    });
    #[cfg(not(feature = "rtc"))]
    let body = json!({
        "rooms": rooms,
        "peers": peers,
        "tracks": tracks,
    });

    #[cfg(feature = "rtc")]
    {
        body["rtc_peers"] = json!(s.rtc_peers.len());
        body["rtc_tracks"] = json!(s.rtc_tracks.len());
        let rtc_forwarders: usize = s.rtc_tracks.values().map(|t| t.forwarders.len()).sum();
        body["rtc_forwarders"] = json!(rtc_forwarders);
        let m = &s.rtc_metrics;
        body["rtc_packets_forwarded"] = json!(m
            .packets_forwarded
            .load(std::sync::atomic::Ordering::Relaxed));
        body["rtc_bytes_forwarded"] =
            json!(m.bytes_forwarded.load(std::sync::atomic::Ordering::Relaxed));
        body["rtc_packets_dropped"] =
            json!(m.packets_dropped.load(std::sync::atomic::Ordering::Relaxed));
        body["rtc_feedback_forwarded"] = json!(m
            .feedback_forwarded
            .load(std::sync::atomic::Ordering::Relaxed));
        body["rtc_ice_failures"] = json!(m.ice_failures.load(std::sync::atomic::Ordering::Relaxed));
    }

    Json(body).into_response()
}

async fn room_metrics(
    State(app): State<ControlState>,
    Path(room_id): Path<String>,
    headers: HeaderMap,
) -> Response {
    if let Err(e) = verify_control_token(&headers, &room_id, &app.token_secret) {
        return err(StatusCode::UNAUTHORIZED, &e.to_string());
    }

    let s = app.state.read().await;
    let Some(room) = s.rooms.get(&room_id) else {
        return err(StatusCode::NOT_FOUND, "room not found");
    };

    let participants: Vec<serde_json::Value> = room
        .participants
        .iter()
        .map(|(id, p)| {
            json!({
                "id": id,
                "display_name": p.display_name,
                "user_id": p.user_id,
            })
        })
        .collect();
    let tracks: Vec<serde_json::Value> = room
        .tracks
        .iter()
        .map(|t| {
            json!({
                "publisher": t.publisher,
                "track_id": t.track_id,
                "kind": format!("{:?}", t.remote.kind()),
                "screen": t.is_screen,
            })
        })
        .collect();

    #[cfg(feature = "rtc")]
    let mut body = json!({
        "room_id": room_id,
        "recording": room.recording.is_some(),
        "participants": participants,
        "tracks": tracks,
    });
    #[cfg(not(feature = "rtc"))]
    let body = json!({
        "room_id": room_id,
        "recording": room.recording.is_some(),
        "participants": participants,
        "tracks": tracks,
    });

    #[cfg(feature = "rtc")]
    {
        let rtc_tracks: Vec<serde_json::Value> = s
            .rtc_tracks
            .iter()
            .filter(|(_, t)| t.room_id == room_id)
            .map(|(id, t)| {
                json!({
                    "track_id": id,
                    "publisher": t.publisher,
                    "kind": format!("{:?}", t.kind),
                    "mime_type": t.codec.as_ref().map(|c| c.mime_type.clone()).unwrap_or_default(),
                    "ssrcs": t.ssrcs,
                    "forwarders": t.forwarders.len(),
                    "recording": t.writer.is_some(),
                })
            })
            .collect();
        body["rtc_tracks"] = json!(rtc_tracks);

        let rtc_peer_count = room
            .participants
            .keys()
            .filter(|id| s.rtc_peers.contains_key(id.as_str()))
            .count();
        body["rtc_peers"] = json!(rtc_peer_count);
    }

    Json(body).into_response()
}

/// Runs the control API listener until shutdown.
pub async fn serve(state: SharedState, token_secret: String) -> Result<()> {
    let app = Router::new()
        .route("/health", get(health))
        .route("/metrics", get(metrics))
        .route("/rooms/{room_id}", get(room_metrics))
        .route("/rooms/{room_id}/recording/start", post(start_recording))
        .route("/rooms/{room_id}/recording/stop", post(stop_recording))
        .with_state(ControlState {
            state,
            token_secret,
        });

    let host = std::env::var("SFU_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port = std::env::var("SFU_CONTROL_PORT").unwrap_or_else(|_| "8445".to_string());
    let addr = format!("{}:{}", host, port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    info!("SFU control API listening on {}", addr);
    axum::serve(listener, app).await?;
    Ok(())
}
