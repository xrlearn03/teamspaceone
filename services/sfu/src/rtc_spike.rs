//! Phase 1 spike for the `webrtc` → `rtc` migration.
//!
//! This module is compiled only when the `rtc` Cargo feature is enabled.
//! It will hold the `Rtc` peer-connection and RTP forwarding prototype.

use anyhow::{anyhow, Result};
use rtc::peer_connection::configuration::{RTCConfigurationBuilder, RTCIceServer};
use rtc::peer_connection::RTCPeerConnectionBuilder;

/// Create a minimal `rtc` `RTCPeerConnection` with a STUN server.
pub fn create_peer() -> Result<()> {
    let config = RTCConfigurationBuilder::new()
        .with_ice_servers(vec![RTCIceServer {
            urls: vec!["stun:stun.l.google.com:19302".to_string()],
            ..Default::default()
        }])
        .build();

    let _pc = RTCPeerConnectionBuilder::new()
        .with_configuration(config)
        .build()
        .map_err(|e| anyhow!("failed to build rtc peer: {:?}", e))?;

    Ok(())
}
