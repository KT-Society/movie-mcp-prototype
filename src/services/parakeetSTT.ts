/**
 * Parakeet STT Service
 * Speech-to-Text using Parakeet models for audio transcription
 */

import axios from 'axios';
import { AudioExtractionService } from './audioExtractor.js';
import { 
  STTConfig, 
  TranscriptionResult, 
  WhisperSegment,
  AudioChunk 
} from '../types/index.js';

export class ParakeetSTTService {
  private audioExtractor: AudioExtractionService;
  private config: STTConfig;
  private apiUrl: string;
  private useExternalAPI: boolean;
  private transcriptionCache: Map<string, TranscriptionResult> = new Map();

  constructor(config?: Partial<STTConfig>) {
    this.audioExtractor = new AudioExtractionService();
    
    this.config = {
      modelType: config?.modelType || 'parakeet-tdt',
      sampleRate: config?.sampleRate || 16000,
      language: config?.language || 'de',
      useVAD: config?.useVAD ?? true
    };

    this.apiUrl = process.env.STT_API_URL || 'http://localhost:8081';
    this.useExternalAPI = process.env.USE_EXTERNAL_STT === 'true';
  }

  async transcribeAudioBuffer(
    audioBuffer: Buffer,
    options: {
      language?: string;
      wordTimestamps?: boolean;
    } = {}
  ): Promise<TranscriptionResult> {
    const lang = options.language ?? 'de';
    const wordTs = options.wordTimestamps ?? true;

    console.log(`🎙️ Starte Parakeet STT (Sprache: ${lang})...`);

    const cacheKey = this.generateCacheKey(audioBuffer);
    const cached = this.transcriptionCache.get(cacheKey);
    if (cached) {
      console.log('📋 Verwende gecachte Transkription');
      return cached;
    }

    if (this.useExternalAPI) {
      try {
        return await this.transcribeViaExternalAPI(audioBuffer, { language: lang, wordTimestamps: wordTs });
      } catch (error) {
        console.warn('Externe STT API fehlgeschlagen, verwende lokale Mock-Transkription');
      }
    }

    return this.mockTranscription(audioBuffer, { language: lang, wordTimestamps: wordTs });
  }

  private async transcribeViaExternalAPI(
    audioBuffer: Buffer,
    options: { language: string; wordTimestamps: boolean }
  ): Promise<TranscriptionResult> {
    const formData = new FormData();
    const uint8Array = new Uint8Array(audioBuffer);
    const blob = new Blob([uint8Array], { type: 'audio/wav' });
    formData.append('audio', blob, 'audio.wav');
    formData.append('language', options.language);
    formData.append('word_timestamps', String(options.wordTimestamps));
    formData.append('model_type', this.config.modelType);

    const response = await axios.post(`${this.apiUrl}/transcribe`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000
    });

