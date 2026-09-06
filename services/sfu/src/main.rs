use anyhow::{anyhow, Result};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use futures::{SinkExt, StreamExt};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, Mutex, RwLock};
use tokio_tungstenite::{accept_async, tungstenite::Message};
use tracing::{info, warn};

type HmacSha256 = Hmac<Sha256>;
const MAX_DISPLAY_NAME_CHARS: usize = 128;
const MAX_SDP_BYTES: usize = 65536;
const MAX_CANDIDATE_BYTES: usize = 65536;
use webrtc::api::{API, APIBuilder};
use webrtc::ice_transport::ice_candidate::{RTCIceCandidate, RTCIceCandidateInit};
use webrtc::ice_transport::ice_server::RTCIceServer;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;
use webrtc::peer_connection::RTCPeerConnection;
use webrtc::rtp_transceiver::rtp_codec::RTPCodecType;
use webrtc::rtp_transceiver::rtp_receiver::RTCRtpReceiver;
use webrtc::rtp_transceiver::rtp_transceiver_direction::RTCRtpTransceiverDirection;
use webrtc::rtp_transceiver::RTCRtpTransceiver;
use webrtc::rtp_transceiver::RTCRtpTransceiverInit;
use webrtc::track::track_local::track_local_static_rtp::TrackLocalStaticRTP;
use webrtc::track::track_local::TrackLocalWriter;
use webrtc::track::track_remote::TrackRemote;

static NEXT_ID: AtomicU64 = AtomicU64::new(1);
const SFU_ID: &str = "sfu";

type PeerId = String;
type RoomId = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ParticipantInfo {
    id: PeerId,
    display_name: String,
    user_id: Option<String>,
}

/// Messages sent from the client to the SFU.
#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum Signal {
    #[serde(rename = "join")]
    Join {
        room_id: RoomId,
        display_name: String,
        user_id: Option<String>,
        token: String,
    },
    #[serde(rename = "leave")]
    Leave,
    #[serde(rename = "offer")]
    Offer { target: PeerId, sdp: String },
    #[serde(rename = "answer")]
    Answer { target: PeerId, sdp: String },
    #[serde(rename = "ice")]
    Ice {
        target: PeerId,
        candidate: String,
        sdp_m_line_index: u16,
        sdp_mid: Option<String>,
    },
}

/// Messages sent from the SFU to the client.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
enum Event {
    #[serde(rename = "connected")]
    Connected { participant_id: PeerId },
    #[serde(rename = "room_state")]
    RoomState {
        room_id: RoomId,
        participants: Vec<ParticipantInfo>,
    },
    #[serde(rename = "participant_joined")]
    ParticipantJoined {
        participant_id: PeerId,
        display_name: String,
        user_id: Option<String>,
    },
    #[serde(rename = "participant_left")]
    ParticipantLeft { participant_id: PeerId },
    #[serde(rename = "offer")]
    Offer { from: PeerId, sdp: String },
    #[serde(rename = "answer")]
    Answer { from: PeerId, sdp: String },
    #[serde(rename = "ice")]
    Ice {
        from: PeerId,
        candidate: String,
        sdp_m_line_index: u16,
        sdp_mid: Option<String>,
    },
    #[serde(rename = "error")]
    Error { message: String },
}

#[derive(Clone)]
struct Peer {
    display_name: String,
    user_id: Option<String>,
    room_id: Option<RoomId>,
    tx: mpsc::UnboundedSender<Event>,
    pc: Option<Arc<RTCPeerConnection>>,
}

#[derive(Clone)]
struct RoomTrack {
    publisher: PeerId,
    track_id: String,
    remote: Arc<TrackRemote>,
    forwarders: Arc<Mutex<HashMap<PeerId, Arc<TrackLocalStaticRTP>>>>,
}

#[derive(Default)]
struct Room {
    participants: HashMap<PeerId, Peer>,
    tracks: Vec<RoomTrack>,
}

struct State {
    api: Arc<API>,
    peers: HashMap<PeerId, Peer>,
    rooms: HashMap<RoomId, Room>,
}

impl State {
    fn new(api: Arc<API>) -> Self {
        Self {
            api,
            peers: HashMap::new(),
            rooms: HashMap::new(),
        }
    }

