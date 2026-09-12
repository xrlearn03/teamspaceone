mod composit;
mod control;
mod recording;

#[cfg(feature = "rtc")]
mod rtc_peer;

#[cfg(feature = "rtc")]
mod rtc_spike;

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
use std::time::{Duration as StdDuration, Instant, SystemTime, UNIX_EPOCH};
use tokio::net::{TcpListener, TcpStream, UdpSocket};
use tokio::sync::{mpsc, Mutex, RwLock};
use tokio::task::JoinHandle;
use tokio_tungstenite::{accept_async, tungstenite::Message};
use tracing::{info, warn};

type HmacSha256 = Hmac<Sha256>;
const MAX_DISPLAY_NAME_CHARS: usize = 128;
const MAX_SDP_BYTES: usize = 65536;
const MAX_CANDIDATE_BYTES: usize = 65536;
use interceptor::nack::generator::GeneratorBuilder;
use interceptor::nack::responder::ResponderBuilder;
use interceptor::registry::Registry;
use webrtc::api::setting_engine::SettingEngine;
use webrtc::api::{APIBuilder, API};
use webrtc::ice::udp_mux::{UDPMuxDefault, UDPMuxParams};
use webrtc::ice::udp_network::UDPNetwork;
#[cfg(not(feature = "rtc"))]
use webrtc::ice_transport::ice_candidate::{RTCIceCandidate, RTCIceCandidateInit};
use webrtc::ice_transport::ice_candidate_type::RTCIceCandidateType;
use webrtc::ice_transport::ice_server::RTCIceServer;
#[cfg(not(feature = "rtc"))]
use webrtc::peer_connection::configuration::RTCConfiguration;
#[cfg(not(feature = "rtc"))]
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;
use webrtc::peer_connection::RTCPeerConnection;
use webrtc::rtcp::packet::Packet as RtcpPacket;
use webrtc::rtcp::payload_feedbacks::full_intra_request::FullIntraRequest;
use webrtc::rtcp::payload_feedbacks::picture_loss_indication::PictureLossIndication;
use webrtc::rtp::packet::Packet as RtpPacket;
use webrtc::rtp_transceiver::rtp_codec::RTPCodecType;
#[cfg(not(feature = "rtc"))]
use webrtc::rtp_transceiver::rtp_receiver::RTCRtpReceiver;
use webrtc::rtp_transceiver::rtp_sender::RTCRtpSender;
#[cfg(not(feature = "rtc"))]
use webrtc::rtp_transceiver::rtp_transceiver_direction::RTCRtpTransceiverDirection;
#[cfg(not(feature = "rtc"))]
use webrtc::rtp_transceiver::RTCRtpTransceiver;
#[cfg(not(feature = "rtc"))]
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
    #[serde(rename = "layer")]
    Layer {
        track_id: String,
        rid: Option<String>,
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

/// A published track forwarded to one subscriber peer. Keeping the
/// `RTCRtpSender` lets us detach the track (remove + renegotiate) later,
/// and `tx`/`task` run an independent forwarding loop for that subscriber.
struct Forwarder {
    sender: Arc<RTCRtpSender>,
    tx: mpsc::Sender<RtpPacket>,
    task: JoinHandle<()>,
}

type Forwarders = Arc<Mutex<HashMap<PeerId, Forwarder>>>;

#[derive(Clone)]
struct RoomTrack {
    publisher: PeerId,
    track_id: String,
    remote: Arc<TrackRemote>,
    forwarders: Forwarders,
    recorder: recording::SharedTrackWriter,
    is_screen: bool,
}

#[derive(Default)]
struct Room {
    participants: HashMap<PeerId, Peer>,
    tracks: Vec<RoomTrack>,
    recording: Option<Arc<recording::Recorder>>,
}

struct State {
    api: Arc<API>,
    peers: HashMap<PeerId, Peer>,
    rooms: HashMap<RoomId, Room>,
    #[cfg(feature = "rtc")]
    rtc_peers: HashMap<PeerId, rtc_peer::RtcPeer>,
    #[cfg(feature = "rtc")]
    rtc_tracks: HashMap<String, rtc_peer::RtcRoomTrack>,
    #[cfg(feature = "rtc")]
    rtc_metrics: Arc<rtc_peer::RtcMetrics>,
}

impl State {
    fn new(api: Arc<API>) -> Self {
        Self {
            api,
            peers: HashMap::new(),
            rooms: HashMap::new(),
            #[cfg(feature = "rtc")]
            rtc_peers: HashMap::new(),
            #[cfg(feature = "rtc")]
            rtc_tracks: HashMap::new(),
            #[cfg(feature = "rtc")]
            rtc_metrics: Arc::new(rtc_peer::RtcMetrics::default()),
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

    let token_secret = std::env::var("SFU_TOKEN_SECRET")
        .map_err(|_| anyhow!("SFU_TOKEN_SECRET environment variable is required"))?;

    let mut setting_engine = SettingEngine::default();

    // When the SFU sits behind 1:1 NAT (Docker, cloud VM), advertise the public
    // IP(s) instead of the local/container address so remote peers can connect.
    let nat_ips: Vec<String> = std::env::var("SFU_NAT_1TO1_IPS")
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect();
    if !nat_ips.is_empty() {
        info!("Advertising NAT 1:1 IPs: {:?}", nat_ips);
        setting_engine.set_nat_1to1_ips(nat_ips, RTCIceCandidateType::Host);
    }

    // Optionally bind all ICE traffic to a single UDP port. This makes the SFU
    // trivially deployable behind port-forwarding firewalls: publish one UDP
    // port instead of an ephemeral range.
    if let Ok(mux_port) = std::env::var("SFU_UDP_MUX_PORT") {
        let mux_port: u16 = mux_port.parse()?;
        let socket = UdpSocket::bind(("0.0.0.0", mux_port)).await?;
        setting_engine.set_udp_network(UDPNetwork::Muxed(UDPMuxDefault::new(UDPMuxParams::new(
            socket,
        ))));
        info!("ICE UDP mux listening on 0.0.0.0:{}", mux_port);
    }

    let mut interceptor_registry = Registry::new();
    interceptor_registry.add(Box::new(GeneratorBuilder::default()));
    interceptor_registry.add(Box::new(ResponderBuilder::default()));
    let api = Arc::new(
        APIBuilder::new()
            .with_setting_engine(setting_engine)
            .with_interceptor_registry(interceptor_registry)
            .build(),
    );
    let state: SharedState = Arc::new(RwLock::new(State::new(api)));
    let host = std::env::var("SFU_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port = std::env::var("SFU_PORT").unwrap_or_else(|_| "8443".to_string());
    let addr = format!("{}:{}", host, port).parse::<SocketAddr>()?;
    let listener = TcpListener::bind(&addr).await?;
    info!("Teamspace SFU signaling listening on {}", addr);

    let control_state = state.clone();
    let control_secret = token_secret.clone();
    tokio::spawn(async move {
        if let Err(e) = control::serve(control_state, control_secret).await {
            warn!("Control API failed: {}", e);
        }
    });

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

    let mut signal_count = 0u32;
    let mut signal_window_start = Instant::now();

    let peer_id_for_send = peer_id.clone();
    let send_task = tokio::spawn(async move {
        let mut ws_tx = ws_tx;
        let mut ping = tokio::time::interval(ws_ping_interval());
        loop {
            tokio::select! {
                _ = ping.tick() => {
                    if let Err(e) = ws_tx.send(Message::Ping(vec![])).await {
                        warn!("Ping failed for {}: {}", peer_id_for_send, e);
                        break;
                    }
                }
                event = rx.recv() => {
                    match event {
                        Some(event) => {
                            let text = serde_json::to_string(&event).unwrap_or_default();
                            if let Err(e) = ws_tx.send(Message::Text(text)).await {
                                warn!("Send failed for {}: {}", peer_id_for_send, e);
                                break;
                            }
                        }
                        None => break,
                    }
                }
            }
        }
    });

    loop {
        let msg = match tokio::time::timeout(ws_timeout(), ws_rx.next()).await {
            Ok(Some(msg)) => msg,
            Ok(None) => break,
            Err(_) => {
                warn!("WebSocket timeout for {}", peer_id);
                break;
            }
        };

        match msg {
            Ok(Message::Text(text)) => {
                let now = Instant::now();
                if now.duration_since(signal_window_start) > StdDuration::from_secs(1) {
                    signal_count = 0;
                    signal_window_start = now;
                }
                signal_count += 1;
                if signal_count > max_signals_per_second() {
                    warn!("Rate limit exceeded for {}", peer_id);
                    let _ = tx.send(Event::Error {
                        message: "Rate limit exceeded".to_string(),
                    });
                    break;
                }
                match serde_json::from_str::<Signal>(&text) {
                    Ok(signal) => {
                        if let Err(e) =
                            process_signal(&peer_id, signal, &state, &token_secret).await
                        {
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

pub(crate) fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

pub(crate) fn decode_base64url(s: &str) -> Result<String> {
    URL_SAFE_NO_PAD
        .decode(s)
        .ok()
        .and_then(|b| String::from_utf8(b).ok())
        .ok_or_else(|| anyhow!("invalid base64url encoding"))
}

pub(crate) fn decode_hex(s: &str) -> Option<Vec<u8>> {
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

fn verify_sfu_token(
    token: &str,
    expected_room: &str,
    expected_user: &Option<String>,
    token_secret: &str,
) -> Result<()> {
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
    let exp: u64 = exp_str
        .parse()
        .map_err(|_| anyhow!("invalid token expiration"))?;
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
    mac.verify_slice(&expected)
        .map_err(|_| anyhow!("invalid token signature"))?;

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

pub(crate) mod string_or_vec {
    use serde::Deserializer;

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Vec<String>, D::Error>
    where
        D: Deserializer<'de>,
    {
        struct Visitor;
        impl<'de> serde::de::Visitor<'de> for Visitor {
            type Value = Vec<String>;

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("a string or an array of strings")
            }

            fn visit_str<E>(self, value: &str) -> Result<Self::Value, E> {
                Ok(vec![value.to_owned()])
            }

            fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
            where
                A: serde::de::SeqAccess<'de>,
            {
                let mut out = Vec::new();
                while let Some(v) = seq.next_element::<String>()? {
                    out.push(v);
                }
                Ok(out)
            }
        }

        deserializer.deserialize_any(Visitor)
    }
}

#[derive(Deserialize)]
pub(crate) struct IceServerConfig {
    #[serde(with = "string_or_vec")]
    pub(crate) urls: Vec<String>,
    pub(crate) username: Option<String>,
    pub(crate) credential: Option<String>,
}

pub(crate) fn ice_server_configs() -> Vec<IceServerConfig> {
    let raw = match std::env::var("SFU_ICE_SERVERS") {
        Ok(v) if !v.is_empty() => v,
        _ => return Vec::new(),
    };

    match serde_json::from_str::<Vec<IceServerConfig>>(&raw) {
        Ok(c) => c,
        Err(e) => {
            warn!(
                "SFU_ICE_SERVERS is not valid JSON ({}); using default ICE servers",
                e
            );
            Vec::new()
        }
    }
}

pub(crate) fn max_participants_per_room() -> usize {
    std::env::var("SFU_MAX_PARTICIPANTS_PER_ROOM")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(100)
}

pub(crate) fn max_rooms() -> usize {
    std::env::var("SFU_MAX_ROOMS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(100)
}

fn ws_ping_interval() -> std::time::Duration {
    let secs = std::env::var("SFU_WS_PING_INTERVAL_SECONDS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(30);
    std::time::Duration::from_secs(secs)
}

fn ws_timeout() -> std::time::Duration {
    let secs = std::env::var("SFU_WS_TIMEOUT_SECONDS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(90);
    std::time::Duration::from_secs(secs)
}

fn max_signals_per_second() -> u32 {
    std::env::var("SFU_MAX_SIGNALS_PER_SECOND")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(50)
}

pub(crate) fn forward_queue_capacity() -> usize {
    std::env::var("SFU_FORWARD_QUEUE_CAPACITY")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(256)
}

fn ice_servers() -> Vec<RTCIceServer> {
    let configs = ice_server_configs();
    if configs.is_empty() {
        return vec![RTCIceServer {
            urls: vec!["stun:stun.l.google.com:19302".to_owned()],
            ..Default::default()
        }];
    }

    configs
        .into_iter()
        .map(|c| RTCIceServer {
            urls: c.urls,
            username: c.username.unwrap_or_default(),
            credential: c.credential.unwrap_or_default(),
            ..Default::default()
        })
        .collect()
}

async fn process_signal(
    peer_id: &str,
    signal: Signal,
    state: &SharedState,
    token_secret: &str,
) -> Result<()> {
    #[cfg(feature = "rtc")]
    return rtc_peer::process_rtc_signal(peer_id, signal, state, token_secret).await;

    #[cfg(not(feature = "rtc"))]
    match signal {
        Signal::Join {
            room_id,
            display_name,
            user_id,
            token,
        } => {
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
                ice_servers: ice_servers(),
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
                add_track_forwarder(&rt, &peer_id.to_string(), &pc, &state).await?;
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

            let (tx, joined_peer) = {
                let s = &mut *state.write().await;
                let peer = s.peers.get_mut(peer_id).unwrap();
                peer.display_name = display_name.clone();
                peer.user_id = user_id.clone();
                peer.room_id = Some(room_id.clone());
                peer.pc = Some(pc);
                (peer.tx.clone(), peer.clone())
            };
            let mut s = state.write().await;
            if !s.rooms.contains_key(&room_id) && s.rooms.len() >= max_rooms() {
                let _ = tx.send(Event::Error {
                    message: "Maximum number of rooms reached".to_string(),
                });
                return Err(anyhow!("max rooms reached"));
            }
            let room = s.rooms.entry(room_id.clone()).or_default();
            let max = max_participants_per_room();
            if room.participants.len() >= max {
                let _ = tx.send(Event::Error {
                    message: format!("Room is full (max {} participants)", max),
                });
                return Err(anyhow!("room is full"));
            }
            room.participants.insert(peer_id.to_string(), joined_peer);

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
        Signal::Offer { target, sdp } if target == SFU_ID => {
            validate_sdp(&sdp)?;
            let (tx, pc) = {
                let s = state.read().await;
                let peer = s
                    .peers
                    .get(peer_id)
                    .ok_or(anyhow!("peer not found: {}", peer_id))?;
                (
                    peer.tx.clone(),
                    peer.pc
                        .clone()
                        .ok_or(anyhow!("peer has no connection: {}", peer_id))?,
                )
            };
            let offer = RTCSessionDescription::offer(sdp)?;
            pc.set_remote_description(offer).await?;
            let answer = pc.create_answer(None).await?;
            pc.set_local_description(answer.clone()).await?;
            let _ = tx.send(Event::Answer {
                from: SFU_ID.to_string(),
                sdp: answer.sdp,
            });
        }
        Signal::Offer { target, sdp } => {
            validate_sdp(&sdp)?;
            let s = state.read().await;
            let sender = s
                .peers
                .get(peer_id)
                .ok_or(anyhow!("peer not found: {}", peer_id))?;
            let sender_room = sender
                .room_id
                .as_ref()
                .ok_or(anyhow!("peer not in a room"))?;
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
            let sender = s
                .peers
                .get(peer_id)
                .ok_or(anyhow!("peer not found: {}", peer_id))?;
            let sender_room = sender
                .room_id
                .as_ref()
                .ok_or(anyhow!("peer not in a room"))?;
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
            let sender = s
                .peers
                .get(peer_id)
                .ok_or(anyhow!("peer not found: {}", peer_id))?;
            let sender_room = sender
                .room_id
                .as_ref()
                .ok_or(anyhow!("peer not in a room"))?;
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
        Signal::Layer { track_id, rid } => {
            return Err(anyhow!(
                "layer selection for track {track_id} rid {:?} is only supported with the native rtc feature",
                rid
            ));
        }
    }

    #[cfg(not(feature = "rtc"))]
    Ok(())
}

async fn handle_track(
    state: SharedState,
    publisher: String,
    track: Arc<TrackRemote>,
) -> Result<()> {
    let track_id = track.id();
    let kind = track.kind();

    let (room_id, forwarders, participants, active_recording, publisher_pc, rt) = {
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
        // Treat any second (or later) video track from a publisher as the
        // screen share stream so the client can render it on a separate tile.
        let is_screen = kind == RTPCodecType::Video
            && room
                .tracks
                .iter()
                .any(|t| t.publisher == publisher && t.remote.kind() == RTPCodecType::Video);
        let rt = RoomTrack {
            publisher: publisher.clone(),
            track_id: track_id.clone(),
            remote: Arc::clone(&track),
            forwarders: Arc::new(Mutex::new(HashMap::new())),
            recorder: recording::new_track_writer_slot(),
            is_screen,
        };
        room.tracks.push(rt.clone());
        let forwarders = Arc::clone(&rt.forwarders);
        let participants = room.participants.clone();
        (
            room_id,
            forwarders,
            participants,
            room.recording.clone(),
            peer.pc,
            rt,
        )
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
            if let Err(e) = add_track_forwarder(&rt, subscriber, &pc, &state).await {
                warn!(
                    "add_track failed for {} <- {} track {}: {}",
                    subscriber, publisher, track_id, e
                );
            }
        }
    }

    // If the room is already recording, attach a writer for this new track and
    // ask the publisher for a keyframe so the file starts cleanly.
    if let Some(rec) = active_recording.clone() {
        recording::attach_track_writer(&rec, &rt.recorder, &room_id, &publisher, &track_id, &track);
        if kind == RTPCodecType::Video {
            if let Some(pc) = publisher_pc.clone() {
                let ssrc = track.ssrc();
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
    }

    // Forward RTP packets to all current and future subscribers.
    let cleanup_state = state.clone();
    let track_recorder = rt.recorder.clone();
    tokio::spawn(async move {
        loop {
            match track.read_rtp().await {
                Ok((pkt, _)) => {
                    if let Some((writer, _)) = track_recorder.lock().await.as_mut() {
                        writer.write_rtp(&pkt);
                    }
                    // Snapshot the sender channels while holding the lock, then
                    // dispatch to each subscriber's dedicated forwarding task.
                    // Use try_send so a slow subscriber's full queue drops packets
                    // rather than blocking the publisher's loop.
                    let txs: Vec<mpsc::Sender<RtpPacket>> = {
                        let guard = forwarders.lock().await;
                        guard.values().map(|f| f.tx.clone()).collect()
                    };
                    for tx in txs {
                        if let Err(e) = tx.try_send(pkt.clone()) {
                            warn!("forward queue full for subscriber: {}", e);
                        }
                    }
                }
                Err(e) => {
                    info!("Track {} from {} closed: {}", track_id, publisher, e);
                    break;
                }
            }
        }
        // The publisher's track ended (camera off, screenshare stopped, or the
        // peer left) — detach it from every subscriber so their clients drop
        // the stale tile.
        remove_room_track(&cleanup_state, &room_id, &publisher, &track_id).await;
        // If recording is still active, finalize just this track's file so it
        // is flushed and queued for upload without stopping the session.
        if let Some(rec) = active_recording {
            recording::finish_track_writer(&rec, &track_recorder).await;
        }
    });

    Ok(())
}

/// Attaches a published track to a subscriber's peer connection, registers the
/// forwarder, relays the subscriber's PLI/FIR feedback to the publisher, and
/// requests a keyframe so the new subscriber gets decodable video quickly.
async fn add_track_forwarder(
    rt: &RoomTrack,
    subscriber_id: &str,
    subscriber_pc: &Arc<RTCPeerConnection>,
    state: &SharedState,
) -> Result<()> {
    if *subscriber_id == rt.publisher {
        return Ok(());
    }
    let local_track_id = format!("{}-{}", rt.track_id, rt.publisher);
    let local_stream_id = if rt.is_screen {
        format!("screen-{}", rt.publisher)
    } else {
        rt.publisher.clone()
    };
    let local_track = Arc::new(TrackLocalStaticRTP::new(
        rt.remote.codec().capability,
        local_track_id,
        local_stream_id,
    ));
    let sender = subscriber_pc.add_track(local_track.clone()).await?;
    let (tx, mut rx) = mpsc::channel::<RtpPacket>(forward_queue_capacity());

    // Spawn a dedicated forwarding task for this subscriber so a slow peer
    // cannot block the publisher's loop for everyone else.
    let forwarder_track = Arc::clone(&local_track);
    let task = tokio::spawn(async move {
        while let Some(pkt) = rx.recv().await {
            if let Err(e) = forwarder_track.write_rtp(&pkt).await {
                warn!("write_rtp failed for subscriber track: {}", e);
                break;
            }
        }
    });

    rt.forwarders.lock().await.insert(
        subscriber_id.to_string(),
        Forwarder {
            sender: sender.clone(),
            tx,
            task,
        },
    );

    let publisher_pc = {
        let s = state.read().await;
        s.peers.get(&rt.publisher).and_then(|p| p.pc.clone())
    };
    if let Some(publisher_pc) = publisher_pc {
        // Relay keyframe requests (PLI/FIR) from this subscriber to the publisher.
        let relay_pc = Arc::clone(&publisher_pc);
        let relay_sender = Arc::clone(&sender);
        tokio::spawn(async move {
            while let Ok((pkts, _)) = relay_sender.read_rtcp().await {
                let fwd: Vec<Box<dyn RtcpPacket + Send + Sync>> = pkts
                    .into_iter()
                    .filter(|p| {
                        p.as_any().is::<PictureLossIndication>()
                            || p.as_any().is::<FullIntraRequest>()
                    })
                    .collect();
                if !fwd.is_empty() {
                    let _ = relay_pc.write_rtcp(&fwd).await;
                }
            }
        });

        // Ask the publisher for an immediate keyframe for the new subscriber.
        let _ = publisher_pc
            .write_rtcp(&[Box::new(PictureLossIndication {
                sender_ssrc: 0,
                media_ssrc: rt.remote.ssrc(),
            })])
            .await;
    }

    Ok(())
}

/// Removes a published track from a room and detaches its forwarding senders
/// from every remaining subscriber (which triggers renegotiation, so clients
/// drop the removed track).
async fn remove_room_track(state: &SharedState, room_id: &str, publisher: &str, track_id: &str) {
    let (removals, tasks) = {
        let mut s = state.write().await;
        let Some(room) = s.rooms.get_mut(room_id) else {
            return;
        };
        let Some(idx) = room
            .tracks
            .iter()
            .position(|rt| rt.publisher == publisher && rt.track_id == track_id)
        else {
            return;
        };
        let rt = room.tracks.remove(idx);
        let mut forwarders = rt.forwarders.lock().await;
        let mut removals = Vec::new();
        let mut tasks = Vec::new();
        for (id, f) in forwarders.drain() {
            f.task.abort();
            tasks.push(f.task);
            if let Some(pc) = room.participants.get(&id).and_then(|p| p.pc.clone()) {
                removals.push((pc, f.sender));
            }
        }
        (removals, tasks)
    };
    for (pc, sender) in removals {
        if let Err(e) = pc.remove_track(&sender).await {
            warn!(
                "remove_track failed for track {} from {}: {}",
                track_id, publisher, e
            );
        }
    }
    for t in tasks {
        let _ = t.await;
    }
}

async fn leave_room(peer_id: &str, state: &SharedState) -> Option<RoomId> {
    let mut s = state.write().await;
    if let Some(peer) = s.peers.get_mut(peer_id) {
        let room_id = peer.room_id.take();
        if let Some(room_id) = room_id.clone() {
            if let Some(room) = s.rooms.get_mut(&room_id) {
                room.participants.remove(peer_id);
                // Drop forwarder entries aimed at the departing peer in the
                // remaining publishers' tracks.
                for rt in room.tracks.iter() {
                    rt.forwarders.lock().await.remove(peer_id);
                }

                // Detach the departing peer's published tracks from every
                // remaining subscriber so their clients drop the tiles.
                let mut removed_tracks = Vec::new();
                room.tracks.retain(|rt| {
                    if rt.publisher == peer_id {
                        removed_tracks.push(rt.clone());
                        false
                    } else {
                        true
                    }
                });
                let mut removals: Vec<(Arc<RTCPeerConnection>, Arc<RTCRtpSender>)> = Vec::new();
                for rt in removed_tracks {
                    let forwarders = rt.forwarders.lock().await;
                    for (id, f) in forwarders.iter() {
                        if let Some(pc) = room.participants.get(id).and_then(|p| p.pc.clone()) {
                            removals.push((pc, f.sender.clone()));
                        }
                    }
                }
                for (pc, sender) in removals {
                    if let Err(e) = pc.remove_track(&sender).await {
                        warn!("remove_track failed for leaving peer {}: {}", peer_id, e);
                    }
                }
                if room.participants.is_empty() {
                    if let Some(room) = s.rooms.remove(&room_id) {
                        if room.recording.is_some() {
                            let state = Arc::clone(state);
                            let room_id = room_id.clone();
                            tokio::spawn(async move {
                                control::finalize_recording(state, &room_id).await;
                            });
                        }
                    }
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
        #[cfg(feature = "rtc")]
        {
            s.rtc_peers.remove(peer_id);
        }
        return room_id;
    }
    None
}

pub(crate) async fn cleanup_peer(peer_id: &str, state: &SharedState) {
    let _room_id = leave_room(peer_id, state).await;
    #[cfg(feature = "rtc")]
    if let Some(ref room_id) = _room_id {
        crate::rtc_peer::cleanup_rtc_peer(peer_id, room_id, state).await;
    }
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

#[cfg(test)]
mod tests;
