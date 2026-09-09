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
use rtc::peer_connection::RTCPeerConnection;
use rtc::peer_connection::RTCPeerConnectionBuilder;
use rtc::rtp_transceiver::rtp_sender::RTCRtpSender;
use rtc::rtp_transceiver::rtp_sender::{
    RTCPFeedback, RTCRtpCodec, RTCRtpCodecParameters, RTCRtpCodingParameters,
    RTCRtpEncodingParameters, RTCRtpFecParameters, RTCRtpRtxParameters, RtpCodecKind,
};
use rtc::rtp_transceiver::{RTCRtpReceiverId, RTCRtpSenderId};
use rtc::sansio::Protocol;
use rtc::shared::{error::Error as SharedError, TaggedBytesMut, TransportContext, TransportProtocol};
use rtc_interceptor::{Interceptor, Packet as IcptPacket, StreamInfo, TaggedPacket};
use rtp::Packet as RtpPacket;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::net::UdpSocket;
use tokio::sync::{mpsc, oneshot};
use tokio::task::JoinHandle;
use tracing::{info, warn};

use crate::{
    recording, validate_display_name, verify_sfu_token, Event, PeerId, RoomId, SharedState, Signal,
};

/// Metrics counters for the `rtc` media path.
#[derive(Default, Clone)]
pub struct RtcMetrics {
    pub packets_forwarded: Arc<AtomicU64>,
    pub bytes_forwarded: Arc<AtomicU64>,
    pub packets_dropped: Arc<AtomicU64>,
    pub feedback_forwarded: Arc<AtomicU64>,
    pub ice_failures: Arc<AtomicU64>,
}

impl RtcMetrics {
    pub fn inc_forwarded(&self, bytes: u64) {
        self.packets_forwarded.fetch_add(1, Ordering::Relaxed);
        self.bytes_forwarded.fetch_add(bytes, Ordering::Relaxed);
    }

    pub fn inc_dropped(&self, count: u64) {
        self.packets_dropped.fetch_add(count, Ordering::Relaxed);
    }

    pub fn inc_feedback(&self, count: u64) {
        self.feedback_forwarded.fetch_add(count, Ordering::Relaxed);
    }

    pub fn inc_ice_failure(&self) {
        self.ice_failures.fetch_add(1, Ordering::Relaxed);
    }
}

/// Interceptor that clones incoming RTCP packets and forwards them to a channel
/// so the SFU network task can route feedback (PLI/FIR) to the original publisher.
/// The `rtc` default interceptor chain terminates RTCP reads in `NoopInterceptor`,
/// so without this layer the SFU would never observe subscriber feedback.
pub struct RtcpForwarder<P> {
    next: P,
    rtcp_tx: mpsc::Sender<Vec<Box<dyn rtcp::Packet>>>,
}

impl<P> RtcpForwarder<P> {
    pub fn new(next: P, rtcp_tx: mpsc::Sender<Vec<Box<dyn rtcp::Packet>>>) -> Self {
        Self { next, rtcp_tx }
    }
}

impl<P: Interceptor> Protocol<TaggedPacket, TaggedPacket, ()> for RtcpForwarder<P> {
    type Rout = TaggedPacket;
    type Wout = TaggedPacket;
    type Eout = ();
    type Error = SharedError;
    type Time = Instant;

    fn handle_read(&mut self, msg: TaggedPacket) -> Result<(), Self::Error> {
        if let IcptPacket::Rtcp(rtcp_packets) = &msg.message {
            let cloned: Vec<Box<dyn rtcp::Packet>> =
                rtcp_packets.iter().map(|p| p.cloned()).collect();
            if self.rtcp_tx.try_send(cloned).is_err() {
                warn!("RtcpForwarder: rtcp_tx channel full or closed, dropping RTCP");
            }
        }
        self.next.handle_read(msg)
    }

    fn poll_read(&mut self) -> Option<Self::Rout> {
        self.next.poll_read()
    }

    fn handle_write(&mut self, msg: TaggedPacket) -> Result<(), Self::Error> {
        self.next.handle_write(msg)
    }

    fn poll_write(&mut self) -> Option<Self::Wout> {
        self.next.poll_write()
    }

    fn handle_event(&mut self, _evt: ()) -> Result<(), Self::Error> {
        Ok(())
    }

    fn poll_event(&mut self) -> Option<Self::Eout> {
        None
    }

    fn handle_timeout(&mut self, _now: Instant) -> Result<(), Self::Error> {
        Ok(())
    }