    fn broadcast(&self, room_id: &str, event: Event, exclude: Option<&PeerId>) {
        if let Some(room) = self.rooms.get(room_id) {
            for (id, peer) in room.participants.iter() {
                if Some(id) == exclude {
                    continue;
                }
                let _ = peer.tx.send(event.clone());
            }
        }
    }
}

type SharedState = Arc<RwLock<State>>;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    let token_secret = std::env::var("SFU_TOKEN_SECRET").map_err(|_| {
        anyhow!("SFU_TOKEN_SECRET environment variable is required")
    })?;

    let api = Arc::new(APIBuilder::new().build());
    let state: SharedState = Arc::new(RwLock::new(State::new(api)));
    let host = std::env::var("SFU_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port = std::env::var("SFU_PORT").unwrap_or_else(|_| "8443".to_string());
    let addr = format!("{}:{}", host, port).parse::<SocketAddr>()?;
    let listener = TcpListener::bind(&addr).await?;
    info!("Teamspace SFU signaling listening on {}", addr);

    while let Ok((stream, _)) = listener.accept().await {
        let state = state.clone();
        let token_secret = token_secret.clone();
        tokio::spawn(handle_peer(stream, state, token_secret));
    }

    Ok(())
}

async fn handle_peer(stream: TcpStream, state: SharedState, token_secret: String) {
    let addr = match stream.peer_addr() {
        Ok(a) => a,
        Err(_) => return,
    };
    info!("Peer connected: {}", addr);

    let ws = match accept_async(stream).await {
        Ok(w) => w,
        Err(e) => {
            warn!("WebSocket handshake failed: {}", e);
            return;
        }
    };

    let (ws_tx, mut ws_rx) = ws.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Event>();
    let peer_id = format!("p{}", NEXT_ID.fetch_add(1, Ordering::SeqCst));

    {
        let peer = Peer {
            display_name: String::new(),
            user_id: None,
            room_id: None,
            tx: tx.clone(),
            pc: None,
        };
        let mut s = state.write().await;
        s.peers.insert(peer_id.clone(), peer);
    }

    let _ = tx.send(Event::Connected {
        participant_id: peer_id.clone(),
    });

    let peer_id_for_send = peer_id.clone();
    let send_task = tokio::spawn(async move {
        let mut ws_tx = ws_tx;
        while let Some(event) = rx.recv().await {
            let text = serde_json::to_string(&event).unwrap_or_default();
            if let Err(e) = ws_tx.send(Message::Text(text)).await {
                warn!("Send failed for {}: {}", peer_id_for_send, e);
                break;
            }
        }
    });

    while let Some(msg) = ws_rx.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                match serde_json::from_str::<Signal>(&text) {
                    Ok(signal) => {
                        if let Err(e) = process_signal(&peer_id, signal, &state, &token_secret).await {
                            warn!("Signal processing failed for {}: {}", peer_id, e);
                            let _ = tx.send(Event::Error {
                                message: e.to_string(),
                            });
                        }
                    }
                    Err(e) => {
                        warn!("Invalid signal from {}: {}", peer_id, e);
                        let _ = tx.send(Event::Error {
                            message: format!("Invalid signal: {}", e),
                        });
                    }
                }
            }
            Ok(Message::Close(_)) => break,
            Err(e) => {
                warn!("WebSocket error from {}: {}", peer_id, e);
                break;
            }
            _ => {}
        }
    }

    cleanup_peer(&peer_id, &state).await;
    let _ = send_task.await;
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn decode_base64url(s: &str) -> Result<String> {
    URL_SAFE_NO_PAD
        .decode(s)
        .ok()
        .and_then(|b| String::from_utf8(b).ok())
        .ok_or_else(|| anyhow!("invalid base64url encoding"))
}

fn decode_hex(s: &str) -> Option<Vec<u8>> {
    if s.len() % 2 != 0 {
        return None;
    }
    let mut out = Vec::with_capacity(s.len() / 2);
    for chunk in s.as_bytes().chunks(2) {
        let a = hex_value(chunk[0])?;
        let b = hex_value(chunk[1])?;
        out.push((a << 4) | b);
    }
    Some(out)
}

