//! `webrtc` → `rtc` migration: `RTCPeerConnection` peer wrapper and signal handler.
//!
//! This module is compiled only with the `rtc` feature. It is a first pass at
//! replacing the `webrtc`-based `process_signal` for join/offer/answer/ice.

use anyhow::{anyhow, Result};
use bytes::BytesMut;
use rtc::peer_connection::configuration::{
    media_engine::MediaEngine, RTCConfigurationBuilder, RTCIceServer,
};
use rtc::peer_connection::event::{RTCPeerConnectionEvent, RTCTrackEvent};
use rtc::peer_connection::message::RTCMessage;
use rtc::peer_connection::sdp::RTCSessionDescription;
use rtc::peer_connection::state::{
    RTCIceConnectionState, RTCIceGatheringState, RTCPeerConnectionState,
};
use rtc::peer_connection::transport::RTCIceCandidateInit;
use rtc::peer_connection::{RTCPeerConnection, RTCPeerConnectionBuilder};
use rtc::sansio::Protocol;
use rtc::shared::{TaggedBytesMut, TransportContext, TransportProtocol};
use std::net::SocketAddr;
use std::time::{Duration, Instant};
use tokio::net::UdpSocket;
use tokio::sync::{mpsc, oneshot};
use tokio::task::JoinHandle;
use tracing::{info, warn};

use crate::{validate_display_name, verify_sfu_token, Event, PeerId, RoomId, SharedState, Signal};

/// Alias for the default `RTCPeerConnection` (NoopInterceptor) used in this spike.
type RtcPeerConnection = RTCPeerConnection<rtc_interceptor::NoopInterceptor>;

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
    Close,
}

/// Handle to an `rtc` peer. The actual `RTCPeerConnection` and UDP socket live
/// inside a dedicated spawned task.
#[derive(Clone)]
pub struct RtcPeer {
    cmd_tx: mpsc::Sender<RtcCommand>,
    local_addr: SocketAddr,
}

impl RtcPeer {
    pub async fn new(
        peer_id: &str,
        tx: mpsc::UnboundedSender<Event>,
    ) -> Result<(Self, SocketAddr)> {
        let mut media_engine = MediaEngine::default();
        media_engine
            .register_default_codecs()
            .map_err(|e| anyhow!("failed to register default codecs: {:?}", e))?;

        let pc = RTCPeerConnectionBuilder::new()
            .with_configuration(
                RTCConfigurationBuilder::new()
                    .with_ice_servers(vec![RTCIceServer {
                        urls: vec!["stun:stun.l.google.com:19302".to_string()],
                        ..Default::default()
                    }])
                    .build(),
            )
            .with_media_engine(media_engine)
            .build()
            .map_err(|e| anyhow!("failed to build rtc peer: {:?}", e))?;

        let socket = UdpSocket::bind("0.0.0.0:0").await?;
        let local_addr = socket.local_addr()?;
        info!("Rtc peer {} listening on {}", peer_id, local_addr);

        let (cmd_tx, cmd_rx) = mpsc::channel::<RtcCommand>(32);
        let _ = spawn_network_task(peer_id.to_string(), pc, socket, tx, cmd_rx);

        Ok((Self { cmd_tx, local_addr }, local_addr))
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
}

fn spawn_network_task(
    peer_id: PeerId,
    mut pc: RtcPeerConnection,
    socket: UdpSocket,
    tx: mpsc::UnboundedSender<Event>,
    mut cmd_rx: mpsc::Receiver<RtcCommand>,
) -> JoinHandle<()> {
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
                            break;
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
                    }
                    RTCPeerConnectionEvent::OnTrack(track_event) => match track_event {
                        RTCTrackEvent::OnOpen(init) => {
                            info!(
                                "Rtc {} track opened: track_id={}, receiver_id={:?}",
                                peer_id, init.track_id, init.receiver_id
                            );
                        }
                        RTCTrackEvent::OnClose(track_id) => {
                            info!("Rtc {} track closed: {}", peer_id, track_id);
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
                        info!(
                            "Rtc {} RTP on track {}: {} bytes",
                            peer_id,
                            track_id,
                            rtp_packet.payload.len()
                        );
                    }
                    RTCMessage::RtcpPacket(receiver_id, rtcp_packets) => {
                        info!(
                            "Rtc {} RTCP on receiver {:?}: {} packets",
                            peer_id,
                            receiver_id,
                            rtcp_packets.len()
                        );
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
                        Some(RtcCommand::Close) | None => {
                            info!("Rtc {} closing", peer_id);
                            return;
                        }
                    }
                }
            }
        }
    })
}

fn handle_offer_sdp(pc: &mut RtcPeerConnection, sdp: &str) -> Result<String> {
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

fn handle_answer_sdp(pc: &mut RtcPeerConnection, sdp: &str) -> Result<()> {
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

            let (rtc_peer, _local_addr) = RtcPeer::new(peer_id, tx.clone()).await?;

            {
                let mut s = state.write().await;
                if let Some(peer) = s.peers.get_mut(peer_id) {
                    peer.display_name = display_name.clone();
                    peer.user_id = user_id.clone();
                    peer.room_id = Some(room_id.clone());
                }
                s.rtc_peers.insert(peer_id.to_string(), rtc_peer);
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