    fn poll_timeout(&mut self) -> Option<Instant> {
        None
    }

    fn close(&mut self) -> Result<(), Self::Error> {
        self.next.close()
    }
}

impl<P: Interceptor> Interceptor for RtcpForwarder<P> {
    fn bind_local_stream(&mut self, info: &StreamInfo) {
        self.next.bind_local_stream(info);
    }

    fn unbind_local_stream(&mut self, info: &StreamInfo) {
        self.next.unbind_local_stream(info);
    }

    fn bind_remote_stream(&mut self, info: &StreamInfo) {
        self.next.bind_remote_stream(info);
    }

    fn unbind_remote_stream(&mut self, info: &StreamInfo) {
        self.next.unbind_remote_stream(info);
    }
}

fn rtc_ice_servers() -> Vec<RTCIceServer> {
    let configs = crate::ice_server_configs();
    if configs.is_empty() {
        return vec![RTCIceServer {
            urls: vec!["stun:stun.l.google.com:19302".to_string()],
            ..Default::default()
        }];
    }

    configs
        .into_iter()
        .map(|c| RTCIceServer {
            urls: c.urls,
            username: c.username.unwrap_or_default(),
            credential: c.credential.unwrap_or_default(),
        })
        .collect()
}

/// RTP packet plus the sender ID and resolved codec on the subscriber peer
/// that should transmit it.
#[derive(Clone)]
pub struct RtpForward {
    pub sender_id: RTCRtpSenderId,
    pub packet: RtpPacket,
    pub codec: Option<RTCRtpCodec>,
}

/// A subscriber forwarding slot for one published track.
#[derive(Clone)]
pub struct TrackForwarder {
    pub subscriber: PeerId,
    pub sender_id: RTCRtpSenderId,
    pub tx: mpsc::Sender<RtpForward>,
}

/// Published `rtc` track stored in the shared room state.
#[derive(Clone)]
pub struct RtcRoomTrack {
    pub publisher: PeerId,
    pub room_id: RoomId,
    pub kind: RtpCodecKind,
    /// Base SSRCs seen for this track. Simulcast layers are accumulated here.
    pub ssrcs: Vec<u32>,
    /// All negotiated receive codecs for this track. The first codec is used as
    /// a default until the first RTP packet resolves the actual payload type.
    pub codecs: Vec<RTCRtpCodecParameters>,
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
    RemoveTrack {
        sender_id: RTCRtpSenderId,
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
        media_engine
            .register_default_codecs()
            .map_err(|e| anyhow!("failed to register default codecs: {:?}", e))?;
        let registry =
            register_default_interceptors(rtc_interceptor::Registry::new(), &mut media_engine)
                .map_err(|e| anyhow!("failed to register default interceptors: {:?}", e))?;

        // Forward incoming RTCP packets out of the interceptor chain so the SFU can
        // route PLI/FIR feedback to publishers. The default `NoopInterceptor`
        // terminates RTCP reads, so this layer clones them before they are consumed.
        let (rtcp_tx, rtcp_rx) = mpsc::channel::<Vec<Box<dyn rtcp::Packet>>>(32);
        let registry = registry.with(|inner| RtcpForwarder::new(inner, rtcp_tx));

        let mut setting_engine = SettingEngine::default();
        if let Ok(nat_ips) = std::env::var("SFU_NAT_1TO1_IPS") {
            let ips: Vec<String> = nat_ips
                .split(',')
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(String::from)
                .collect();
            if !ips.is_empty() {
                setting_engine.set_nat_1to1_ips(ips, RTCIceCandidateType::Host);
            }
        }

        let mut pc: RTCPeerConnection<_> = RTCPeerConnectionBuilder::new()
            .with_configuration(
                RTCConfigurationBuilder::new()
                    .with_ice_servers(rtc_ice_servers())
                    .build(),
            )
            .with_media_engine(media_engine)
            .with_interceptor_registry(registry)
            .with_setting_engine(setting_engine)
            .build()
            .map_err(|e| anyhow!("failed to build rtc peer: {:?}", e))?;

        let socket = UdpSocket::bind("0.0.0.0:0").await?;
        let socket_addr = socket.local_addr()?;
        let port = socket_addr.port();

        // Advertise a host candidate using the configured NAT IP (or loopback for local dev).
        let advertised_ip = std::env::var("SFU_NAT_1TO1_IPS")
            .ok()
            .and_then(|s| s.split(',').next().map(str::trim).map(String::from))
            .unwrap_or_else(|| "127.0.0.1".to_string());
        let local_ip: IpAddr = advertised_ip
            .parse()
            .unwrap_or_else(|_| IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1)));
        let local_addr = SocketAddr::new(local_ip, port);
        info!(
            "Rtc peer {} listening on {} (advertised {})",
            peer_id, socket_addr, local_addr
        );

        let mut candidate_init = RTCIceCandidateInit::default();
        candidate_init.candidate = format!(
            "candidate:1 1 udp 2130706431 {} {} typ host",
            local_addr.ip(),
            local_addr.port()
        );
        candidate_init.sdp_mid = Some("0".to_string());
        candidate_init.sdp_mline_index = Some(0);
        pc.add_local_candidate(candidate_init).map_err(|e| {
            anyhow!(
                "failed to add local host candidate for {}: {:?}",
                peer_id,
                e
            )
        })?;

        let (cmd_tx, cmd_rx) = mpsc::channel::<RtcCommand>(32);
        let (rtp_tx, rtp_rx) = mpsc::channel::<RtpForward>(crate::forward_queue_capacity());
        let metrics = {
            let s = state.read().await;
            (*s.rtc_metrics).clone()
        };
        let _ = spawn_network_task(
            peer_id.to_string(),
            pc,
            socket,
            local_addr,
            tx,
            cmd_rx,
            state,
            room_id,
            rtp_tx,
            rtp_rx,
            rtcp_rx,
            metrics,
        );

        Ok((Self { cmd_tx }, local_addr))
    }

    pub async fn handle_offer(&self, sdp: String, target: PeerId) -> Result<String> {
        let (tx, rx) = oneshot::channel();
        self.cmd_tx
            .send(RtcCommand::HandleOffer {
                sdp,
                target,
                respond: tx,
            })
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
            .send(RtcCommand::WriteReceiverRtcp {
                receiver_id,
                packets,
            })
            .await
            .map_err(|_| anyhow!("rtc network task gone"))
    }

    pub async fn remove_track(&self, sender_id: RTCRtpSenderId) -> Result<()> {
        self.cmd_tx
            .send(RtcCommand::RemoveTrack { sender_id })
            .await
            .map_err(|_| anyhow!("rtc network task gone"))
    }
}