fn hex_value(c: u8) -> Option<u8> {
    match c {
        b'0'..=b'9' => Some(c - b'0'),
        b'a'..=b'f' => Some(c - b'a' + 10),
        b'A'..=b'F' => Some(c - b'A' + 10),
        _ => None,
    }
}

fn verify_sfu_token(token: &str, expected_room: &str, expected_user: &Option<String>, token_secret: &str) -> Result<()> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 4 {
        return Err(anyhow!("invalid token format"));
    }
    let room_b64 = parts[0];
    let user_b64 = parts[1];
    let exp_str = parts[2];
    let sig_hex = parts[3];

    let room = decode_base64url(room_b64)?;
    let token_user = if user_b64.is_empty() {
        None
    } else {
        Some(decode_base64url(user_b64)?)
    };
    let exp: u64 = exp_str.parse().map_err(|_| anyhow!("invalid token expiration"))?;
    if exp < now_unix() {
        return Err(anyhow!("token expired"));
    }

    if room != expected_room {
        return Err(anyhow!("token room mismatch"));
    }
    if &token_user != expected_user {
        return Err(anyhow!("token user mismatch"));
    }

    let base = format!("{}.{}.{}", room_b64, user_b64, exp_str);
    let mut mac = HmacSha256::new_from_slice(token_secret.as_bytes())
        .map_err(|_| anyhow!("invalid hmac key"))?;
    mac.update(base.as_bytes());
    let expected = decode_hex(sig_hex).ok_or_else(|| anyhow!("invalid signature encoding"))?;
    mac.verify_slice(&expected).map_err(|_| anyhow!("invalid token signature"))?;

    Ok(())
}

fn validate_display_name(name: &str) -> Result<()> {
    if name.chars().count() > MAX_DISPLAY_NAME_CHARS {
        return Err(anyhow!("display name too long"));
    }
    Ok(())
}

fn validate_sdp(sdp: &str) -> Result<()> {
    if sdp.len() > MAX_SDP_BYTES {
        return Err(anyhow!("sdp too large"));
    }
    Ok(())
}

fn validate_candidate(candidate: &str) -> Result<()> {
    if candidate.len() > MAX_CANDIDATE_BYTES {
        return Err(anyhow!("ice candidate too large"));
    }
    Ok(())
}

