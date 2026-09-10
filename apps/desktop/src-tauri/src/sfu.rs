#[cfg(desktop)]
mod desktop {
use anyhow::Result;
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, Mutex};
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tracing::warn;
use webrtc::api::APIBuilder;
use webrtc::ice_transport::ice_candidate::{RTCIceCandidate, RTCIceCandidateInit};
use webrtc::ice_transport::ice_server::RTCIceServer;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;
use webrtc::peer_connection::RTCPeerConnection;
use webrtc::rtp_transceiver::rtp_receiver::RTCRtpReceiver;
use webrtc::rtp_transceiver::RTCRtpTransceiver;
use webrtc::track::track_remote::TrackRemote;

const SFU_URL: &str = "ws://127.0.0.1:8443";
const SFU_TARGET: &str = "sfu";

#[derive(Clone, Serialize, Deserialize)]
pub struct Participant {
    pub id: String,
    pub display_name: String,
}

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SfuEvent {
    Connected { participant_id: String },
    RoomState { room_id: String, participants: Vec<Participant> },
    ParticipantJoined { participant_id: String, display_name: String },
    ParticipantLeft { participant_id: String },
    Track { id: String, kind: String },
    Error { message: String },
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum SignalToSfu {
    Join { room_id: String, display_name: String },
    Answer { target: String, sdp: String },
    Ice {
        target: String,
        candidate: String,
        sdp_m_line_index: u16,
        sdp_mid: Option<String>,
    },
}

#[allow(dead_code)]
#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum EventFromSfu {
    Connected { participant_id: String },
    RoomState { room_id: String, participants: Vec<Participant> },
    ParticipantJoined { participant_id: String, display_name: String },
    ParticipantLeft { participant_id: String },
    Offer { from: String, sdp: String },
    Answer { from: String, sdp: String },
    Ice {
        from: String,
        candidate: String,
        sdp_m_line_index: u16,
        sdp_mid: Option<String>,
    },
    Error { message: String },
}

pub struct SfuState {
    client: Mutex<Option<SfuClient>>,
}

impl SfuState {
    pub fn new() -> Self {
        Self {
            client: Mutex::new(None),
        }
    }
}

pub struct SfuClient {
    pc: Arc<RTCPeerConnection>,
    handle: tokio::task::JoinHandle<()>,
}

impl SfuClient {
    pub async fn close(self) -> Result<()> {
        let _ = self.pc.close().await;
        self.handle.abort();
        Ok(())
    }
    pub async fn new(
        app: AppHandle,
        room_id: String,
        display_name: String,
    ) -> Result<Self> {
        let api = Arc::new(APIBuilder::new().build());
        let config = RTCConfiguration {
            ice_servers: vec![RTCIceServer {
                urls: vec!["stun:stun.l.google.com:19302".to_owned()],
                ..Default::default()
            }],
            ..Default::default()
        };

        let pc = api.new_peer_connection(config).await?;

        let (tx, mut rx) = mpsc::unbounded_channel::<String>();

        let ice_tx = tx.clone();
        pc.on_ice_candidate(Box::new(move |candidate: Option<RTCIceCandidate>| {
            let tx = ice_tx.clone();
            Box::pin(async move {
                if let Some(c) = candidate {
                    if let Ok(init) = c.to_json() {
                        let signal = SignalToSfu::Ice {
                            target: SFU_TARGET.to_string(),
                            candidate: init.candidate,
                            sdp_m_line_index: init.sdp_mline_index.unwrap_or(0),
                            sdp_mid: init.sdp_mid.filter(|m| !m.is_empty()),
                        };
                        if let Ok(text) = serde_json::to_string(&signal) {
                            let _ = tx.send(text);
                        }
                    }
                }
            })
        }));

        let track_app = app.clone();
        pc.on_track(Box::new(
            move |track: Arc<TrackRemote>,
                  _receiver: Arc<RTCRtpReceiver>,
                  _transceiver: Arc<RTCRtpTransceiver>| {
                let app = track_app.clone();
                let id = track.id();
                let kind = format!("{:?}", track.kind());
                Box::pin(async move {
                    let _ = app.emit("sfu", SfuEvent::Track { id, kind });
                })
            },
        ));

        let pc = Arc::new(pc);
        let loop_tx = tx.clone();

        let (ws_stream, _) = connect_async(SFU_URL).await?;
        let (mut ws_tx, mut ws_rx) = ws_stream.split();

        let join = SignalToSfu::Join {
            room_id,
            display_name,
        };
        ws_tx
            .send(Message::Text(serde_json::to_string(&join)?))
            .await?;

        let pc_task = Arc::clone(&pc);
        let app_task = app.clone();
        let handle = tokio::spawn(async move {
            loop {
                tokio::select! {
                    msg = ws_rx.next() => {
                        match msg {
                            Some(Ok(Message::Text(text))) => {
                                if let Err(e) = handle_event(&app_task, &pc_task, &loop_tx, &text).await {
                                    let _ = app_task.emit("sfu", SfuEvent::Error { message: e.to_string() });
                                }
                            }
                            Some(Ok(Message::Close(_))) | None => break,
                            Some(Err(e)) => {
                                warn!("SFU WebSocket error: {}", e);
                                break;
                            }
                            _ => {}
                        }
                    }
                    outgoing = rx.recv() => {
                        match outgoing {
                            Some(text) => {
                                if let Err(e) = ws_tx.send(Message::Text(text)).await {
                                    warn!("SFU send failed: {}", e);
                                    break;
                                }
                            }
                            None => break,
                        }
                    }
                }
            }

            if let Err(e) = pc_task.close().await {
                warn!("Failed to close peer connection: {}", e);
            }
        });

        Ok(Self { pc, handle })
    }
}