fn is_feedback_packet(p: &dyn rtcp::Packet) -> bool {
    use rtcp::header::{PacketType, FORMAT_FIR, FORMAT_PLI, FORMAT_RRR, FORMAT_TLN};
    matches!(
        p.header().packet_type,
        PacketType::PayloadSpecificFeedback
            if p.header().count == FORMAT_PLI || p.header().count == FORMAT_FIR
    ) || matches!(
        p.header().packet_type,
        PacketType::TransportSpecificFeedback
            if p.header().count == FORMAT_TLN || p.header().count == FORMAT_RRR
    )
}

/// Process incoming RTCP packets captured by `RtcpForwarder` and forward
/// PLI/FIR feedback to the publisher of the track identified by the RTCP
/// `destination_ssrc`.
async fn handle_incoming_rtcp(
    peer_id: &PeerId,
    state: &SharedState,
    rtcp_packets: Vec<Box<dyn rtcp::Packet>>,
    metrics: &RtcMetrics,
) {
    let feedback: Vec<Box<dyn rtcp::Packet>> = rtcp_packets
        .into_iter()
        .filter(|p| is_feedback_packet(p.as_ref()))
        .collect();
    if feedback.is_empty() {
        return;
    }

    metrics.inc_feedback(feedback.len() as u64);

    let ssrc = feedback
        .iter()
        .find_map(|p| p.destination_ssrc().first().copied());
    let ssrc = match ssrc {
        Some(s) => s,
        None => return,
    };

    let track_info = {
        let s = state.read().await;
        s.rtc_tracks
            .values()
            .find(|t| t.ssrcs.contains(&ssrc))
            .map(|t| (t.publisher.clone(), t.receiver_id))
    };

    if let Some((publisher, Some(receiver_id))) = track_info {
        let publisher_peer = {
            let s = state.read().await;
            s.rtc_peers.get(&publisher).cloned()
        };
        if let Some(publisher_peer) = publisher_peer {
            info!(
                "Rtc {} forwarding {} RTCP feedback packet(s) for ssrc {} to publisher {}",
                peer_id,
                feedback.len(),
                ssrc,
                publisher
            );
            if let Err(e) = publisher_peer.write_receiver_rtcp(receiver_id, feedback).await {
                warn!(
                    "Rtc {} failed to forward RTCP for ssrc {} to publisher {}: {:?}",
                    peer_id, ssrc, publisher, e
                );
            }
        }
    }
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
    local_addr: SocketAddr,
    tx: mpsc::UnboundedSender<Event>,
    mut cmd_rx: mpsc::Receiver<RtcCommand>,
    state: SharedState,
    room_id: RoomId,
    rtp_tx: mpsc::Sender<RtpForward>,
    mut rtp_rx: mpsc::Receiver<RtpForward>,
    mut rtcp_rx: mpsc::Receiver<Vec<Box<dyn rtcp::Packet>>>,
    metrics: RtcMetrics,
) -> JoinHandle<()>
where
    I: Interceptor + Send + 'static,
{
    tokio::spawn(async move {
        let mut buf = vec![0u8; 2000];
        let default_timeout = Instant::now() + Duration::from_secs(86400);

        // Negotiation state tracked inside this task to avoid glare collisions.
        let mut pending_local_offer = false;
        let mut ignore_next_negotiation = false;

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
                            metrics.inc_ice_failure();
                            return;
                        }
                    }
                    RTCPeerConnectionEvent::OnConnectionStateChangeEvent(state) => {
                        info!("Rtc {} connection state: {:?}", peer_id, state);
                        if state == RTCPeerConnectionState::Failed {
                            metrics.inc_ice_failure();
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
                        if ignore_next_negotiation {
                            ignore_next_negotiation = false;
                            info!("Rtc {} ignoring queued negotiation needed", peer_id);
                            continue;
                        }
                        if pending_local_offer {
                            info!("Rtc {} already has a pending local offer", peer_id);
                            continue;
                        }
                        info!("Rtc {} negotiation needed", peer_id);
                        match pc.create_offer(None) {
                            Ok(offer) => {
                                if let Err(e) = pc.set_local_description(offer.clone()) {
                                    warn!("Rtc {} set_local_description failed: {:?}", peer_id, e);
                                } else {
                                    pending_local_offer = true;
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
                                let codecs =
                                    receiver.get_parameters().rtp_parameters.codecs.to_vec();
                                let codec = codecs.first().map(|c| c.rtp_codec.clone());
                                let writer = {
                                    let s = state.read().await;
                                    s.rooms.get(&room_id).and_then(|r| r.recording.clone()).map(
                                        |rec| {
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
                                        },
                                    )
                                };

                                let mut s = state.write().await;
                                s.rtc_tracks.insert(
                                    init.track_id.clone(),
                                    RtcRoomTrack {
                                        publisher: peer_id.clone(),
                                        room_id: room_id.clone(),
                                        kind,
                                        ssrcs: ssrcs.clone(),
                                        codecs: codecs.clone(),
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
                                                        subscriber: other_id.clone(),
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
                            let mut removals: Vec<(PeerId, RTCRtpSenderId)> = Vec::new();
                            {
                                let mut s = state.write().await;
                                if let Some(track) = s.rtc_tracks.remove(&track_id) {
                                    for fwd in &track.forwarders {
                                        removals.push((fwd.subscriber.clone(), fwd.sender_id));
                                    }
                                    if let Some(recorder) =
                                        s.rooms.get(&room_id).and_then(|r| r.recording.clone())
                                    {
                                        tokio::spawn(async move {
                                            recording::finish_track_writer(
                                                &recorder,
                                                &track.writer.unwrap_or_else(
                                                    recording::new_track_writer_slot,
                                                ),
                                            )
                                            .await;
                                        });
                                    }
                                }
                            }
                            for (sub_id, sender_id) in removals {
                                if let Some(sub_peer) = {
                                    let s = state.read().await;
                                    s.rtc_peers.get(&sub_id).cloned()
                                } {
                                    if let Err(e) = sub_peer.remove_track(sender_id).await {
                                        warn!("Rtc {} failed to remove sender {:?} from subscriber {}: {:?}", peer_id, sender_id, sub_id, e);
                                    }
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
                        let (forwarders, writer, fwd_codec) = {
                            let mut s = state.write().await;
                            if let Some(t) = s.rtc_tracks.get_mut(&track_id) {
                                let ssrc = rtp_packet.header.ssrc;
                                if !t.ssrcs.contains(&ssrc) {
                                    t.ssrcs.push(ssrc);
                                }
                                let payload_type = rtp_packet.header.payload_type;
                                if let Some(matched) =
                                    t.codecs.iter().find(|c| c.payload_type == payload_type)
                                {
                                    t.codec = Some(matched.rtp_codec.clone());
                                }
                                (t.forwarders.clone(), t.writer.clone(), t.codec.clone())
                            } else {
                                (Vec::new(), None, None)
                            }
                        };

                        let packet_bytes = rtp_packet.payload.len() as u64 + 12;
                        for fwd in &forwarders {
                            let fwd_msg = RtpForward {
                                sender_id: fwd.sender_id,
                                packet: rtp_packet.clone(),
                                codec: fwd_codec.clone(),
                            };
                            if fwd.tx.try_send(fwd_msg).is_ok() {
                                metrics.inc_forwarded(packet_bytes);
                            } else {
                                metrics.inc_dropped(1);
                                warn!(
                                    "Rtc {} forward queue full for track {} to {:?}",
                                    peer_id, track_id, fwd.sender_id
                                );
                            }
                        }

                        if let Some(ref writer) = writer {
                            let w_pkt = to_webrtc_packet(&rtp_packet);
                            let mut guard = writer.lock().await;
                            if let Some((ref mut w, _)) = guard.as_mut() {
                                w.write_rtp(&w_pkt);
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
                            if let (Some(receiver_id), Some(publisher_peer)) =
                                (track.receiver_id, {
                                    let s = state.read().await;
                                    s.rtc_peers.get(&track.publisher).cloned()
                                })
                            {
                                let feedback: Vec<Box<dyn rtcp::Packet>> = rtcp_packets
                                    .iter()
                                    .filter(|p| is_feedback_packet(p.as_ref()))
                                    .cloned()
                                    .collect();
                                if !feedback.is_empty() {
                                    metrics.inc_feedback(feedback.len() as u64);
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
                            let answer_sdp = handle_offer_sdp(
                                &mut pc,
                                &sdp,
                                &state,
                                &room_id,
                                &peer_id,
                                &rtp_tx,
                                &mut pending_local_offer,
                                &mut ignore_next_negotiation,
                            )
                            .await;
                            if let Err(ref e) = answer_sdp {
                                warn!("Rtc {} handle offer failed: {:?}", peer_id, e);
                            }
                            let _ = respond.send(answer_sdp);
                        }
                        Some(RtcCommand::HandleAnswer { sdp, target: _ }) => {
                            if let Err(e) = handle_answer_sdp(&mut pc, &sdp, &mut ignore_next_negotiation) {
                                warn!("Rtc {} handle answer failed: {:?}", peer_id, e);
                            } else {
                                pending_local_offer = false;
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
                        Some(RtcCommand::RemoveTrack { sender_id }) => {
                            if let Err(e) = pc.remove_track(sender_id) {
                                warn!("Rtc {} remove_track {:?} failed: {:?}", peer_id, sender_id, e);
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
                            let ssrc = fwd.packet.header.ssrc;
                            if sender.track().ssrcs().next().is_none() {
                                if let Err(e) = update_sender_ssrc(&mut sender, &room_id, &peer_id, ssrc, fwd.codec.clone()) {
                                    warn!("Rtc {} failed to set sender {:?} ssrc to {}: {:?}", peer_id, fwd.sender_id, ssrc, e);
                                    continue;
                                }
                                info!("Rtc {} set sender {:?} ssrc to {}", peer_id, fwd.sender_id, ssrc);
                            }
                            if let Err(e) = sender.write_rtp(fwd.packet) {
                                warn!("Rtc {} write_rtp failed for sender {:?}: {:?}", peer_id, fwd.sender_id, e);
                            }
                        }
                    }
                }
                rtcp = rtcp_rx.recv() => {
                    if let Some(rtcp_packets) = rtcp {
                        handle_incoming_rtcp(&peer_id, &state, rtcp_packets, &metrics).await;
                    }
                }
            }
        }
    })
}

fn generate_rtx_fec_ssrcs(base_ssrc: u32) -> (u32, u32) {
    let rtx = loop {
        let s = rand::random::<u32>();
        if s != 0 && s != base_ssrc {
            break s;
        }
    };
    let fec = loop {
        let s = rand::random::<u32>();
        if s != 0 && s != base_ssrc && s != rtx {
            break s;
        }
    };
    (rtx, fec)
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
    desired_codec: Option<RTCRtpCodec>,
) -> Result<RTCRtpSenderId> {
    let desired = desired_codec.unwrap_or_else(|| default_codec(kind));
    let codings: Vec<RTCRtpEncodingParameters> = if ssrcs.is_empty() {
        vec![RTCRtpEncodingParameters {
            rtp_coding_parameters: RTCRtpCodingParameters {
                rid: String::new(),
                ssrc: None,
                rtx: None,
                fec: None,
            },
            active: true,
            codec: desired.clone(),
            max_bitrate: 0,
            max_framerate: None,
            scale_resolution_down_by: None,
        }]
    } else {
        ssrcs
            .iter()
            .map(|ssrc| {
                let (rtx_ssrc, fec_ssrc) = generate_rtx_fec_ssrcs(*ssrc);
                RTCRtpEncodingParameters {
                    rtp_coding_parameters: RTCRtpCodingParameters {
                        rid: String::new(),
                        ssrc: Some(*ssrc),
                        rtx: Some(RTCRtpRtxParameters { ssrc: rtx_ssrc }),
                        fec: Some(RTCRtpFecParameters { ssrc: fec_ssrc }),
                    },
                    active: true,
                    codec: desired.clone(),
                    max_bitrate: 0,
                    max_framerate: None,
                    scale_resolution_down_by: None,
                }
            })
            .collect()
    };

    let track = MediaStreamTrack::new(room_id.clone(), track_id, peer_id.clone(), kind, codings);

    let sender_id = pc
        .add_track(track)
        .map_err(|e| anyhow!("add_track failed: {:?}", e))?;

    // Align the sender's encoding codec with the codecs this peer actually
    // negotiated. This avoids payload-type mismatches when forwarding.
    if let Some(mut sender) = pc.rtp_sender(sender_id) {
        let mut params = sender.get_parameters().clone();
        let codec = pick_codec(kind, Some(&desired), &params.rtp_parameters.codecs);
        for encoding in &mut params.encodings {
            encoding.codec = codec.clone();
        }
        if let Err(e) = sender.set_parameters(params, None) {
            warn!("Rtc {} failed to set sender parameters: {:?}", peer_id, e);
        }
    }

    Ok(sender_id)
}

fn pick_codec(
    kind: RtpCodecKind,
    desired: Option<&RTCRtpCodec>,
    available: &[RTCRtpCodecParameters],
) -> RTCRtpCodec {
    if let Some(desired) = desired.filter(|c| !c.mime_type.is_empty()) {
        // Exact MIME + fmtp match.
        if let Some(matched) = available.iter().find(|c| {
            c.rtp_codec.mime_type.to_uppercase() == desired.mime_type.to_uppercase()
                && (desired.sdp_fmtp_line.is_empty()
                    || c.rtp_codec.sdp_fmtp_line.is_empty()
                    || c.rtp_codec.sdp_fmtp_line == desired.sdp_fmtp_line)
        }) {
            return matched.rtp_codec.clone();
        }
        // MIME-only match.
        if let Some(matched) = available
            .iter()
            .find(|c| c.rtp_codec.mime_type.to_uppercase() == desired.mime_type.to_uppercase())
        {
            return matched.rtp_codec.clone();
        }
    }

    // Fall back to the first codec that matches the track kind.
    let kind_prefix = kind.to_string().to_uppercase();
    if let Some(matched) = available.iter().find(|c| {
        c.rtp_codec
            .mime_type
            .to_uppercase()
            .starts_with(&kind_prefix)
    }) {
        return matched.rtp_codec.clone();
    }

    default_codec(kind)
}

fn update_sender_ssrc<'a, I: Interceptor>(
    sender: &mut RTCRtpSender<'a, I>,
    room_id: &RoomId,
    peer_id: &PeerId,
    ssrc: u32,
    desired_codec: Option<RTCRtpCodec>,
) -> Result<()> {
    let track = sender.track().clone();
    let mut params = sender.get_parameters().clone();

    // Pick a codec that the sender actually negotiated so payload-type
    // mismatches are handled safely.
    let codec = pick_codec(
        track.kind(),
        desired_codec.as_ref(),
        &params.rtp_parameters.codecs,
    );

    if let Some(encoding) = params.encodings.iter_mut().find(|e| {
        e.rtp_coding_parameters.ssrc == Some(ssrc) || e.rtp_coding_parameters.ssrc.is_none()
    }) {
        if encoding.rtp_coding_parameters.ssrc.is_none() {
            let (rtx_ssrc, fec_ssrc) = generate_rtx_fec_ssrcs(ssrc);
            encoding.rtp_coding_parameters.ssrc = Some(ssrc);
            encoding.rtp_coding_parameters.rtx = Some(RTCRtpRtxParameters { ssrc: rtx_ssrc });
            encoding.rtp_coding_parameters.fec = Some(RTCRtpFecParameters { ssrc: fec_ssrc });
        }
        encoding.codec = codec.clone();
    } else if let Some(template) = params.encodings.first().cloned() {
        let mut new_encoding = template;
        let (rtx_ssrc, fec_ssrc) = generate_rtx_fec_ssrcs(ssrc);
        new_encoding.rtp_coding_parameters.ssrc = Some(ssrc);
        new_encoding.rtp_coding_parameters.rtx = Some(RTCRtpRtxParameters { ssrc: rtx_ssrc });
        new_encoding.rtp_coding_parameters.fec = Some(RTCRtpFecParameters { ssrc: fec_ssrc });
        new_encoding.codec = codec.clone();
        params.encodings.push(new_encoding);
    } else {
        let (rtx_ssrc, fec_ssrc) = generate_rtx_fec_ssrcs(ssrc);
        params.encodings.push(RTCRtpEncodingParameters {
            rtp_coding_parameters: RTCRtpCodingParameters {
                rid: String::new(),
                ssrc: Some(ssrc),
                rtx: Some(RTCRtpRtxParameters { ssrc: rtx_ssrc }),
                fec: Some(RTCRtpFecParameters { ssrc: fec_ssrc }),
            },
            active: true,
            codec,
            max_bitrate: 0,
            max_framerate: None,
            scale_resolution_down_by: None,
        });
    }

    let new_track = MediaStreamTrack::new(
        room_id.clone(),
        track.track_id().to_string(),
        peer_id.clone(),
        track.kind(),
        params.encodings.clone(),
    );
    sender
        .replace_track(new_track)
        .map_err(|e| anyhow!("replace_track failed: {:?}", e))?;
    sender
        .set_parameters(params, None)
        .map_err(|e| anyhow!("set_parameters failed: {:?}", e))?;
    Ok(())
}

async fn handle_offer_sdp<I: Interceptor>(
    pc: &mut RTCPeerConnection<I>,
    sdp: &str,
    state: &SharedState,
    room_id: &RoomId,
    peer_id: &PeerId,
    rtp_tx: &mpsc::Sender<RtpForward>,
    pending_local_offer: &mut bool,
    ignore_next_negotiation: &mut bool,
) -> Result<String> {
    if *pending_local_offer {
        let rollback = RTCSessionDescription::rollback(None)
            .map_err(|e| anyhow!("failed to create rollback description: {:?}", e))?;
        pc.set_local_description(rollback)
            .map_err(|e| anyhow!("failed to rollback pending local offer: {:?}", e))?;
        *pending_local_offer = false;
        info!(
            "Rtc {} rolled back pending local offer to accept remote offer",
            peer_id
        );
    }

    let offer = RTCSessionDescription::offer(sdp.to_string())
        .map_err(|e| anyhow!("failed to parse offer: {:?}", e))?;
    pc.set_remote_description(offer)
        .map_err(|e| anyhow!("set_remote_description failed: {:?}", e))?;

    // Subscribe this peer to every track already published in the room.
    let existing_tracks: Vec<(String, RtpCodecKind, Vec<u32>, Option<RTCRtpCodec>)> = {
        let s = state.read().await;
        s.rtc_tracks
            .iter()
            .filter(|(_, t)| t.room_id == *room_id && t.publisher != *peer_id)
            .map(|(id, t)| (id.clone(), t.kind, t.ssrcs.clone(), t.codec.clone()))
            .collect()
    };

    for (track_id, kind, ssrcs, codec) in existing_tracks {
        match add_local_track(pc, room_id, peer_id, track_id.clone(), kind, ssrcs, codec) {
            Ok(sender_id) => {
                let mut s = state.write().await;
                if let Some(room_track) = s.rtc_tracks.get_mut(&track_id) {
                    room_track.forwarders.retain(|f| f.subscriber != *peer_id);
                    room_track.forwarders.push(TrackForwarder {
                        subscriber: peer_id.clone(),
                        sender_id,
                        tx: rtp_tx.clone(),
                    });
                }
            }
            Err(e) => {
                warn!(
                    "Rtc {} could not subscribe to existing track {}: {:?}",
                    peer_id, track_id, e
                );
            }
        }
    }

    let answer = pc
        .create_answer(None)
        .map_err(|e| anyhow!("create_answer failed: {:?}", e))?;
    pc.set_local_description(answer.clone())
        .map_err(|e| anyhow!("set_local_description failed: {:?}", e))?;

    *pending_local_offer = false;
    // Suppress any spurious OnNegotiationNeeded event produced by
    // set_local_description(answer); the answer already reflects the current
    // transceivers.
    *ignore_next_negotiation = true;
    Ok(answer.sdp)
}

fn handle_answer_sdp<I: Interceptor>(
    pc: &mut RTCPeerConnection<I>,
    sdp: &str,
    ignore_next_negotiation: &mut bool,
) -> Result<()> {
    let answer = RTCSessionDescription::answer(sdp.to_string())
        .map_err(|e| anyhow!("failed to parse answer: {:?}", e))?;
    pc.set_remote_description(answer)
        .map_err(|e| anyhow!("set_remote_description failed: {:?}", e))?;
    // set_remote_description(answer) can emit OnNegotiationNeeded; the answer
    // is already applied, so ignore one event.
    *ignore_next_negotiation = true;
    Ok(())
}

/// Remove an `rtc` peer's tracks/forwarders from shared state and ask subscriber
/// peers to drop the corresponding senders. This is safe to call from any leave
/// or connection-drop path because `rtc_peers` removal is idempotent.
pub async fn cleanup_rtc_peer(peer_id: &str, room_id: &RoomId, state: &SharedState) {
    let mut to_finalize: Vec<(
        std::sync::Arc<recording::Recorder>,
        recording::SharedTrackWriter,
    )> = Vec::new();
    let mut removals: Vec<(PeerId, RTCRtpSenderId)> = Vec::new();
    {
        let mut s = state.write().await;
        s.rtc_peers.remove(peer_id);

        // Drop the departing peer as a subscriber from all tracks.
        for track in s.rtc_tracks.values_mut() {
            if track.room_id == *room_id {
                track.forwarders.retain(|f| f.subscriber != peer_id);
            }
        }

        let rec = s.rooms.get(room_id).and_then(|r| r.recording.clone());

        // Remove tracks published by this peer and remember the sender IDs used
        // by remaining subscribers so their peer connections can drop the remote tracks.
        s.rtc_tracks.retain(|_, track| {
            if track.publisher == peer_id && track.room_id == *room_id {
                if let (Some(writer), Some(rec)) = (track.writer.clone(), rec.as_ref()) {
                    to_finalize.push((rec.clone(), writer));
                }
                for fwd in &track.forwarders {
                    removals.push((fwd.subscriber.clone(), fwd.sender_id));
                }
                false
            } else {
                true
            }
        });
    }

    for (rec, writer) in to_finalize {
        tokio::spawn(async move {
            recording::finish_track_writer(&rec, &writer).await;
        });
    }

    for (subscriber_id, sender_id) in removals {
        if let Some(sub_peer) = {
            let s = state.read().await;
            s.rtc_peers.get(&subscriber_id).cloned()
        } {
            if let Err(e) = sub_peer.remove_track(sender_id).await {
                warn!(
                    "Rtc failed to remove track sender from subscriber {}: {:?}",
                    subscriber_id, e
                );
            }
        }
    }
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
            // Remove any previous rtc peer (and its tracks/forwarders) for this
            // connection.
            {
                let mut s = state.write().await;
                s.rtc_peers.remove(peer_id);
            }
            if let Some(previous_room) = crate::leave_room(peer_id, state).await {
                cleanup_rtc_peer(peer_id, &previous_room, state).await;
            }
            verify_sfu_token(&token, &room_id, &user_id, token_secret)?;
            validate_display_name(&display_name)?;

            let tx = {
                let s = state.write().await;
                if !s.rooms.contains_key(&room_id) && s.rooms.len() >= crate::max_rooms() {
                    return Err(anyhow!("global room limit reached"));
                }
                let participant_count = s
                    .rooms
                    .get(&room_id)
                    .map(|r| r.participants.len())
                    .unwrap_or(0);
                if participant_count >= crate::max_participants_per_room() {
                    return Err(anyhow!("room participant limit reached"));
                }
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

            // Existing published tracks are subscribed to when the peer sends its
            // offer and the SFU answers, so no action is needed here.

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
            let room_id = crate::leave_room(peer_id, state).await;
            if let Some(room_id) = room_id {
                cleanup_rtc_peer(peer_id, &room_id, state).await;
            }
        }
    }

    Ok(())
}