async fn process_signal(peer_id: &str, signal: Signal, state: &SharedState, token_secret: &str) -> Result<()> {
    match signal {
        Signal::Join { room_id, display_name, user_id, token } => {
            let _ = leave_room(peer_id, state).await;
            verify_sfu_token(&token, &room_id, &user_id, token_secret)?;
            validate_display_name(&display_name)?;

            let (tx, api, old_pc) = {
                let mut s = state.write().await;
                let tx = s.peers.get(peer_id).unwrap().tx.clone();
                let api = Arc::clone(&s.api);
                let old_pc = s.peers.get_mut(peer_id).unwrap().pc.take();
                (tx, api, old_pc)
            };

            if let Some(old_pc) = old_pc {
                if let Err(e) = old_pc.close().await {
                    warn!("Failed to close old peer connection for {}: {}", peer_id, e);
                }
            }

            let config = RTCConfiguration {
                ice_servers: vec![RTCIceServer {
                    urls: vec!["stun:stun.l.google.com:19302".to_owned()],
                    ..Default::default()
                }],
                ..Default::default()
            };

            let pc = api.new_peer_connection(config).await?;
            let peer_id_owned = peer_id.to_string();

            let ice_tx = tx.clone();
            pc.on_ice_candidate(Box::new(move |candidate: Option<RTCIceCandidate>| {
                let tx = ice_tx.clone();
                let from = SFU_ID.to_string();
                let peer = peer_id_owned.clone();
                Box::pin(async move {
                    if let Some(c) = candidate {
                        match c.to_json() {
                            Ok(init) => {
                                let _ = tx.send(Event::Ice {
                                    from: from.clone(),
                                    candidate: init.candidate,
                                    sdp_m_line_index: init.sdp_mline_index.unwrap_or(0),
                                    sdp_mid: init.sdp_mid.filter(|m| !m.is_empty()),
                                });
                            }
                            Err(e) => {
                                warn!("Failed to serialize ICE candidate for {}: {}", peer, e)
                            }
                        }
                    }
                })
            }));

            let on_track_state = state.clone();
            let on_track_peer = peer_id.to_string();
            pc.on_track(Box::new(
                move |track: Arc<TrackRemote>,
                      _receiver: Arc<RTCRtpReceiver>,
                      _transceiver: Arc<RTCRtpTransceiver>| {
                    let track = Arc::clone(&track);
                    let state = on_track_state.clone();
                    let peer = on_track_peer.clone();
                    let warn_peer = on_track_peer.clone();
                    Box::pin(async move {
                        if let Err(e) = handle_track(state, peer, track).await {
                            warn!("Track handler failed for {}: {}", warn_peer, e);
                        }
                    })
                },
            ));

            let pc = Arc::new(pc);

            // Add tracks from publishers that are already in the room.
            let existing_tracks = {
                let s = state.read().await;
                s.rooms
                    .get(&room_id)
                    .map(|r| r.tracks.clone())
                    .unwrap_or_default()
            };
            for rt in existing_tracks {
                let codec = rt.remote.codec().capability;
                let track_id = rt.track_id.clone();
                let publisher = rt.publisher.clone();
                let local_track = Arc::new(TrackLocalStaticRTP::new(
                    codec,
                    format!("{}-{}", track_id, publisher),
                    publisher,
                ));
                pc.add_track(local_track.clone()).await?;
                rt.forwarders
                    .lock()
                    .await
                    .insert(peer_id.to_string(), local_track);
            }

            pc.add_transceiver_from_kind(
                RTPCodecType::Audio,
                Some(RTCRtpTransceiverInit {
                    direction: RTCRtpTransceiverDirection::Recvonly,
                    send_encodings: vec![],
                }),
            )
            .await?;
            pc.add_transceiver_from_kind(
                RTPCodecType::Video,
                Some(RTCRtpTransceiverInit {
                    direction: RTCRtpTransceiverDirection::Recvonly,
                    send_encodings: vec![],
                }),
            )
            .await?;

            let offer = pc.create_offer(None).await?;
            pc.set_local_description(offer.clone()).await?;

            let pc_for_neg = Arc::clone(&pc);
            let negotiation_tx = tx.clone();
            let negotiation_peer = peer_id.to_string();
            pc.on_negotiation_needed(Box::new(move || {
                let pc = Arc::clone(&pc_for_neg);
                let tx = negotiation_tx.clone();
                let peer = negotiation_peer.clone();
                Box::pin(async move {
                    match pc.create_offer(None).await {
                        Ok(offer) => {
                            if let Err(e) = pc.set_local_description(offer.clone()).await {
                                warn!("set_local_description failed for {}: {}", peer, e);
                                return;
                            }
                            let _ = tx.send(Event::Offer {
                                from: SFU_ID.to_string(),
                                sdp: offer.sdp,
                            });
                        }
                        Err(e) => warn!("create_offer failed for {}: {}", peer, e),
                    }
                })
            }));

            let mut s = state.write().await;
            let peer = s.peers.get_mut(peer_id).unwrap();
            peer.display_name = display_name.clone();
            peer.user_id = user_id.clone();
            peer.room_id = Some(room_id.clone());
            peer.pc = Some(pc);
            let joined_peer = peer.clone();
            let tx = peer.tx.clone();
            let room = s.rooms.entry(room_id.clone()).or_default();
            room.participants
                .insert(peer_id.to_string(), joined_peer);

            let others: Vec<ParticipantInfo> = room
                .participants
                .iter()
                .filter(|(id, _)| *id != peer_id)
                .map(|(id, p)| ParticipantInfo {
                    id: id.clone(),
                    display_name: p.display_name.clone(),
                    user_id: p.user_id.clone(),
                })
                .collect();

            let _ = tx.send(Event::RoomState {
                room_id: room_id.clone(),
                participants: others,
            });

            s.broadcast(
                &room_id,
                Event::ParticipantJoined {
                    participant_id: peer_id.to_string(),
                    display_name: display_name.clone(),
                    user_id: user_id.clone(),
                },
                Some(&peer_id.to_string()),
            );

            let _ = tx.send(Event::Offer {
                from: SFU_ID.to_string(),
                sdp: offer.sdp,
            });
        }
        Signal::Leave => {
            let _ = leave_room(peer_id, state).await;
        }
        Signal::Offer { target, sdp } => {
            validate_sdp(&sdp)?;
            let s = state.read().await;
            let sender = s.peers.get(peer_id).ok_or(anyhow!("peer not found: {}", peer_id))?;
            let sender_room = sender.room_id.as_ref().ok_or(anyhow!("peer not in a room"))?;
            if let Some(target_peer) = s.peers.get(&target) {
                if target_peer.room_id.as_ref() != Some(sender_room) {
                    let _ = sender.tx.send(Event::Error {
                        message: format!("Target not in the same room: {}", target),
                    });
                    return Err(anyhow!("target not in the same room"));
                }
                let _ = target_peer.tx.send(Event::Offer {
                    from: peer_id.to_string(),
                    sdp,
                });
            } else if let Some(peer) = s.peers.get(peer_id) {
                let _ = peer.tx.send(Event::Error {
                    message: format!("Target not found: {}", target),
                });
            }
        }
        Signal::Answer { target, sdp } if target == SFU_ID => {
            validate_sdp(&sdp)?;
            let pc = {
                let s = state.read().await;
                let peer = s
                    .peers
                    .get(peer_id)
                    .ok_or(anyhow!("peer not found: {}", peer_id))?;
                peer.pc
                    .clone()
                    .ok_or(anyhow!("peer has no connection: {}", peer_id))?
            };
            let answer = RTCSessionDescription::answer(sdp)?;
            pc.set_remote_description(answer).await?;
        }
        Signal::Answer { target, sdp } => {
            validate_sdp(&sdp)?;
            let s = state.read().await;
            let sender = s.peers.get(peer_id).ok_or(anyhow!("peer not found: {}", peer_id))?;
            let sender_room = sender.room_id.as_ref().ok_or(anyhow!("peer not in a room"))?;
            if let Some(target_peer) = s.peers.get(&target) {
                if target_peer.room_id.as_ref() != Some(sender_room) {
                    let _ = sender.tx.send(Event::Error {
                        message: format!("Target not in the same room: {}", target),
                    });
                    return Err(anyhow!("target not in the same room"));
                }
                let _ = target_peer.tx.send(Event::Answer {
                    from: peer_id.to_string(),
                    sdp,
                });
            } else if let Some(peer) = s.peers.get(peer_id) {
                let _ = peer.tx.send(Event::Error {
                    message: format!("Target not found: {}", target),
                });
            }
        }
        Signal::Ice {
            target,
            candidate,
            sdp_m_line_index,
            sdp_mid,
        } if target == SFU_ID => {
            validate_candidate(&candidate)?;
            let pc = {
                let s = state.read().await;
                let peer = s
                    .peers
                    .get(peer_id)
                    .ok_or(anyhow!("peer not found: {}", peer_id))?;
                peer.pc
                    .clone()
                    .ok_or(anyhow!("peer has no connection: {}", peer_id))?
            };
            let init = RTCIceCandidateInit {
                candidate,
                sdp_mid,
                sdp_mline_index: Some(sdp_m_line_index),
                username_fragment: None,
            };
            if let Err(e) = pc.add_ice_candidate(init).await {
                warn!("add_ice_candidate failed for {}: {}", peer_id, e);
            }
        }
        Signal::Ice {
            target,
            candidate,
            sdp_m_line_index,
            sdp_mid,
        } => {
            validate_candidate(&candidate)?;
            let s = state.read().await;
            let sender = s.peers.get(peer_id).ok_or(anyhow!("peer not found: {}", peer_id))?;
            let sender_room = sender.room_id.as_ref().ok_or(anyhow!("peer not in a room"))?;
            if let Some(target_peer) = s.peers.get(&target) {
                if target_peer.room_id.as_ref() != Some(sender_room) {
                    let _ = sender.tx.send(Event::Error {
                        message: format!("Target not in the same room: {}", target),
                    });
                    return Err(anyhow!("target not in the same room"));
                }
                let _ = target_peer.tx.send(Event::Ice {
                    from: peer_id.to_string(),
                    candidate,
                    sdp_m_line_index,
                    sdp_mid,
                });
            } else if let Some(peer) = s.peers.get(peer_id) {
                let _ = peer.tx.send(Event::Error {
                    message: format!("Target not found: {}", target),
                });
            }
        }
    }

    Ok(())
}

