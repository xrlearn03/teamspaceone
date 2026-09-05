# Teamspace One Native SFU

This is the start of the native Selective Forwarding Unit (SFU) that will replace LiveKit for real-time meetings. It is a separate Rust service in the monorepo.

## Architecture

- **Signaling**: WebSocket server on `127.0.0.1:8443` for offer/answer/ICE exchange.
- **Media engine**: `webrtc-rs` for managing `RTCPeerConnection`s in Rust.
- **SFU logic**: One publisher stream is received and selectively forwarded to each subscriber peer.
- **Transport**: UDP/RTP between the Tauri app and the SFU. The app sends native camera/mic frames from `nokhwa`/`cpal` instead of browser `getUserMedia`.

## Phases

### Phase 1 — Placeholder

Accepts WebSocket signaling messages and echoes them back. It does not yet create WebRTC peer connections or route media.

### Phase 2 — Room signaling

The server now manages rooms and participants in memory.

### Phase 3 — WebRTC peer connections (current)

Each participant now gets their own `RTCPeerConnection` to the SFU on `join`.

1. Server creates an `RTCPeerConnection` and adds `recvonly` audio and video transceivers.
2. Server generates an offer, sets it as the local description, and sends `{"type": "offer", "from": "sfu", "sdp": "..."}` to the client.
3. Client creates an answer and sends `{"type": "answer", "target": "sfu", "sdp": "..."}`. The SFU sets the remote description.
4. Trickle ICE: the SFU forwards its local candidates as `{"type": "ice", "from": "sfu", ...}` and the client sends `{"type": "ice", "target": "sfu", ...}`.
5. When tracks arrive, `on_track` is fired and logged. Actual forwarding to other room participants is the next step.

Client messages:

```json
{ "type": "join", "room_id": "room-123", "display_name": "Ada" }
{ "type": "leave" }
{ "type": "offer", "target": "p2", "sdp": "..." }
{ "type": "answer", "target": "p2", "sdp": "..." }
{ "type": "answer", "target": "sfu", "sdp": "..." }
{ "type": "ice", "target": "p2", "candidate": "...", "sdp_m_line_index": 0, "sdp_mid": "0" }
{ "type": "ice", "target": "sfu", "candidate": "...", "sdp_m_line_index": 0, "sdp_mid": "0" }
```

Server events:

```json
{ "type": "connected", "participant_id": "p1" }
{ "type": "room_state", "room_id": "room-123", "participants": [...] }
{ "type": "participant_joined", "participant_id": "p2", "display_name": "Bob" }
{ "type": "participant_left", "participant_id": "p2" }
{ "type": "offer", "from": "p1", "sdp": "..." }
{ "type": "answer", "from": "p2", "sdp": "..." }
{ "type": "ice", "from": "p1", "candidate": "...", "sdp_m_line_index": 0, "sdp_mid": "0" }
{ "type": "error", "message": "..." }
```

### Phase 4 — Media forwarding

1. On `on_track`, read RTP packets from the `TrackRemote`.
2. For every other participant in the room, create a `TrackLocalStaticRTP` and `add_track` to their peer connection.
3. Forward the received RTP packets to each subscriber's `TrackLocal`.

## Run

```bash
cd /Volumes/SSD/MVP/services/sfu
cargo run
```

The first build is slow because `webrtc` and its dependencies are large.

The desktop app will eventually connect to `ws://127.0.0.1:8443` for signaling.
