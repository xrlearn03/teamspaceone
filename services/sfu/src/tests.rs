//! SFU unit and integration tests.

use std::sync::Arc;
use tokio::sync::mpsc;

use crate::{cleanup_peer, leave_room, verify_sfu_token, Event, Peer, Room, SharedState, State};

#[cfg(feature = "rtc")]
use crate::recording::{self, Recorder};
#[cfg(feature = "rtc")]
use crate::Signal;
#[cfg(feature = "rtc")]
use crate::rtc_peer::{RtcRoomTrack, TrackForwarder};
#[cfg(feature = "rtc")]
use rtc::rtp_transceiver::rtp_sender::{RTCRtpCodec, RtpCodecKind};
#[cfg(feature = "rtc")]
use rtc::rtp_transceiver::RTCRtpSenderId;

fn test_state() -> SharedState {
    let api = Arc::new(webrtc::api::APIBuilder::new().build());
    Arc::new(tokio::sync::RwLock::new(State::new(api)))
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = Vec::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 0x0f) as usize] as char);
    }
    out.into_iter().collect()
}

fn make_sfu_token(secret: &str, room: &str, user: Option<&str>, exp: u64) -> String {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    let room_b64 = URL_SAFE_NO_PAD.encode(room);
    let user_b64 = URL_SAFE_NO_PAD.encode(user.unwrap_or(""));
    let exp_str = exp.to_string();
    let base = format!("{}.{}.{}", room_b64, user_b64, exp_str);
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).unwrap();
    mac.update(base.as_bytes());
    let sig = hex_encode(&mac.finalize().into_bytes());
    format!("{}.{}.{}.{}", room_b64, user_b64, exp_str, sig)
}

#[tokio::test]
async fn test_verify_sfu_token_valid() {
    let token = make_sfu_token("dev-secret", "room-1", Some("user-1"), u64::MAX);
    assert!(
        verify_sfu_token(&token, "room-1", &Some("user-1".to_string()), "dev-secret").is_ok()
    );
    assert!(
        verify_sfu_token(&token, "room-2", &Some("user-1".to_string()), "dev-secret").is_err()
    );
    assert!(
        verify_sfu_token(&token, "room-1", &Some("other".to_string()), "dev-secret").is_err()
    );
    assert!(verify_sfu_token("not-a-token", "room-1", &None, "dev-secret").is_err());
}

#[tokio::test]
async fn test_leave_room_and_cleanup() {
    let state = test_state();
    let (tx, _rx) = mpsc::unbounded_channel::<Event>();
    let peer = Peer {
        display_name: "Alice".to_string(),
        user_id: Some("u1".to_string()),
        room_id: Some("room-1".to_string()),
        tx,
        pc: None,
    };

    let peer_clone = peer.clone();
    {
        let mut s = state.write().await;
        s.peers.insert("p1".to_string(), peer);
        s.rooms.insert(
            "room-1".to_string(),
            Room {
                participants: [("p1".to_string(), peer_clone)].into_iter().collect(),
                tracks: Vec::new(),
                recording: None,
            },
        );
    }

    let room_id = leave_room("p1", &state).await;
    assert_eq!(room_id.as_deref(), Some("room-1"));

    {
        let s = state.read().await;
        assert!(s.peers.contains_key("p1"));
        assert!(s.rooms.get("room-1").is_none());
    }

    cleanup_peer("p1", &state).await;

    {
        let s = state.read().await;
        assert!(!s.peers.contains_key("p1"));
        assert!(s.rooms.get("room-1").is_none());
    }
}

