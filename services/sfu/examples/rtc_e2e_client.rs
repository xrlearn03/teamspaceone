use anyhow::{anyhow, Result};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use bytes::BytesMut;
use futures::{SinkExt, StreamExt};
use hmac::{Hmac, Mac};
use rtc::media_stream::MediaStreamTrack;
use rtc::peer_connection::configuration::{
    interceptor_registry::register_default_interceptors, media_engine::MediaEngine,
    setting_engine::SettingEngine, RTCConfigurationBuilder, RTCIceServer,
};
use rtc::peer_connection::event::{RTCPeerConnectionEvent, RTCTrackEvent};
use rtc::peer_connection::message::RTCMessage;
use rtc::peer_connection::sdp::RTCSessionDescription;
use rtc::peer_connection::state::{
    RTCIceConnectionState, RTCIceGatheringState, RTCPeerConnectionState,
};
use rtc::peer_connection::transport::RTCIceCandidateInit;
use rtc::peer_connection::transport::RTCIceCandidateType;
use rtc::peer_connection::{RTCPeerConnection, RTCPeerConnectionBuilder};
use rtc::rtp_transceiver::rtp_sender::{
    RTCPFeedback, RTCRtpCodec, RTCRtpCodingParameters, RTCRtpEncodingParameters, RtpCodecKind,
};
use rtc::rtp_transceiver::{RTCRtpReceiverId, RTCRtpSenderId};
use rtc::sansio::Protocol;
use rtc::shared::{TaggedBytesMut, TransportContext, TransportProtocol};
use rtcp::payload_feedbacks::full_intra_request::{FirEntry, FullIntraRequest};
use rtcp::payload_feedbacks::picture_loss_indication::PictureLossIndication;
use rtp::header::Header as RtpHeader;
use rtp::Packet as RtpPacket;
use serde_json::Value;
use sha2::Sha256;
use std::net::{IpAddr, SocketAddr};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::net::UdpSocket;
use tokio::sync::Mutex;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tracing::{info, warn};

use rtc_interceptor::Interceptor;

type HmacSha256 = Hmac<Sha256>;

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn encode_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 0x0f) as usize] as char);
    }
    out
}

fn make_sfu_token(room_id: &str, user_id: &str, secret: &str) -> String {
    let room_b64 = URL_SAFE_NO_PAD.encode(room_id);
    let user_b64 = URL_SAFE_NO_PAD.encode(user_id);
    let exp = now_unix() + 3600;
    let base = format!("{}.{}.{}", room_b64, user_b64, exp);
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).expect("valid hmac key");
    mac.update(base.as_bytes());
    let sig = encode_hex(&mac.finalize().into_bytes());
    format!("{}.{}", base, sig)
}

fn join_signal(room_id: &str, display_name: &str, user_id: &str, token: &str) -> String {
    serde_json::json!({
        "type": "join",
        "room_id": room_id,
        "display_name": display_name,
        "user_id": user_id,
        "token": token,
    })
    .to_string()
}

fn offer_signal(sdp: &str) -> String {
    serde_json::json!({
        "type": "offer",
        "target": "sfu",
        "sdp": sdp,
    })
    .to_string()
}

fn answer_signal(sdp: &str) -> String {
    serde_json::json!({
        "type": "answer",
        "target": "sfu",
        "sdp": sdp,
    })
    .to_string()
}

fn ice_signal(candidate: &str, sdp_m_line_index: u16, sdp_mid: Option<&str>) -> String {
    serde_json::json!({
        "type": "ice",
        "target": "sfu",
        "candidate": candidate,
        "sdp_m_line_index": sdp_m_line_index,
        "sdp_mid": sdp_mid,
    })
    .to_string()
}

