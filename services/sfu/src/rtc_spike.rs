//! Phase 1 spike for the `webrtc` → `rtc` migration.
//!
//! This module is compiled only when the `rtc` Cargo feature is enabled.
//! It will hold the `Rtc` peer-connection and RTP forwarding prototype.

use anyhow::{anyhow, Result};
use bytes::BytesMut;
use rtc::peer_connection::configuration::{
    media_engine::MediaEngine, RTCConfigurationBuilder, RTCIceServer,
};
use rtc::peer_connection::event::{RTCPeerConnectionEvent, RTCTrackEvent};
use rtc::peer_connection::message::RTCMessage;
use rtc::peer_connection::state::{RTCIceConnectionState, RTCPeerConnectionState};
use rtc::peer_connection::RTCPeerConnectionBuilder;
use rtc::sansio::Protocol;
use rtc::shared::{TaggedBytesMut, TransportContext, TransportProtocol};
use std::net::SocketAddr;
use std::time::{Duration, Instant};
use tokio::net::UdpSocket;
use tracing::{info, warn};

/// Run a minimal `rtc` peer on a UDP socket.
///
/// This is a skeleton. It only brings up the event loop and logs state changes.
/// In a full migration this will be wired to the WebSocket signaling path.
pub async fn run_rtc_peer(local_addr: SocketAddr) -> Result<()> {
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

    let mut pc = pc;
    let socket = UdpSocket::bind(local_addr).await?;
    let local_addr = socket.local_addr()?;
    info!("Rtc peer listening on {}", local_addr);

    let mut buf = vec![0u8; 2000];
    let default_timeout = Instant::now() + Duration::from_secs(86400);

    loop {
        while let Some(msg) = pc.poll_write() {
            if let Err(e) = socket.send_to(&msg.message, msg.transport.peer_addr).await {
                warn!("failed to send rtc packet: {}", e);
            }
        }

        while let Some(event) = pc.poll_event() {
            match event {
                RTCPeerConnectionEvent::OnIceConnectionStateChangeEvent(state) => {
                    info!("Rtc ICE state: {:?}", state);
                    if state == RTCIceConnectionState::Failed {
                        break;
                    }
                }
                RTCPeerConnectionEvent::OnConnectionStateChangeEvent(state) => {
                    info!("Rtc connection state: {:?}", state);
                    if state == RTCPeerConnectionState::Failed {
                        return Ok(());
                    }
                }
                RTCPeerConnectionEvent::OnTrack(track_event) => match track_event {
                    RTCTrackEvent::OnOpen(init) => {
                        info!(
                            "Rtc track opened: track_id={}, receiver_id={:?}",
                            init.track_id, init.receiver_id
                        );
                    }
                    RTCTrackEvent::OnClose(track_id) => {
                        info!("Rtc track closed: {}", track_id);
                    }
                    _ => {}
                },
                _ => {}
            }
        }

        while let Some(message) = pc.poll_read() {
            match message {
                RTCMessage::RtpPacket(track_id, rtp_packet) => {
                    info!(
                        "Rtc RTP on track {}: {} bytes",
                        track_id,
                        rtp_packet.payload.len()
                    );
                }
                RTCMessage::RtcpPacket(receiver_id, rtcp_packets) => {
                    info!(
                        "Rtc RTCP on receiver {:?}: {} packets",
                        receiver_id,
                        rtcp_packets.len()
                    );
                }
                RTCMessage::DataChannelMessage(channel_id, message) => {
                    info!(
                        "Rtc data channel message on {:?}: {} bytes",
                        channel_id,
                        message.data.len()
                    );
                }
            }
        }

        let timeout = pc.poll_timeout().unwrap_or(default_timeout);
        let delay = timeout.saturating_duration_since(Instant::now());

        if delay.is_zero() {
            pc.handle_timeout(Instant::now())
                .map_err(|e| anyhow!("handle_timeout failed: {:?}", e))?;
            continue;
        }

        tokio::select! {
            _ = tokio::time::sleep(delay) => {
                pc.handle_timeout(Instant::now())
                    .map_err(|e| anyhow!("handle_timeout failed: {:?}", e))?;
            }
            result = socket.recv_from(&mut buf) => {
                match result {
                    Ok((n, peer_addr)) => {
                        pc.handle_read(TaggedBytesMut {
                            now: Instant::now(),
                            transport: TransportContext {
                                local_addr,
                                peer_addr,
                                ecn: None,
                                transport_protocol: TransportProtocol::UDP,
                            },
                            message: BytesMut::from(&buf[..n]),
                        })
                        .map_err(|e| anyhow!("handle_read failed: {:?}", e))?;
                    }
                    Err(e) => warn!("UDP recv error: {}", e),
                }
            }
        }
    }
}