async fn handle_track(
    state: SharedState,
    publisher: String,
    track: Arc<TrackRemote>,
) -> Result<()> {
    let track_id = track.id();
    let codec = track.codec().capability;
    let kind = track.kind();

    let (room_id, forwarders, participants) = {
        let mut s = state.write().await;
        let peer = s
            .peers
            .get(&publisher)
            .ok_or(anyhow!("publisher not found: {}", publisher))?
            .clone();
        let room_id = peer
            .room_id
            .clone()
            .ok_or(anyhow!("publisher not in a room: {}", publisher))?;
        let room = s
            .rooms
            .get_mut(&room_id)
            .ok_or(anyhow!("room not found: {}", room_id))?;
        let forwarders = Arc::new(Mutex::new(HashMap::new()));
        room.tracks.push(RoomTrack {
            publisher: publisher.clone(),
            track_id: track_id.clone(),
            remote: Arc::clone(&track),
            forwarders: Arc::clone(&forwarders),
        });
        let participants = room.participants.clone();
        (room_id, forwarders, participants)
    };

    info!(
        "Publisher {} track {} (kind: {:?}) in room {}",
        publisher, track_id, kind, room_id
    );

    // Add a local track to every other participant in the room.
    for (subscriber, peer) in participants.iter() {
        if *subscriber == publisher {
            continue;
        }
        if let Some(pc) = peer.pc.clone() {
            let local_track = Arc::new(TrackLocalStaticRTP::new(
                codec.clone(),
                format!("{}-{}", track_id, publisher),
                publisher.clone(),
            ));
            if let Err(e) = pc.add_track(local_track.clone()).await {
                warn!(
                    "add_track failed for {} <- {} track {}: {}",
                    subscriber, publisher, track_id, e
                );
                continue;
            }
            forwarders
                .lock()
                .await
                .insert(subscriber.clone(), local_track);
        }
    }

    // Forward RTP packets to all current and future subscribers.
    tokio::spawn(async move {
        loop {
            match track.read_rtp().await {
                Ok((pkt, _)) => {
                    let targets: Vec<Arc<TrackLocalStaticRTP>> = {
                        let guard = forwarders.lock().await;
                        guard.values().cloned().collect()
                    };
                    for t in targets {
                        if let Err(e) = t.write_rtp(&pkt).await {
                            warn!(
                                "write_rtp failed for track {} from {}: {}",
                                track_id, publisher, e
                            );
                        }
                    }
                }
                Err(e) => {
                    info!("Track {} from {} closed: {}", track_id, publisher, e);
                    break;
                }
            }
        }
    });

    Ok(())
}

async fn leave_room(peer_id: &str, state: &SharedState) -> Option<RoomId> {
    let mut s = state.write().await;
    if let Some(peer) = s.peers.get_mut(peer_id) {
        let room_id = peer.room_id.take();
        if let Some(room_id) = room_id.clone() {
            if let Some(room) = s.rooms.get_mut(&room_id) {
                room.participants.remove(peer_id);
                room.tracks.retain(|rt| rt.publisher != peer_id);
                if room.participants.is_empty() {
                    s.rooms.remove(&room_id);
                } else {
                    s.broadcast(
                        &room_id,
                        Event::ParticipantLeft {
                            participant_id: peer_id.to_string(),
                        },
                        None,
                    );
                }
            }
        }
        return room_id;
    }
    None
}

async fn cleanup_peer(peer_id: &str, state: &SharedState) {
    let _ = leave_room(peer_id, state).await;
    let pc = {
        let mut s = state.write().await;
        s.peers.remove(peer_id).and_then(|p| p.pc)
    };
    if let Some(pc) = pc {
        if let Err(e) = pc.close().await {
            warn!("Failed to close peer connection for {}: {}", peer_id, e);
        }
    }
}