async fn build_pc() -> Result<(RTCPeerConnection<impl Interceptor>, UdpSocket, SocketAddr)> {
    let mut media_engine = MediaEngine::default();
    media_engine
        .register_default_codecs()
        .map_err(|e| anyhow!("register_default_codecs failed: {:?}", e))?;
    let registry =
        register_default_interceptors(rtc_interceptor::Registry::new(), &mut media_engine)
            .map_err(|e| anyhow!("register_default_interceptors failed: {:?}", e))?;

    // For local E2E runs, force host candidates to 127.0.0.1 so the ICE agent
    // has a usable candidate pair. In real deployments set SFU_NAT_1TO1_IPS.
    let mut setting_engine = SettingEngine::default();
    let nat_ips: Vec<String> = std::env::var("SFU_NAT_1TO1_IPS")
        .unwrap_or_else(|_| "127.0.0.1".to_string())
        .split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect();
    setting_engine.set_nat_1to1_ips(nat_ips, RTCIceCandidateType::Host);

    let mut pc = RTCPeerConnectionBuilder::new()
        .with_configuration(
            RTCConfigurationBuilder::new()
                .with_ice_servers(vec![RTCIceServer {
                    urls: vec!["stun:stun.l.google.com:19302".to_string()],
                    ..Default::default()
                }])
                .build(),
        )
        .with_media_engine(media_engine)
        .with_interceptor_registry(registry)
        .with_setting_engine(setting_engine)
        .build()
        .map_err(|e| anyhow!("build rtc peer failed: {:?}", e))?;

    let socket = UdpSocket::bind("0.0.0.0:0")
        .await
        .map_err(|e| anyhow!("udp bind failed: {:?}", e))?;
    let socket_addr = socket.local_addr()?;
    let port = socket_addr.port();

    // Add a local host candidate so the ICE agent can form a pair.  The advertised
    // address is chosen from SFU_NAT_1TO1_IPS (first IP), defaulting to loopback.
    let local_ip: IpAddr = std::env::var("SFU_NAT_1TO1_IPS")
        .unwrap_or_else(|_| "127.0.0.1".to_string())
        .split(',')
        .next()
        .unwrap_or("127.0.0.1")
        .trim()
        .parse()
        .unwrap_or_else(|_| IpAddr::from([127, 0, 0, 1]));
    let local_addr = SocketAddr::new(local_ip, port);

    let mut candidate_init = RTCIceCandidateInit::default();
    candidate_init.candidate = format!(
        "candidate:1 1 udp 2130706431 {} {} typ host",
        local_addr.ip(),
        local_addr.port()
    );
    candidate_init.sdp_mid = Some("0".to_string());
    candidate_init.sdp_mline_index = Some(0);
    pc.add_local_candidate(candidate_init)
        .map_err(|e| anyhow!("add local candidate failed: {:?}", e))?;

    Ok((pc, socket, local_addr))
}

fn build_audio_track(track_id: &str, ssrc: u32) -> MediaStreamTrack {
    MediaStreamTrack::new(
        "stream1".to_string(),
        track_id.to_string(),
        "microphone".to_string(),
        RtpCodecKind::Audio,
        vec![RTCRtpEncodingParameters {
            rtp_coding_parameters: RTCRtpCodingParameters {
                ssrc: Some(ssrc),
                ..Default::default()
            },
            active: true,
            codec: RTCRtpCodec {
                mime_type: "audio/opus".to_string(),
                clock_rate: 48000,
                channels: 2,
                sdp_fmtp_line: "minptime=10;useinbandfec=1".to_string(),
                rtcp_feedback: vec![RTCPFeedback {
                    typ: "nack".to_string(),
                    parameter: "".to_string(),
                }],
            },
            ..Default::default()
        }],
    )
}

struct Stats {
    sent: usize,
    received: usize,
    dropped: usize,
    last_seq: Option<u16>,
}

