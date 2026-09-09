//! `webrtc` → `rtc` migration: `RTCPeerConnection` peer wrapper and signal handler.
//!
//! This module is compiled only with the `rtc` feature. It implements join/offer/
//! answer/ice, per-subscriber RTP forwarding, recording tee, and uses the `rtc`
//! default interceptor chain for NACK/RTCP plumbing.

use anyhow::{anyhow, Result};
use bytes::BytesMut;
use rtc::media_stream::MediaStreamTrack;
use rtc::peer_connection::configuration::{
    interceptor_registry::register_default_interceptors, media_engine::MediaEngine,
    RTCConfigurationBuilder, RTCIceServer,
};
use rtc::peer_connection::event::{RTCPeerConnectionEvent, RTCTrackEvent};
use rtc::peer_connection::message::RTCMessage;
use rtc::peer_connection::sdp::RTCSessionDescription;
use rtc::peer_connection::state::{
    RTCIceConnectionState, RTCIceGatheringState, RTCPeerConnectionState,
};
use rtc::peer_connection::transport::RTCIceCandidateInit;
use rtc::peer_connection::RTCPeerConnection;
use rtc::peer_connection::RTCPeerConnectionBuilder;
use rtc::rtp_transceiver::{RTCRtpReceiverId, RTCRtpSenderId};
use rtc::rtp_transceiver::rtp_sender::{
    RTCPFeedback, RTCRtpCodec, RTCRtpCodingParameters, RTCRtpEncodingParameters, RtpCodecKind,
};
use rtc::sansio::Protocol;
use rtc::shared::{TaggedBytesMut, TransportContext, TransportProtocol};
use rtc_interceptor::Interceptor;
use rtp::Packet as RtpPacket;
use std::net::SocketAddr;
use std::time::{Duration, Instant};
use tokio::net::UdpSocket;
use tokio::sync::{mpsc, oneshot};
use tokio::task::JoinHandle;
use tracing::{info, warn};

use crate::{recording, validate_display_name, verify_sfu_token, Event, PeerId, RoomId, SharedState, Signal};

/// RTP packet plus the sender ID on the subscriber peer that should transmit it.
#[derive(Clone)]
pub struct RtpForward {
    pub sender_id: RTCRtpSenderId,
    pub packet: RtpPacket,
}

/// A subscriber forwarding slot for one published track.
#[derive(Clone)]
pub struct TrackForwarder {
    pub sender_id: RTCRtpSenderId,
    pub tx: mpsc::Sender<RtpForward>,
}

/// Published `rtc` track stored in the shared room state.
#[derive(Clone)]
pub struct RtcRoomTrack {
    pub publisher: PeerId,
    pub room_id: RoomId,
    pub kind: RtpCodecKind,
    pub ssrcs: Vec<u32>,
    pub codec: Option<RTCRtpCodec>,
    pub receiver_id: Option<RTCRtpReceiverId>,
    pub forwarders: Vec<TrackForwarder>,
    pub writer: Option<recording::SharedTrackWriter>,
}

enum RtcCommand {
    HandleOffer {
        sdp: String,
        target: PeerId,
        respond: oneshot::Sender<Result<String>>,
    },
    HandleAnswer {
        sdp: String,
        target: PeerId,
    },
    AddIceCandidate {
        candidate: String,
        sdp_m_line_index: u16,
        sdp_mid: Option<String>,
    },
    AddLocalTrack {
        track_id: String,
        kind: RtpCodecKind,
        ssrcs: Vec<u32>,
        codec: Option<RTCRtpCodec>,
        respond: oneshot::Sender<Result<(RTCRtpSenderId, mpsc::Sender<RtpForward>)>>,
    },
    WriteReceiverRtcp {
        receiver_id: RTCRtpReceiverId,
        packets: Vec<Box<dyn rtcp::Packet>>,
    },
    Close,
}