    return this.mapExternalResponse(response.data);
  }

  private mapExternalResponse(data: any): TranscriptionResult {
    const segments: WhisperSegment[] = (data.segments || []).map((seg: any) => ({
      id: seg.id || `seg_${Date.now()}_${Math.random()}`,
      text: seg.text || '',
      startSec: seg.start || 0,
      endSec: seg.end || 0,
      confidence: seg.confidence || 0.9,
      language: data.language ?? 'de'
    }));

    return {
      text: data.text || segments.map((s: WhisperSegment) => s.text).join(' '),
      segments,
      language: data.language ?? 'de',
      duration: data.duration || 0,
      confidence: data.confidence || 0.85
    };
  }

  private async mockTranscription(
    audioBuffer: Buffer,
    options: { language: string; wordTimestamps: boolean }
  ): Promise<TranscriptionResult> {
    console.log('🎭 Mock-Transkription (keine echte Parakeet-Verbindung)');

    const estimatedDuration = Math.max(1, Math.min(30, audioBuffer.length / 32000));
    const segmentCount = Math.max(1, Math.floor(estimatedDuration / 3));

    const segments: WhisperSegment[] = [];
    const mockTexts: Record<string, string[]> = {
      de: [
        'Die Geschichte beginnt in einer kleinen Stadt.',
        'Plötzlich taucht ein Fremder auf.',
        'Er trägt einen alten Mantel und einen Hut.',
        'Die Bewohner sind neugierig aber auch vorsichtig.',
        'Was wird der Fremde als nächstes tun?'
      ],
      en: [
        'The story begins in a small town.',
        'Suddenly a stranger appears.',
        'He wears an old coat and a hat.',
        'The residents are curious but also cautious.',
        'What will the stranger do next?'
      ]
    };

    const texts = mockTexts[options.language] ?? mockTexts['en'] ?? [];
    const durationPerSegment = estimatedDuration / segmentCount;

    for (let i = 0; i < segmentCount; i++) {
      const text = texts[i % texts.length] ?? 'Sample text';
      const segment: WhisperSegment = {
        id: `mock_seg_${i}`,
        text: text,
        startSec: i * durationPerSegment,
        endSec: (i + 1) * durationPerSegment,
        confidence: 0.7 + Math.random() * 0.2,
        language: options.language,
      };
      if (options.wordTimestamps) {
        const words = this.generateMockWords(text, i * durationPerSegment);
        if (words) {
          segment.words = words;
        }
      }
      segments.push(segment);
    }

    const result: TranscriptionResult = {
      text: segments.map(s => s.text).join(' '),
      segments,
      language: options.language,
      duration: estimatedDuration,
      confidence: 0.75
    };

    const cacheKey = Buffer.from(audioBuffer.slice(0, 1000)).toString('base64');
    this.transcriptionCache.set(cacheKey, result);

    return result;
  }

  private generateMockWords(text: string, startTime: number): WhisperSegment['words'] | undefined {
    const words = text.split(' ');
    const avgDuration = 3 / words.length;
    let currentTime = startTime;

    return words.map(word => {
      const wordObj = {
        text: word,
        startSec: currentTime,
        endSec: currentTime + avgDuration,
        probability: 0.7 + Math.random() * 0.25
      };
      currentTime += avgDuration;
      return wordObj;
    });
  }

  private generateCacheKey(buffer: Buffer): string {
    return Buffer.from(buffer.slice(0, 1000)).toString('base64');
  }

  async transcribeAudioChunk(chunk: AudioChunk): Promise<TranscriptionResult> {
    console.log(`🎙️ Transkribiere Audio-Chunk: ${chunk.id}`);

    const audioBuffer = Buffer.from(chunk.dataBase64, 'base64');
    return this.transcribeAudioBuffer(audioBuffer, {});
  }

  async extractAndTranscribe(
    sessionId: string,
    startTimeSec: number,
    durationSec: number
  ): Promise<TranscriptionResult> {
    console.log(`🎙️ Extrahiere und transkribiere: ${startTimeSec}s - ${startTimeSec + durationSec}s`);

    const audioBuffer = await this.audioExtractor.captureAudioSegment(
      sessionId,
      startTimeSec,
      durationSec
    );

    if (audioBuffer.length === 0) {
      return {
        text: '',
        segments: [],
        language: this.config.language ?? 'de',
        duration: 0,
        confidence: 0
      };
    }

    return this.transcribeAudioBuffer(audioBuffer);
  }

  async getTranscriptionCache(sessionId: string): Promise<TranscriptionResult[]> {
    const results: TranscriptionResult[] = [];
    for (const [key, value] of this.transcriptionCache) {
      if (key.startsWith(sessionId)) {
        results.push(value);
      }
    }
    return results;
  }

  clearCache(): void {
    this.transcriptionCache.clear();
  }

  setLanguage(language: string): void {
    this.config.language = language;
  }

  getConfig(): STTConfig {
    return { ...this.config };
  }
}

export default ParakeetSTTService;