fn handle_event<I>(
    pc: &mut RTCPeerConnection<I>,
    event: RTCPeerConnectionEvent,
    pending_local_offer: &mut bool,
    ignore_next_negotiation: &mut bool,
    connected: &mut bool,
    feedback: &mut Option<(RTCRtpReceiverId, u32)>,
) -> Result<Vec<String>>
where
    I: rtc_interceptor::Interceptor,
{
    let mut to_send = Vec::new();
    match event {
        RTCPeerConnectionEvent::OnIceConnectionStateChangeEvent(state) => {
            info!("ICE state: {:?}", state);
            if state == RTCIceConnectionState::Connected {
                info!("ICE connected");
            }
        }
        RTCPeerConnectionEvent::OnConnectionStateChangeEvent(state) => {
            info!("connection state: {:?}", state);
            if state == RTCPeerConnectionState::Connected {
                *connected = true;
            } else if state == RTCPeerConnectionState::Failed {
                return Err(anyhow!("peer connection failed"));
            }
        }
        RTCPeerConnectionEvent::OnIceCandidateEvent(ice_event) => {
            if let Ok(init) = ice_event.candidate.to_json() {
                let sdp_mid = init.sdp_mid.as_deref();
                let msg = ice_signal(&init.candidate, init.sdp_mline_index.unwrap_or(0), sdp_mid);
                to_send.push(msg);
            }
        }
        RTCPeerConnectionEvent::OnIceGatheringStateChangeEvent(RTCIceGatheringState::Complete) => {
            info!("ICE gathering complete");
        }
        RTCPeerConnectionEvent::OnNegotiationNeededEvent => {
            if *ignore_next_negotiation {
                *ignore_next_negotiation = false;
                info!("ignoring spurious OnNegotiationNeeded");
                return Ok(to_send);
            }
            if *pending_local_offer {
                info!("already have pending local offer");
                return Ok(to_send);
            }
            info!("OnNegotiationNeeded -> create offer");
            let offer = pc
                .create_offer(None)
                .map_err(|e| anyhow!("create offer failed: {:?}", e))?;
            pc.set_local_description(offer.clone())
                .map_err(|e| anyhow!("set local description failed: {:?}", e))?;
            *pending_local_offer = true;
            to_send.push(offer_signal(&offer.sdp));
        }
        RTCPeerConnectionEvent::OnTrack(RTCTrackEvent::OnOpen(init)) => {
            info!(
                "track opened: track_id={}, receiver_id={:?}",
                init.track_id, init.receiver_id
            );

            if let Some(receiver) = pc.rtp_receiver(init.receiver_id) {
                let remote_ssrc = receiver.track().ssrcs().next().unwrap_or(0);
                *feedback = Some((init.receiver_id, remote_ssrc));
                info!("pending PLI/FIR for remote ssrc {}", remote_ssrc);
            }
        }
        RTCPeerConnectionEvent::OnTrack(RTCTrackEvent::OnClose(track_id)) => {
            info!("track closed: {}", track_id);
        }
        RTCPeerConnectionEvent::OnTrack(_) => {}
        _ => {}
    }
    Ok(to_send)
}

fn set_remote_answer<I>(
    pc: &mut RTCPeerConnection<I>,
    sdp: &str,
    pending_local_offer: &mut bool,
    ignore_next_negotiation: &mut bool,
) -> Result<()>
where
    I: rtc_interceptor::Interceptor,
{
    let answer = RTCSessionDescription::answer(sdp.to_string())
        .map_err(|e| anyhow!("parse answer failed: {:?}", e))?;
    pc.set_remote_description(answer)
        .map_err(|e| anyhow!("set remote answer failed: {:?}", e))?;
    *pending_local_offer = false;
    *ignore_next_negotiation = true;
    Ok(())
}

fn set_remote_offer_and_answer<I>(
    pc: &mut RTCPeerConnection<I>,
    sdp: &str,
    pending_local_offer: &mut bool,
    ignore_next_negotiation: &mut bool,
) -> Result<String>
where
    I: rtc_interceptor::Interceptor,
{
    // Polite peer: rollback any pending local offer before accepting a remote offer.
    if *pending_local_offer {
        let rollback = RTCSessionDescription::rollback(None)
            .map_err(|e| anyhow!("create rollback failed: {:?}", e))?;
        pc.set_local_description(rollback)
            .map_err(|e| anyhow!("rollback failed: {:?}", e))?;
        *pending_local_offer = false;
        info!("rolled back pending local offer");
    }

    let offer = RTCSessionDescription::offer(sdp.to_string())
        .map_err(|e| anyhow!("parse offer failed: {:?}", e))?;
    pc.set_remote_description(offer)
        .map_err(|e| anyhow!("set remote offer failed: {:?}", e))?;

    let answer = pc
        .create_answer(None)
        .map_err(|e| anyhow!("create answer failed: {:?}", e))?;
    pc.set_local_description(answer.clone())
        .map_err(|e| anyhow!("set local answer failed: {:?}", e))?;
    *pending_local_offer = false;
    *ignore_next_negotiation = true;
    Ok(answer.sdp)
}