/// Handle to an `rtc` peer. The actual `RTCPeerConnection` and UDP socket live
/// inside a dedicated spawned task.
#[derive(Clone)]
pub struct RtcPeer {
    cmd_tx: mpsc::Sender<RtcCommand>,
}

impl RtcPeer {
    pub async fn new(
        peer_id: &str,
        tx: mpsc::UnboundedSender<Event>,
        state: SharedState,
        room_id: RoomId,
    ) -> Result<(Self, SocketAddr)> {
        let mut media_engine = MediaEngine::default();
        let registry = register_default_interceptors(
            rtc_interceptor::Registry::new(),
            &mut media_engine,
        )
        .map_err(|e| anyhow!("failed to register default interceptors: {:?}", e))?;

        let pc: RTCPeerConnection<_> = RTCPeerConnectionBuilder::new()
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
            .build()
            .map_err(|e| anyhow!("failed to build rtc peer: {:?}", e))?;

        let socket = UdpSocket::bind("0.0.0.0:0").await?;
        let local_addr = socket.local_addr()?;
        info!("Rtc peer {} listening on {}", peer_id, local_addr);

        let (cmd_tx, cmd_rx) = mpsc::channel::<RtcCommand>(32);
        let (rtp_tx, rtp_rx) = mpsc::channel::<RtpForward>(128);
        let _ = spawn_network_task(
            peer_id.to_string(),
            pc,
            socket,
            tx,
            cmd_rx,
            state,
            room_id,
            rtp_tx,
            rtp_rx,
        );

        Ok((Self { cmd_tx }, local_addr))
    }

    pub async fn handle_offer(&self, sdp: String, target: PeerId) -> Result<String> {
        let (tx, rx) = oneshot::channel();
        self.cmd_tx
            .send(RtcCommand::HandleOffer { sdp, target, respond: tx })
            .await
            .map_err(|_| anyhow!("rtc network task gone"))?;
        rx.await
            .map_err(|_| anyhow!("rtc network task dropped answer"))?
    }

    pub async fn handle_answer(&self, sdp: String, target: PeerId) -> Result<()> {
        self.cmd_tx
            .send(RtcCommand::HandleAnswer { sdp, target })
            .await
            .map_err(|_| anyhow!("rtc network task gone"))
    }

    pub async fn add_ice_candidate(
        &self,
        candidate: String,
        sdp_m_line_index: u16,
        sdp_mid: Option<String>,
    ) -> Result<()> {
        self.cmd_tx
            .send(RtcCommand::AddIceCandidate {
                candidate,
                sdp_m_line_index,
                sdp_mid,
            })
            .await
            .map_err(|_| anyhow!("rtc network task gone"))
    }

    /// Add a local track to this peer so published media can be forwarded to it.
    /// Returns the `RTCRtpSenderId` to use for writing RTP and a channel to send
    /// RTP packets into the peer's network task.
    pub async fn add_local_track(
        &self,
        track_id: String,
        kind: RtpCodecKind,
        ssrcs: Vec<u32>,
        codec: Option<RTCRtpCodec>,
    ) -> Result<(RTCRtpSenderId, mpsc::Sender<RtpForward>)> {
        let (tx, rx) = oneshot::channel();
        self.cmd_tx
            .send(RtcCommand::AddLocalTrack {
                track_id,
                kind,
                ssrcs,
                codec,
                respond: tx,
            })
            .await
            .map_err(|_| anyhow!("rtc network task gone"))?;
        rx.await
            .map_err(|_| anyhow!("rtc network task dropped sender"))?
    }

    pub async fn write_receiver_rtcp(
        &self,
        receiver_id: RTCRtpReceiverId,
        packets: Vec<Box<dyn rtcp::Packet>>,
    ) -> Result<()> {
        self.cmd_tx
            .send(RtcCommand::WriteReceiverRtcp { receiver_id, packets })
            .await
            .map_err(|_| anyhow!("rtc network task gone"))
    }
}