async fn handle_event(
    app: &AppHandle,
    pc: &Arc<RTCPeerConnection>,
    tx: &mpsc::UnboundedSender<String>,
    text: &str,
) -> Result<()> {
    match serde_json::from_str::<EventFromSfu>(text)? {
        EventFromSfu::Connected { participant_id } => {
            let _ = app.emit("sfu", SfuEvent::Connected { participant_id });
        }
        EventFromSfu::RoomState {
            room_id,
            participants,
        } => {
            let _ = app.emit("sfu", SfuEvent::RoomState { room_id, participants });
        }
        EventFromSfu::ParticipantJoined {
            participant_id,
            display_name,
        } => {
            let _ = app.emit(
                "sfu",
                SfuEvent::ParticipantJoined {
                    participant_id,
                    display_name,
                },
            );
        }
        EventFromSfu::ParticipantLeft { participant_id } => {
            let _ = app.emit("sfu", SfuEvent::ParticipantLeft { participant_id });
        }
        EventFromSfu::Offer { from: _, sdp } => {
            let offer = RTCSessionDescription::offer(sdp)?;
            pc.set_remote_description(offer).await?;
            let answer = pc.create_answer(None).await?;
            pc.set_local_description(answer.clone()).await?;
            let signal = SignalToSfu::Answer {
                target: SFU_TARGET.to_string(),
                sdp: answer.sdp,
            };
            let text = serde_json::to_string(&signal)?;
            let _ = tx.send(text);
        }
        EventFromSfu::Ice {
            candidate,
            sdp_m_line_index,
            sdp_mid,
            ..
        } => {
            let init = RTCIceCandidateInit {
                candidate,
                sdp_mid,
                sdp_mline_index: Some(sdp_m_line_index),
                username_fragment: None,
            };
            pc.add_ice_candidate(init).await?;
        }
        EventFromSfu::Error { message } => {
            let _ = app.emit("sfu", SfuEvent::Error { message });
        }
        _ => {}
    }
    Ok(())
}

#[tauri::command]
pub async fn sfu_join(
    app: AppHandle,
    state: tauri::State<'_, SfuState>,
    room_id: String,
    display_name: String,
) -> Result<(), String> {
    let client = SfuClient::new(app, room_id, display_name)
        .await
        .map_err(|e| e.to_string())?;
    *state.client.lock().await = Some(client);
    Ok(())
}

#[tauri::command]
pub async fn sfu_leave(state: tauri::State<'_, SfuState>) -> Result<(), String> {
    if let Some(client) = state.client.lock().await.take() {
        client.close().await.map_err(|e| e.to_string())?;
    }
    Ok(())
}
}
#[cfg(desktop)]
pub use desktop::*;

#[cfg(not(desktop))]
mod mobile {
    pub struct SfuState;

    impl SfuState {
        pub fn new() -> Self {
            Self
        }
    }

    #[tauri::command]
    pub async fn sfu_join(
        _app: tauri::AppHandle,
        _state: tauri::State<'_, SfuState>,
        _room_id: String,
        _display_name: String,
    ) -> Result<(), String> {
        Err("SFU voice calls are not supported on this platform".into())
    }

    #[tauri::command]
    pub async fn sfu_leave(_state: tauri::State<'_, SfuState>) -> Result<(), String> {
        Err("SFU voice calls are not supported on this platform".into())
    }
}

#[cfg(not(desktop))]
pub use mobile::*;