fn add_remote_ice<I>(pc: &mut RTCPeerConnection<I>, candidate: &str, sdp_mid: &str, mline: u16)
where
    I: rtc_interceptor::Interceptor,
{
    let init = RTCIceCandidateInit {
        candidate: candidate.to_string(),
        sdp_mid: Some(sdp_mid.to_string()),
        sdp_mline_index: Some(mline),
        username_fragment: None,
        url: None,
    };
    if let Err(e) = pc.add_remote_candidate(init) {
        warn!(
            "add remote candidate failed (expected before remote desc): {:?}",
            e
        );
    }
}

fn send_rtp<I>(
    pc: &mut RTCPeerConnection<I>,
    sender_id: RTCRtpSenderId,
    seq: &mut u16,
    ts: &mut u32,
    ssrc: u32,
) -> Result<()>
where
    I: rtc_interceptor::Interceptor,
{
    if let Some(mut sender) = pc.rtp_sender(sender_id) {
        let header = RtpHeader {
            version: 2,
            padding: false,
            extension: false,
            marker: false,
            payload_type: 0,
            sequence_number: *seq,
            timestamp: *ts,
            ssrc,
            csrc: vec![],
            extension_profile: 0,
            extensions: vec![],
            extensions_padding: 0,
        };
        *seq = seq.wrapping_add(1);
        *ts = ts.wrapping_add(960);
        let packet = RtpPacket {
            header,
            payload: bytes::Bytes::from_static(&[0xf8; 40]),
        };
        sender
            .write_rtp(packet)
            .map_err(|e| anyhow!("write rtp failed: {:?}", e))?;
    }
    Ok(())
}

