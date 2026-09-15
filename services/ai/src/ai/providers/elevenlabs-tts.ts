import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface TtsResult {
  audioBase64: string;
  mimeType: string;
  model: string;
  status: 'ok' | 'no_provider' | 'error';
}

/**
 * ElevenLabs text-to-speech client.
 *
 * Generates MP3 audio from plain text.  The returned base64 payload can be
 * turned into a data URL and played directly by the desktop/web clients.
 */
@Injectable()
export class ElevenLabsTts {
  private readonly logger = new Logger(ElevenLabsTts.name);

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return Boolean(this.config.get<string>('ELEVENLABS_API_KEY'));
  }

  async speak(text: string, voiceId?: string): Promise<TtsResult> {
    const apiKey = this.config.get<string>('ELEVENLABS_API_KEY');
    if (!apiKey) {
      return { audioBase64: '', mimeType: '', model: 'none', status: 'no_provider' };
    }

    const baseUrl = (this.config.get<string>('ELEVENLABS_TTS_BASE_URL') ?? 'https://api.elevenlabs.io').replace(/\/+$/, '');
    const model = this.config.get<string>('ELEVENLABS_TTS_MODEL') ?? 'eleven_multilingual_v2';
    const defaultVoice = this.config.get<string>('ELEVENLABS_TTS_VOICE_ID') ?? '21m00Tcm4TlvDq8ikWAM';
    const selectedVoice = voiceId ?? defaultVoice;

    const payload = {
      text,
      model_id: model,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    };

    try {
      const res = await fetch(`${baseUrl}/v1/text-to-speech/${encodeURIComponent(selectedVoice)}?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        this.logger.error({ status: res.status, body: body.slice(0, 500) }, 'ElevenLabs TTS failed');
        return { audioBase64: '', mimeType: '', model, status: 'error' };
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      const audioBase64 = buffer.toString('base64');
      return { audioBase64, mimeType: 'audio/mpeg', model, status: 'ok' };
    } catch (err) {
      this.logger.error(`ElevenLabs TTS request failed: ${(err as Error).message}`);
      return { audioBase64: '', mimeType: '', model, status: 'error' };
    }
  }
}