#[cfg(feature = "rtc")]
#[tokio::test]
async fn test_rtc_cleanup_peer_removes_tracks() {
    let state = test_state();
    let (tx, _rx) = mpsc::unbounded_channel::<Event>();
    let peer = Peer {
        display_name: "Alice".to_string(),
        user_id: Some("u1".to_string()),
        room_id: Some("room-1".to_string()),
        tx,
        pc: None,
    };

    let peer_clone = peer.clone();
    {
        let mut s = state.write().await;
        s.peers.insert("p1".to_string(), peer);
        s.rooms.insert(
            "room-1".to_string(),
            Room {
                participants: [("p1".to_string(), peer_clone)].into_iter().collect(),
                tracks: Vec::new(),
                recording: None,
            },
        );
    }

    let (fwd_tx, _fwd_rx) = tokio::sync::mpsc::channel::<crate::rtc_peer::RtpForward>(16);
    let track = RtcRoomTrack {
        publisher: "p1".to_string(),
        room_id: "room-1".to_string(),
        kind: RtpCodecKind::Video,
        ssrcs: vec![1234],
        rid_to_ssrc: std::collections::HashMap::new(),
        codecs: vec![],
        codec: None,
        receiver_id: None,
        forwarders: vec![TrackForwarder {
            subscriber: "p2".to_string(),
            sender_id: RTCRtpSenderId::default(),
            tx: fwd_tx,
            selected_rid: None,
        }],
        writer: None,
    };
    {
        let mut s = state.write().await;
        s.rtc_tracks.insert("t1".to_string(), track);
    }

    cleanup_peer("p1", &state).await;

    let s = state.read().await;
    assert!(s.rtc_tracks.is_empty());
    assert!(!s.peers.contains_key("p1"));
}

#[cfg(feature = "rtc")]
#[tokio::test]
async fn test_layer_signal_selects_rid() {
    let state = test_state();
    let (fwd_tx, _fwd_rx) = tokio::sync::mpsc::channel::<crate::rtc_peer::RtpForward>(16);
    let track = RtcRoomTrack {
        publisher: "pub1".to_string(),
        room_id: "room-1".to_string(),
        kind: RtpCodecKind::Video,
        ssrcs: vec![111, 222],
        rid_to_ssrc: [("f".to_string(), 111), ("h".to_string(), 222)]
            .into_iter()
            .collect(),
        codecs: vec![],
        codec: None,
        receiver_id: None,
        forwarders: vec![TrackForwarder {
            subscriber: "p1".to_string(),
            sender_id: RTCRtpSenderId::default(),
            tx: fwd_tx,
            selected_rid: None,
        }],
        writer: None,
    };
    {
        let mut s = state.write().await;
        s.rtc_tracks.insert("t1".to_string(), track);
    }

    crate::process_signal(
        "p1",
        Signal::Layer {
            track_id: "t1".to_string(),
            rid: "h".to_string(),
        },
        &state,
        "secret",
    )
    .await
    .unwrap();

    let s = state.read().await;
    let fwd = s
        .rtc_tracks
        .get("t1")
        .unwrap()
        .forwarders
        .first()
        .unwrap();
    assert_eq!(fwd.selected_rid.as_deref(), Some("h"));
}

#[cfg(feature = "rtc")]
#[tokio::test]
async fn test_recording_tee_writes_vp8_file() {
    let dir = std::env::temp_dir().join(format!("sfu_rec_test_{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();

    let rec = Arc::new(Recorder {
        dir: dir.clone(),
        organisation_id: "org1".to_string(),
        actor_id: "actor1".to_string(),
        finished_files: tokio::sync::Mutex::new(Vec::new()),
    });

    let slot = recording::new_track_writer_slot();
    let codec = RTCRtpCodec {
        mime_type: "video/VP8".to_string(),
        clock_rate: 90000,
        channels: 0,
        sdp_fmtp_line: "".to_string(),
        rtcp_feedback: vec![],
    };
    recording::attach_rtc_track_writer(&rec, &slot, "room1", "pub1", "track1", Some(&codec));

    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(2);
    while slot.lock().await.is_none() {
        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        assert!(tokio::time::Instant::now() < deadline, "writer not attached");
    }

    let pkt = webrtc::rtp::packet::Packet {
        header: webrtc::rtp::header::Header {
            ssrc: 1234,
            payload_type: 96,
            ..Default::default()
        },
        payload: bytes::Bytes::from_static(b"vp8data"),
    };

    {
        let mut guard = slot.lock().await;
        let (writer, path) = guard.as_mut().unwrap();
        assert_eq!(path.extension().and_then(|e| e.to_str()), Some("ivf"));
        writer.write_rtp(&pkt);
    }

    recording::finish_track_writer(&rec, &slot).await;
    let paths = recording::collect_recording_files(&rec, Vec::new()).await;
    assert!(!paths.is_empty());

    let _ = std::fs::remove_dir_all(&dir);
}