async fn run_client(
    ws_url: String,
    room_id: String,
    user_id: String,
    display_name: String,
    token_secret: String,
    ssrc: u32,
    duration: Duration,
    stats: Arc<Mutex<Stats>>,
) -> Result<()> {
    let token = make_sfu_token(&room_id, &user_id, &token_secret);

    let (ws_stream, _) = connect_async(&ws_url).await?;
    let (mut ws_out, mut ws_in) = ws_stream.split();

    let join = join_signal(&room_id, &display_name, &user_id, &token);
    ws_out.send(Message::Text(join)).await?;

    // Build the RTC peer after the WebSocket is up; the SFU will send
    // `connected` and then the offer/answer exchange.
    let (mut pc, socket, local_addr) = build_pc().await?;
    info!("{} local UDP address: {}", user_id, local_addr);

    let test_timeout = tokio::time::sleep(duration);
    tokio::pin!(test_timeout);

    let mut buf = vec![0u8; 2000];
    let default_timeout = Instant::now() + Duration::from_secs(60);
    let mut pending_local_offer = false;
    let mut ignore_next_negotiation = false;
    let mut peer_id: Option<String> = None;
    let mut sender_id: Option<RTCRtpSenderId> = None;
    let mut seq = 1u16;
    let mut ts = 0u32;
    let mut connected = false;
    let mut feedback: Option<(RTCRtpReceiverId, u32)> = None;
    let mut feedback_sent = false;
    let mut rtp_interval = tokio::time::interval(Duration::from_millis(20));
    rtp_interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

    let drop_rate: f64 = std::env::var("DROP_RATE")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0.0f64)
        .clamp(0.0f64, 1.0f64);
    let dropping = drop_rate > 0.0 && user_id == "client-b";
    let mut write_count = 0usize;

    loop {
        while let Some(out) = pc.poll_write() {
            let len = out.message.len();
            let first_bytes: Vec<u8> = out.message.iter().take(8).copied().collect();
            if write_count < 5 || (len < 80 && write_count % 20 == 0) {
                info!(
                    "{} poll_write #{} -> {:?} ({} bytes) bytes={:?}",
                    user_id, write_count, out.transport.peer_addr, len, first_bytes
                );
            }
            write_count += 1;
            if let Err(e) = socket.send_to(&out.message, out.transport.peer_addr).await {
                warn!("{} UDP send failed: {:?}", user_id, e);
            }
        }

        while let Some(event) = pc.poll_event() {
            match handle_event(
                &mut pc,
                event,
                &mut pending_local_offer,
                &mut ignore_next_negotiation,
                &mut connected,
                &mut feedback,
            ) {
                Ok(msgs) => {
                    for m in msgs {
                        ws_out.send(Message::Text(m)).await?;
                    }
                }
                Err(e) => {
                    warn!("{} event handling failed: {:?}", user_id, e);
                }
            }
        }

        while let Some(message) = pc.poll_read() {
            match message {
                RTCMessage::RtpPacket(track_id, pkt) => {
                    let mut s = stats.lock().await;
                    s.received += 1;
                    s.last_seq = Some(pkt.header.sequence_number);
                    if s.received % 100 == 0 {
                        info!(
                            "{} received {} RTP packets on {}",
                            user_id, s.received, track_id
                        );
                    }
                    drop(s);

                    // Send PLI/FIR once the first packets start arriving and the
                    // SRTP context is definitely ready.
                    if !feedback_sent {
                        if let Some((receiver_id, remote_ssrc)) = feedback {
                            if let Some(mut receiver) = pc.rtp_receiver(receiver_id) {
                                let pli = Box::new(PictureLossIndication {
                                    sender_ssrc: 0,
                                    media_ssrc: remote_ssrc,
                                });
                                let fir = Box::new(FullIntraRequest {
                                    sender_ssrc: 0,
                                    media_ssrc: remote_ssrc,
                                    fir: vec![FirEntry {
                                        ssrc: remote_ssrc,
                                        sequence_number: 1,
                                    }],
                                });
                                if let Err(e) = receiver.write_rtcp(vec![pli, fir]) {
                                    warn!("{} failed to write RTCP feedback: {:?}", user_id, e);
                                } else {
                                    info!(
                                        "{} sent PLI/FIR for remote ssrc {}",
                                        user_id, remote_ssrc
                                    );
                                    feedback_sent = true;
                                }
                            }
                        }
                    }
                }
                RTCMessage::RtcpPacket(track_id, pkts) => {
                    info!("{} RTCP on {}: {} packets", user_id, track_id, pkts.len());
                }
                RTCMessage::DataChannelMessage(..) => {}
            }
        }

        let timeout = pc.poll_timeout().unwrap_or(default_timeout);
        let delay = timeout.saturating_duration_since(Instant::now());

        if delay.is_zero() {
            if let Err(e) = pc.handle_timeout(Instant::now()) {
                warn!("{} handle_timeout failed: {:?}", user_id, e);
            }
            continue;
        }

        tokio::select! {
            _ = tokio::time::sleep(delay) => {
                if let Err(e) = pc.handle_timeout(Instant::now()) {
                    warn!("{} handle_timeout failed: {:?}", user_id, e);
                }
            }
            result = socket.recv_from(&mut buf) => {
                match result {
                    Ok((n, peer_addr)) => {
                        if dropping && rand::random::<f64>() < drop_rate {
                            let mut s = stats.lock().await;
                            s.dropped += 1;
                            if s.dropped % 10 == 0 {
                                info!("{} dropped {} incoming packets", user_id, s.dropped);
                            }
                            continue;
                        }
                        if let Err(e) = pc.handle_read(TaggedBytesMut {
                            now: Instant::now(),
                            transport: TransportContext {
                                local_addr,
                                peer_addr,
                                ecn: None,
                                transport_protocol: TransportProtocol::UDP,
                            },
                            message: BytesMut::from(&buf[..n]),
                        }) {
                            warn!("{} handle_read failed: {:?}", user_id, e);
                        }
                    }
                    Err(e) => warn!("{} UDP recv failed: {:?}", user_id, e),
                }
            }
            msg = ws_in.next() => {
                let msg = match msg {
                    Some(Ok(Message::Text(t))) => t,
                    Some(Ok(Message::Close(_))) | None => {
                        info!("{} WebSocket closed", user_id);
                        break;
                    }
                    Some(Err(e)) => {
                        warn!("{} ws error: {:?}", user_id, e);
                        break;
                    }
                    _ => continue,
                };

                let val: Value = serde_json::from_str(&msg).unwrap_or(Value::Null);
                let typ = val.get("type").and_then(Value::as_str).unwrap_or("");
                match typ {
                    "connected" => {
                        if peer_id.is_none() {
                            if let Some(id) = val.get("participant_id").and_then(Value::as_str) {
                                peer_id = Some(id.to_string());
                                info!("{} connected as {}", user_id, id);

                                let track = build_audio_track(&format!("audio-{}", user_id), ssrc);
                                sender_id = Some(pc.add_track(track).map_err(|e| anyhow!("{} add_track failed: {:?}", user_id, e))?);
                                info!("{} added track, sender {:?}", user_id, sender_id);
                            }
                        }
                    }
                    "answer" => {
                        if let Some(sdp) = val.get("sdp").and_then(Value::as_str) {
                            info!("{} received answer", user_id);
                            set_remote_answer(&mut pc, sdp, &mut pending_local_offer, &mut ignore_next_negotiation)?;
                        }
                    }
                    "offer" => {
                        if let Some(sdp) = val.get("sdp").and_then(Value::as_str) {
                            info!("{} received offer", user_id);
                            let answer_sdp = set_remote_offer_and_answer(&mut pc, sdp, &mut pending_local_offer, &mut ignore_next_negotiation)?;
                            ws_out.send(Message::Text(answer_signal(&answer_sdp))).await?;
                        }
                    }
                    "ice" => {
                        if let (Some(c), Some(mid), Some(idx)) = (
                            val.get("candidate").and_then(Value::as_str),
                            val.get("sdp_mid").and_then(Value::as_str),
                            val.get("sdp_m_line_index").and_then(Value::as_u64),
                        ) {
                            add_remote_ice(&mut pc, c, mid, idx as u16);
                        }
                    }
                    "error" => {
                        if let Some(m) = val.get("message").and_then(Value::as_str) {
                            warn!("SFU error: {}", m);
                        }
                    }
                    _ => {}
                }
            }
            _ = rtp_interval.tick(), if connected && sender_id.is_some() => {
                send_rtp(&mut pc, sender_id.unwrap(), &mut seq, &mut ts, ssrc)?;
                stats.lock().await.sent += 1;
            }
            _ = test_timeout.as_mut() => {
                info!("{} test complete", user_id);
                break;
            }
        }
    }

    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    let sfu_port = std::env::var("SFU_PORT").unwrap_or_else(|_| "18443".to_string());
    let ws_url =
        std::env::var("SFU_URL").unwrap_or_else(|_| format!("ws://127.0.0.1:{}", sfu_port));
    let token_secret = std::env::var("SFU_TOKEN_SECRET").unwrap_or_else(|_| "dev".to_string());
    let room_id = std::env::var("ROOM_ID").unwrap_or_else(|_| "e2e_room".to_string());
    let duration: u64 = std::env::var("DURATION_SECS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(15);

    let stats_a = Arc::new(Mutex::new(Stats {
        sent: 0,
        received: 0,
        dropped: 0,
        last_seq: None,
    }));
    let stats_b = Arc::new(Mutex::new(Stats {
        sent: 0,
        received: 0,
        dropped: 0,
        last_seq: None,
    }));

    let client_a = run_client(
        ws_url.clone(),
        room_id.clone(),
        "client-a".to_string(),
        "Sender".to_string(),
        token_secret.clone(),
        11111111,
        Duration::from_secs(duration),
        stats_a.clone(),
    );

    let client_b = run_client(
        ws_url.clone(),
        room_id.clone(),
        "client-b".to_string(),
        "Receiver".to_string(),
        token_secret,
        22222222,
        Duration::from_secs(duration),
        stats_b.clone(),
    );

    let (res_a, res_b) = tokio::join!(client_a, client_b);

    let s_a = stats_a.lock().await;
    let s_b = stats_b.lock().await;
    info!(
        "client-a sent={}, received={}, dropped={}",
        s_a.sent, s_a.received, s_a.dropped
    );
    info!(
        "client-b sent={}, received={}, dropped={}",
        s_b.sent, s_b.received, s_b.dropped
    );

    res_a?;
    res_b?;
    Ok(())
}
