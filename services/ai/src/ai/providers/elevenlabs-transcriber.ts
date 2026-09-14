import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface TranscriptWord {
  text: string;
  start: number;
  end: number;
  type?: string;
  speaker_id?: string;
}

export interface TranscriptionResult {
  text: string;
  words: TranscriptWord[];
  model: string;
  status: 'ok' | 'no_provider' | 'error';
}

/**
 * ElevenLabs Scribe speech-to-text client. Each call transcribes a single
 * audio file; callers label the result with the track's speaker themselves
 * (the SFU records one file per participant track, so diarization is not
 * needed — per-track attribution is exact).
 */
@Injectable()
export class ElevenLabsTranscriber {
  private readonly logger = new Logger(ElevenLabsTranscriber.name);

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return Boolean(this.config.get<string>('ELEVENLABS_API_KEY'));
  }

  /**
   * Mints a single-use token (15 min TTL) that lets a client open a realtime
   * Scribe WebSocket without exposing the API key.
   */
  async createRealtimeToken(): Promise<{ token: string } | null> {
    const apiKey = this.config.get<string>('ELEVENLABS_API_KEY');
    if (!apiKey) return null;
    const baseUrl = (this.config.get<string>('ELEVENLABS_STT_BASE_URL') ?? 'https://api.elevenlabs.io').replace(/\/+$/, '');
    try {
      const res = await fetch(`${baseUrl}/v1/single-use-token/realtime_scribe`, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey },
      });
      if (!res.ok) {
        this.logger.error({ status: res.status }, 'Failed to mint ElevenLabs realtime token');
        return null;
      }
      return (await res.json()) as { token: string };
    } catch (err) {
      this.logger.error(`ElevenLabs realtime token request failed: ${(err as Error).message}`);
      return null;
    }
  }

  async transcribe(input: { bytes: Buffer; fileName: string; mimeType: string }): Promise<TranscriptionResult> {
    const apiKey = this.config.get<string>('ELEVENLABS_API_KEY');
    if (!apiKey) {
      return { text: '', words: [], model: 'none', status: 'no_provider' };
    }

    const baseUrl = (this.config.get<string>('ELEVENLABS_STT_BASE_URL') ?? 'https://api.elevenlabs.io').replace(/\/+$/, '');
    const model = this.config.get<string>('ELEVENLABS_STT_MODEL') ?? 'scribe_v2';

    const form = new FormData();
    form.append('model_id', model);
    form.append('file', new Blob([new Uint8Array(input.bytes)], { type: input.mimeType }), input.fileName);
    form.append('timestamps_granularity', 'word');
    form.append('tag_audio_events', 'false');

    try {
      const res = await fetch(`${baseUrl}/v1/speech-to-text`, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey },
        body: form,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        this.logger.error({ status: res.status, body: body.slice(0, 500) }, 'ElevenLabs transcription failed');
        return { text: '', words: [], model, status: 'error' };
      }

      const data = (await res.json()) as { text?: string; words?: TranscriptWord[] };
      return { text: data.text ?? '', words: data.words ?? [], model, status: 'ok' };
    } catch (err) {
      this.logger.error(`ElevenLabs transcription request failed: ${(err as Error).message}`);
      return { text: '', words: [], model, status: 'error' };
    }
  }
}

/** Groups a track's word stream into utterances (sentence boundaries or pauses). */
export function wordsToUtterances(words: TranscriptWord[]): { start: number; text: string }[] {
  const utterances: { start: number; text: string }[] = [];
  let current: { start: number; end: number; parts: string[] } | null = null;

  const flush = () => {
    if (current && current.parts.length) {
      const text = current.parts.join('').replace(/\s+/g, ' ').trim();
      if (text) utterances.push({ start: current.start, text });
    }
    current = null;
  };

  for (const w of words) {
    if (w.type && w.type !== 'word' && w.type !== 'spacing') {
      flush();
      continue;
    }
    const gap = current ? w.start - current.end : 0;
    if (!current) {
      current = { start: w.start, end: w.end, parts: [w.text] };
    } else {
      const isNewSentence = /[.!?]["')\]]?\s*$/.test(current.parts.join(''));
      if (gap > 2 || isNewSentence || current.parts.join('').length > 220) {
        flush();
        current = { start: w.start, end: w.end, parts: [w.text] };
      } else {
        current.end = w.end;
        current.parts.push(w.text);
      }
    }
  }
  flush();
  return utterances;
}