fn is_feedback_packet(p: &dyn rtcp::Packet) -> bool {
    use rtcp::header::{PacketType, FORMAT_FIR, FORMAT_PLI};
    matches!(
        p.header().packet_type,
        PacketType::PayloadSpecificFeedback
            if p.header().count == FORMAT_PLI || p.header().count == FORMAT_FIR
    )
}

fn to_webrtc_packet(pkt: &RtpPacket) -> webrtc::rtp::packet::Packet {
    webrtc::rtp::packet::Packet {
        header: webrtc::rtp::header::Header {
            version: pkt.header.version,
            padding: pkt.header.padding,
            extension: pkt.header.extension,
            marker: pkt.header.marker,
            payload_type: pkt.header.payload_type,
            sequence_number: pkt.header.sequence_number,
            timestamp: pkt.header.timestamp,
            ssrc: pkt.header.ssrc,
            csrc: pkt.header.csrc.clone(),
            extension_profile: pkt.header.extension_profile,
            extensions: pkt
                .header
                .extensions
                .iter()
                .map(|e| webrtc::rtp::header::Extension {
                    id: e.id,
                    payload: e.payload.clone(),
                })
                .collect(),
            extensions_padding: 0,
        },
        payload: pkt.payload.clone(),
    }
}

fn spawn_network_task<I>(
    peer_id: PeerId,
    mut pc: RTCPeerConnection<I>,
    socket: UdpSocket,
    tx: mpsc::UnboundedSender<Event>,
    mut cmd_rx: mpsc::Receiver<RtcCommand>,
    state: SharedState,
    room_id: RoomId,
    rtp_tx: mpsc::Sender<RtpForward>,
    mut rtp_rx: mpsc::Receiver<RtpForward>,
) -> JoinHandle<()>
where
    I: Interceptor + Send + 'static,
{
    tokio::spawn(async move {
        let local_addr = match socket.local_addr() {
            Ok(a) => a,
            Err(e) => {
                warn!("Rtc network task {}: cannot get local addr: {}", peer_id, e);
                return;
            }
        };
        let mut buf = vec![0u8; 2000];
        let default_timeout = Instant::now() + Duration::from_secs(86400);

        loop {
            // Drain outgoing network packets.
            while let Some(out) = pc.poll_write() {
                if let Err(e) = socket.send_to(&out.message, out.transport.peer_addr).await {
                    warn!("Rtc {} send failed: {}", peer_id, e);
                }
            }

            // Drain events (ICE candidates, state changes, tracks).
            while let Some(event) = pc.poll_event() {
                match event {
                    RTCPeerConnectionEvent::OnIceConnectionStateChangeEvent(state) => {
                        info!("Rtc {} ICE state: {:?}", peer_id, state);
                        if state == RTCIceConnectionState::Failed {
                            return;
                        }
                    }
                    RTCPeerConnectionEvent::OnConnectionStateChangeEvent(state) => {
                        info!("Rtc {} connection state: {:?}", peer_id, state);
                        if state == RTCPeerConnectionState::Failed {
                            return;
                        }
                    }
                    RTCPeerConnectionEvent::OnIceCandidateEvent(ice_event) => {
                        if let Ok(init) = ice_event.candidate.to_json() {
                            let _ = tx.send(Event::Ice {
                                from: crate::SFU_ID.to_string(),
                                candidate: init.candidate,
                                sdp_m_line_index: init.sdp_mline_index.unwrap_or(0),
                                sdp_mid: init.sdp_mid,
                            });
                        }
                    }
                    RTCPeerConnectionEvent::OnIceGatheringStateChangeEvent(
                        RTCIceGatheringState::Complete,
                    ) => {
                        info!("Rtc {} ICE gathering complete", peer_id);
                    }
                    RTCPeerConnectionEvent::OnNegotiationNeededEvent => {
                        info!("Rtc {} negotiation needed", peer_id);
                        match pc.create_offer(None) {
                            Ok(offer) => {
                                if let Err(e) = pc.set_local_description(offer.clone()) {
                                    warn!("Rtc {} set_local_description failed: {:?}", peer_id, e);
                                } else {
                                    let _ = tx.send(Event::Offer {
                                        from: crate::SFU_ID.to_string(),
                                        sdp: offer.sdp,
                                    });
                                }
                            }
                            Err(e) => warn!("Rtc {} create_offer failed: {:?}", peer_id, e),
                        }
                    }
                    RTCPeerConnectionEvent::OnTrack(track_event) => match track_event {
                        RTCTrackEvent::OnOpen(init) => {
                            info!(
                                "Rtc {} track opened: track_id={}, receiver_id={:?}",
                                peer_id, init.track_id, init.receiver_id
                            );
                            if let Some(mut receiver) = pc.rtp_receiver(init.receiver_id) {
                                let track = receiver.track().clone();
                                let kind = track.kind();
                                let ssrcs: Vec<u32> = track.ssrcs().collect();
                                let codec = receiver
                                    .get_parameters()
                                    .rtp_parameters
                                    .codecs
                                    .first()
                                    .map(|c| c.rtp_codec.clone());
                                let writer = {
                                    let s = state.read().await;
                                    s.rooms
                                        .get(&room_id)
                                        .and_then(|r| r.recording.clone())
                                        .map(|rec| {
                                            let slot = recording::new_track_writer_slot();
                                            recording::attach_rtc_track_writer(
                                                &rec,
                                                &slot,
                                                &room_id,
                                                &peer_id,
                                                &init.track_id,
                                                codec.as_ref(),
                                            );
                                            slot
                                        })
                                };

                                let mut s = state.write().await;
                                s.rtc_tracks.insert(
                                    init.track_id.clone(),
                                    RtcRoomTrack {
                                        publisher: peer_id.clone(),
                                        room_id: room_id.clone(),
                                        kind,
                                        ssrcs: ssrcs.clone(),
                                        codec: codec.clone(),
                                        receiver_id: Some(init.receiver_id),
                                        forwarders: vec![],
                                        writer,
                                    },
                                );
                                drop(s);

                                // Add this new track to every other rtc peer already in the room.
                                let other_peers: Vec<String> = {
                                    let s = state.read().await;
                                    s.rooms
                                        .get(&room_id)
                                        .map(|r| {
                                            r.participants
                                                .keys()
                                                .filter(|id| *id != &peer_id)
                                                .cloned()
                                                .collect()
                                        })
                                        .unwrap_or_default()
                                };

                                for other_id in other_peers {
                                    let maybe_peer = {
                                        let s = state.read().await;
                                        s.rtc_peers.get(&other_id).cloned()
                                    };
                                    if let Some(other_peer) = maybe_peer {
                                        match other_peer
                                            .add_local_track(
                                                init.track_id.clone(),
                                                kind,
                                                ssrcs.clone(),
                                                codec.clone(),
                                            )
                                            .await
                                        {
                                            Ok((sender_id, rtp_tx)) => {
                                                let mut s = state.write().await;
                                                if let Some(room_track) =
                                                    s.rtc_tracks.get_mut(&init.track_id)
                                                {
                                                    room_track.forwarders.push(TrackForwarder {
                                                        sender_id,
                                                        tx: rtp_tx,
                                                    });
                                                }
                                            }
                                            Err(e) => {
                                                warn!(
                                                    "Rtc {} failed to forward track {} to {}: {:?}",
                                                    peer_id, init.track_id, other_id, e
                                                );
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        RTCTrackEvent::OnClose(track_id) => {
                            info!("Rtc {} track closed: {}", peer_id, track_id);
                            let mut s = state.write().await;
                            if let Some(track) = s.rtc_tracks.remove(&track_id) {
                                if let Some(recorder) = s.rooms.get(&room_id).and_then(|r| r.recording.clone()) {
                                    tokio::spawn(async move {
                                        recording::finish_track_writer(&recorder, &track.writer.unwrap_or_else(recording::new_track_writer_slot)).await;
                                    });
                                }
                            }
                        }
                        _ => {}
                    },
                    _ => {}
                }
            }

            // Drain incoming RTP/RTCP/data messages.
            while let Some(message) = pc.poll_read() {
                match message {
                    RTCMessage::RtpPacket(track_id, rtp_packet) => {
                        let tracks = {
                            let s = state.read().await;
                            s.rtc_tracks.get(&track_id).cloned()
                        };
                        if let Some(track) = tracks {
                            for fwd in &track.forwarders {
                                let fwd_msg = RtpForward {
                                    sender_id: fwd.sender_id,
                                    packet: rtp_packet.clone(),
                                };
                                if let Err(_) = fwd.tx.try_send(fwd_msg) {
                                    warn!(
                                        "Rtc {} forward queue full for track {} to {:?}",
                                        peer_id, track_id, fwd.sender_id
                                    );
                                }
                            }

                            if let Some(ref writer) = track.writer {
                                let w_pkt = to_webrtc_packet(&rtp_packet);
                                let mut guard = writer.lock().await;
                                if let Some((ref mut w, _)) = guard.as_mut() {
                                    w.write_rtp(&w_pkt);
                                }
                            }
                        }
                    }
                    RTCMessage::RtcpPacket(track_id, rtcp_packets) => {
                        info!(
                            "Rtc {} RTCP on track {}: {} packets",
                            peer_id,
                            track_id,
                            rtcp_packets.len()
                        );

                        // Forward PLI/FIR feedback from subscribers back to the original
                        // publisher so the encoder can refresh the keyframe.
                        if let Some(track) = {
                            let s = state.read().await;
                            s.rtc_tracks.get(&track_id).cloned()
                        } {
                            if let (Some(receiver_id), Some(publisher_peer)) = (
                                track.receiver_id,
                                {
                                    let s = state.read().await;
                                    s.rtc_peers.get(&track.publisher).cloned()
                                },
                            ) {
                                let feedback: Vec<Box<dyn rtcp::Packet>> = rtcp_packets
                                    .iter()
                                    .filter(|p| is_feedback_packet(p.as_ref()))
                                    .cloned()
                                    .collect();
                                if !feedback.is_empty() {
                                    if let Err(e) = publisher_peer
                                        .write_receiver_rtcp(receiver_id, feedback)
                                        .await
                                    {
                                        warn!(
                                            "Rtc {} failed to forward RTCP for track {} to publisher {}: {:?}",
                                            peer_id, track_id, track.publisher, e
                                        );
                                    }
                                }
                            }
                        }
                    }
                    RTCMessage::DataChannelMessage(channel_id, message) => {
                        info!(
                            "Rtc {} data channel message on {:?}: {} bytes",
                            peer_id,
                            channel_id,
                            message.data.len()
                        );
                    }
                }
            }

            // Wait for the next timer or incoming UDP packet or command.
            let timeout = pc.poll_timeout().unwrap_or(default_timeout);
            let delay = timeout.saturating_duration_since(Instant::now());

            if delay.is_zero() {
                if let Err(e) = pc.handle_timeout(Instant::now()) {
                    warn!("Rtc {} handle_timeout failed: {:?}", peer_id, e);
                }
                continue;
            }

            tokio::select! {
                _ = tokio::time::sleep(delay) => {
                    if let Err(e) = pc.handle_timeout(Instant::now()) {
                        warn!("Rtc {} handle_timeout failed: {:?}", peer_id, e);
                    }
                }
                result = socket.recv_from(&mut buf) => {
                    match result {
                        Ok((n, peer_addr)) => {
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
                                warn!("Rtc {} handle_read failed: {:?}", peer_id, e);
                            }
                        }
                        Err(e) => warn!("Rtc {} UDP recv error: {}", peer_id, e),
                    }
                }
                cmd = cmd_rx.recv() => {
                    match cmd {
                        Some(RtcCommand::HandleOffer { sdp, target: _, respond }) => {
                            let answer_sdp = handle_offer_sdp(&mut pc, &sdp);
                            if let Err(ref e) = answer_sdp {
                                warn!("Rtc {} handle offer failed: {:?}", peer_id, e);
                            }
                            let _ = respond.send(answer_sdp);
                        }
                        Some(RtcCommand::HandleAnswer { sdp, target: _ }) => {
                            if let Err(e) = handle_answer_sdp(&mut pc, &sdp) {
                                warn!("Rtc {} handle answer failed: {:?}", peer_id, e);
                            }
                        }
                        Some(RtcCommand::AddIceCandidate { candidate, sdp_m_line_index, sdp_mid }) => {
                            let init = RTCIceCandidateInit {
                                candidate,
                                sdp_mid,
                                sdp_mline_index: Some(sdp_m_line_index),
                                username_fragment: None,
                                url: None,
                            };
                            if let Err(e) = pc.add_remote_candidate(init) {
                                warn!("Rtc {} add_remote_candidate failed: {:?}", peer_id, e);
                            }
                        }
                        Some(RtcCommand::AddLocalTrack { track_id, kind, ssrcs, codec, respond }) => {
                            let result = add_local_track(&mut pc, &room_id, &peer_id, track_id, kind, ssrcs, codec);
                            if let Err(ref e) = result {
                                warn!("Rtc {} add_local_track failed: {:?}", peer_id, e);
                            }
                            let response = result.map(|sender_id| (sender_id, rtp_tx.clone()));
                            let _ = respond.send(response);
                        }
                        Some(RtcCommand::WriteReceiverRtcp { receiver_id, packets }) => {
                            if let Some(mut receiver) = pc.rtp_receiver(receiver_id) {
                                if let Err(e) = receiver.write_rtcp(packets) {
                                    warn!("Rtc {} write_rtcp on receiver {:?} failed: {:?}", peer_id, receiver_id, e);
                                }
                            }
                        }
                        Some(RtcCommand::Close) | None => {
                            info!("Rtc {} closing", peer_id);
                            return;
                        }
                    }
                }
                rtp = rtp_rx.recv() => {
                    if let Some(fwd) = rtp {
                        if let Some(mut sender) = pc.rtp_sender(fwd.sender_id) {
                            if let Err(e) = sender.write_rtp(fwd.packet) {
                                warn!("Rtc {} write_rtp failed for sender {:?}: {:?}", peer_id, fwd.sender_id, e);
                            }
                        }
                    }
                }
            }
        }
    })
}

fn default_codec(kind: RtpCodecKind) -> RTCRtpCodec {
    match kind {
        RtpCodecKind::Audio => RTCRtpCodec {
            mime_type: "audio/opus".to_string(),
            clock_rate: 48000,
            channels: 2,
            sdp_fmtp_line: "".to_string(),
            rtcp_feedback: vec![],
        },
        RtpCodecKind::Video => RTCRtpCodec {
            mime_type: "video/VP8".to_string(),
            clock_rate: 90000,
            channels: 0,
            sdp_fmtp_line: "".to_string(),
            rtcp_feedback: vec![RTCPFeedback {
                typ: "nack".to_string(),
                parameter: "pli".to_string(),
            }],
        },
        _ => RTCRtpCodec::default(),
    }
}

fn add_local_track<I: Interceptor>(
    pc: &mut RTCPeerConnection<I>,
    room_id: &RoomId,
    peer_id: &PeerId,
    track_id: String,
    kind: RtpCodecKind,
    ssrcs: Vec<u32>,
    codec: Option<RTCRtpCodec>,
) -> Result<RTCRtpSenderId> {
    let codec = codec.unwrap_or_else(|| default_codec(kind));
    let codings: Vec<RTCRtpEncodingParameters> = if ssrcs.is_empty() {
        vec![RTCRtpEncodingParameters {
            rtp_coding_parameters: RTCRtpCodingParameters {
                rid: String::new(),
                ssrc: None,
                rtx: None,
                fec: None,
            },
            active: true,
            codec,
            max_bitrate: 0,
            max_framerate: None,
            scale_resolution_down_by: None,
        }]
    } else {
        ssrcs
            .iter()
            .map(|ssrc| RTCRtpEncodingParameters {
                rtp_coding_parameters: RTCRtpCodingParameters {
                    rid: String::new(),
                    ssrc: Some(*ssrc),
                    rtx: None,
                    fec: None,
                },
                active: true,
                codec: codec.clone(),
                max_bitrate: 0,
                max_framerate: None,
                scale_resolution_down_by: None,
            })
            .collect()
    };

    let track = MediaStreamTrack::new(
        room_id.clone(),
        track_id,
        peer_id.clone(),
        kind,
        codings,
    );

    pc.add_track(track)
        .map_err(|e| anyhow!("add_track failed: {:?}", e))
}

fn handle_offer_sdp<I: Interceptor>(pc: &mut RTCPeerConnection<I>, sdp: &str) -> Result<String> {
    let offer = RTCSessionDescription::offer(sdp.to_string())
        .map_err(|e| anyhow!("failed to parse offer: {:?}", e))?;
    pc.set_remote_description(offer)
        .map_err(|e| anyhow!("set_remote_description failed: {:?}", e))?;
    let answer = pc
        .create_answer(None)
        .map_err(|e| anyhow!("create_answer failed: {:?}", e))?;
    pc.set_local_description(answer.clone())
        .map_err(|e| anyhow!("set_local_description failed: {:?}", e))?;
    Ok(answer.sdp)
}

fn handle_answer_sdp<I: Interceptor>(pc: &mut RTCPeerConnection<I>, sdp: &str) -> Result<()> {
    let answer = RTCSessionDescription::answer(sdp.to_string())
        .map_err(|e| anyhow!("failed to parse answer: {:?}", e))?;
    pc.set_remote_description(answer)
        .map_err(|e| anyhow!("set_remote_description failed: {:?}", e))?;
    Ok(())
}

fn room_state_event(state: &crate::State, room_id: &RoomId) -> Option<Event> {
    let room = state.rooms.get(room_id)?;
    let participants = room
        .participants
        .iter()
        .map(|(id, p)| crate::ParticipantInfo {
            id: id.clone(),
            display_name: p.display_name.clone(),
            user_id: p.user_id.clone(),
        })
        .collect();
    Some(Event::RoomState {
        room_id: room_id.clone(),
        participants,
    })
}

/// `rtc`-based signal processing. When the `rtc` feature is enabled this is
/// called instead of the `webrtc` `process_signal`.
pub async fn process_rtc_signal(
    peer_id: &str,
    signal: Signal,
    state: &SharedState,
    token_secret: &str,
) -> Result<()> {
    match signal {
        Signal::Join {
            room_id,
            display_name,
            user_id,
            token,
        } => {
            // Remove any previous rtc peer for this connection.
            {
                let mut s = state.write().await;
                s.rtc_peers.remove(peer_id);
            }
            crate::leave_room(peer_id, state).await;
            verify_sfu_token(&token, &room_id, &user_id, token_secret)?;
            validate_display_name(&display_name)?;

            let tx = {
                let s = state.read().await;
                s.peers
                    .get(peer_id)
                    .ok_or_else(|| anyhow!("unknown peer {} on join", peer_id))?
                    .tx
                    .clone()
            };

            let (rtc_peer, _local_addr) =
                RtcPeer::new(peer_id, tx.clone(), state.clone(), room_id.clone()).await?;

            {
                let mut s = state.write().await;
                if let Some(peer) = s.peers.get_mut(peer_id) {
                    peer.display_name = display_name.clone();
                    peer.user_id = user_id.clone();
                    peer.room_id = Some(room_id.clone());
                }
                s.rtc_peers.insert(peer_id.to_string(), rtc_peer.clone());
            }

            // Add this peer to the room.
            {
                let peer = {
                    let s = state.read().await;
                    s.peers
                        .get(peer_id)
                        .cloned()
                        .ok_or_else(|| anyhow!("peer {} missing", peer_id))?
                };
                let mut s = state.write().await;
                let room = s.rooms.entry(room_id.clone()).or_default();
                room.participants.insert(peer_id.to_string(), peer);
            }

            // Subscribe this new peer to tracks already being published in the room.
            let existing_tracks: Vec<(String, RtcRoomTrack)> = {
                let s = state.read().await;
                s.rtc_tracks
                    .iter()
                    .filter(|(_, t)| t.room_id == room_id && t.publisher != peer_id)
                    .map(|(id, t)| (id.clone(), t.clone()))
                    .collect()
            };
            for (track_id, track) in existing_tracks {
                match rtc_peer
                    .add_local_track(
                        track_id.clone(),
                        track.kind,
                        track.ssrcs.clone(),
                        track.codec.clone(),
                    )
                    .await
                {
                    Ok((sender_id, rtp_tx)) => {
                        let mut s = state.write().await;
                        if let Some(room_track) = s.rtc_tracks.get_mut(&track_id) {
                            room_track.forwarders.push(TrackForwarder { sender_id, tx: rtp_tx });
                        }
                    }
                    Err(e) => {
                        warn!(
                            "Rtc peer {} could not subscribe to track {}: {:?}",
                            peer_id, track_id, e
                        );
                    }
                }
            }

            let _ = tx.send(Event::Connected {
                participant_id: peer_id.to_string(),
            });

            {
                let s = state.read().await;
                if let Some(event) = room_state_event(&*s, &room_id) {
                    s.broadcast(&room_id, event, None);
                }
            }
        }

        Signal::Offer { sdp, target } => {
            let rtc_peer = {
                let s = state.read().await;
                s.rtc_peers
                    .get(peer_id)
                    .ok_or_else(|| anyhow!("no rtc peer for {} on offer", peer_id))?
                    .clone()
            };

            // The SFU is the answerer.
            let answer_sdp = rtc_peer.handle_offer(sdp, target.clone()).await?;
            let _ = state.read().await.peers.get(peer_id).map(|p| {
                p.tx.send(Event::Answer {
                    from: crate::SFU_ID.to_string(),
                    sdp: answer_sdp,
                })
            });
        }

        Signal::Answer { sdp, target } => {
            let rtc_peer = {
                let s = state.read().await;
                s.rtc_peers
                    .get(peer_id)
                    .ok_or_else(|| anyhow!("no rtc peer for {} on answer", peer_id))?
                    .clone()
            };

            rtc_peer.handle_answer(sdp, target).await?;
        }

        Signal::Ice {
            candidate,
            target,
            sdp_m_line_index,
            sdp_mid,
        } => {
            if target != crate::SFU_ID {
                return Err(anyhow!("rtc peer cannot relay ICE to target {}", target));
            }

            let rtc_peer = {
                let s = state.read().await;
                s.rtc_peers
                    .get(peer_id)
                    .ok_or_else(|| anyhow!("no rtc peer for {} on ice", peer_id))?
                    .clone()
            };

            rtc_peer
                .add_ice_candidate(candidate, sdp_m_line_index, sdp_mid)
                .await?;
        }

        Signal::Leave => {
            crate::leave_room(peer_id, state).await;
            let mut s = state.write().await;
            s.rtc_peers.remove(peer_id);
        }
    }

    Ok(())
}
