import { useEffect, useRef, useState } from "react";
import { createScribeToken, postMeetingTranscriptLines } from "../lib/api";

const SCRIBE_WS_URL = "wss://api.elevenlabs.io/v1/speech-to-text/realtime";
const TARGET_SAMPLE_RATE = 16000;

function downsampleToPcm16(input: Float32Array, inputRate: number): Int16Array {
  const ratio = inputRate / TARGET_SAMPLE_RATE;
  const outLength = Math.floor(input.length / ratio);
  const out = new Int16Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const s = Math.max(-1, Math.min(1, input[Math.floor(i * ratio)] ?? 0));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function pcm16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

/**
 * Streams the local mic track to ElevenLabs Scribe realtime and posts each
 * committed transcript segment to the meeting's transcript store, which feeds
 * the MOM summary when the call ends. No-ops silently when transcription is
 * not configured (no API key) or the caller has no token access (guests).
 */
export function useLiveTranscription(options: {
  meetingId?: string;
  stream: MediaStream | null;
  speaker: string;
  enabled?: boolean;
}): { partial: string; active: boolean } {
  const { meetingId, stream, speaker, enabled = true } = options;
  const [partial, setPartial] = useState("");
  const [active, setActive] = useState(false);
  const pendingRef = useRef<{ text: string; speaker?: string }[]>([]);
  const flushingRef = useRef(false);
  const reconnectsRef = useRef(0);

  useEffect(() => {
    if (!enabled || !meetingId || !stream || !stream.getAudioTracks().length) return;

    let cancelled = false;
    let ws: WebSocket | null = null;
    let audioCtx: AudioContext | null = null;
    let processor: ScriptProcessorNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let muteGain: GainNode | null = null;

    const flush = async () => {
      if (flushingRef.current || !pendingRef.current.length) return;
      const lines = pendingRef.current.splice(0, pendingRef.current.length);
      flushingRef.current = true;
      try {
        await postMeetingTranscriptLines(meetingId, lines);
      } catch {
        pendingRef.current.unshift(...lines);
      } finally {
        flushingRef.current = false;
      }
    };

    const startPipeline = () => {
      audioCtx = new AudioContext();
      source = audioCtx.createMediaStreamSource(stream);
      processor = audioCtx.createScriptProcessor(4096, 1, 1);
      muteGain = audioCtx.createGain();
      muteGain.gain.value = 0;
      processor.onaudioprocess = (event) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        // Don't stream audio while the mic is muted — muted tracks emit
        // silence that would still count as billed audio.
        const mic = stream.getAudioTracks()[0];
        if (!mic || mic.enabled === false) return;
        const pcm = downsampleToPcm16(event.inputBuffer.getChannelData(0), audioCtx!.sampleRate);
        if (!pcm.length) return;
        ws.send(
          JSON.stringify({
            message_type: "input_audio_chunk",
            audio_base_64: pcm16ToBase64(pcm),
            commit: false,
            sample_rate: TARGET_SAMPLE_RATE,
          }),
        );
      };
      source.connect(processor);
      processor.connect(muteGain);
      muteGain.connect(audioCtx.destination);
    };

    const connect = async () => {
      let token: string;
      try {
        token = (await createScribeToken()).token;
      } catch {
        return; // transcription not configured or not permitted
      }
      if (cancelled) return;

      const params = new URLSearchParams({
        model_id: "scribe_v2_realtime",
        token,
        audio_format: "pcm_16000",
        commit_strategy: "vad",
        include_timestamps: "true",
      });
      ws = new WebSocket(`${SCRIBE_WS_URL}?${params.toString()}`);

      ws.onopen = () => {
        setActive(true);
        startPipeline();
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as { message_type?: string; text?: string };
          if (data.message_type === "partial_transcript") {
            setPartial(data.text ?? "");
          } else if (
            data.message_type === "committed_transcript" ||
            data.message_type === "committed_transcript_with_timestamps"
          ) {
            const text = (data.text ?? "").trim();
            setPartial("");
            if (text) {
              pendingRef.current.push({ text, speaker });
              void flush();
            }
          }
        } catch {
          // ignore malformed frames
        }
      };
      ws.onerror = () => setActive(false);
      ws.onclose = () => {
        setActive(false);
        processor?.disconnect();
        source?.disconnect();
        if (!cancelled && reconnectsRef.current < 1) {
          reconnectsRef.current += 1;
          window.setTimeout(() => {
            if (!cancelled) void connect();
          }, 3000);
        }
      };
    };

    void connect();

    return () => {
      cancelled = true;
      processor?.disconnect();
      source?.disconnect();
      muteGain?.disconnect();
      void audioCtx?.close().catch(() => undefined);
      ws?.close();
      void flush();
      setActive(false);
      setPartial("");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId, stream, enabled, speaker]);

  return { partial, active };
}
