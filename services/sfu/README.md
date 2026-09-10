# Teamspace One Native SFU

The native Selective Forwarding Unit (SFU) for real-time meetings and voice rooms — the only media path (LiveKit has been removed). It is a separate Rust service in the monorepo.

## Architecture

- **Signaling**: WebSocket server on `SFU_HOST:SFU_PORT` (default `0.0.0.0:8443`) for offer/answer/ICE exchange.
- **Media engine**: `webrtc-rs` for managing `RTCPeerConnection`s in Rust.
- **SFU logic**: Published tracks are selectively forwarded to every subscriber peer; PLI/FIR feedback is relayed to publishers and new subscribers get an immediate keyframe request.
- **Transport**: UDP/RTP. `SFU_UDP_MUX_PORT` binds all ICE media to a single UDP port for easy firewall/Docker deployment, and `SFU_NAT_1TO1_IPS` advertises public IPs when the SFU is behind 1:1 NAT.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `SFU_TOKEN_SECRET` | (required) | HMAC secret for join tokens (must match meeting-service) |
| `SFU_HOST` / `SFU_PORT` | `0.0.0.0` / `8443` | WebSocket signaling bind address |
| `SFU_UDP_MUX_PORT` | (unset) | If set, muxes all ICE/UDP media onto this port |
| `SFU_NAT_1TO1_IPS` | (unset) | Comma-separated public IPs advertised as host candidates |
| `SFU_CONTROL_PORT` | `8445` | Internal control API (recording). Not published publicly |
| `SFU_RECORDING_DIR` | `./recordings` | Where per-track recordings are written before upload |
| `FILE_STORAGE_SERVICE_URL` / `INTERNAL_API_KEY` | (required for upload) | Recording upload destination + service auth |

## Recording

`POST /rooms/:room/recording/start` and `.../stop` on the control port, guarded by
`x-sfu-control-token` (`control.<roomB64>.<exp>.<hmac>` signed with
`SFU_TOKEN_SECRET`; minted by meeting-service in `setRecording`).

Each published track is teed to a media file — Opus `.ogg`, VP8/VP9 `.ivf`,
H.264 `.h264` — under `SFU_RECORDING_DIR/<room>/`. Tracks are recorded as raw
RTP without decoding, so no mixing/compositing happens yet. On stop (or when
the room drains), files are uploaded to file-storage as the recording actor's
uploads, then deleted locally. A composite per-meeting file can be produced
later by merging these in the file-processing worker with ffmpeg.

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

### Phase 4 — Media forwarding (current)

1. On `on_track`, read RTP packets from the `TrackRemote`.
2. For every other participant in the room, create a `TrackLocalStaticRTP` and `add_track` to their peer connection.
3. Forward the received RTP packets to each subscriber's `TrackLocal`.
4. When a track ends or a publisher leaves, `remove_track` on each subscriber triggers renegotiation so clients drop the tile.

## Run

```bash
cd /Volumes/SSD/MVP/services/sfu
cargo run
```

The first build is slow because `webrtc` and its dependencies are large.

The desktop app connects to `ws://127.0.0.1:8443` for signaling (`VITE_SFU_URL` overrides).
