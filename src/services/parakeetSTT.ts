/**
 * Parakeet STT Service
 * Speech-to-Text using Parakeet models for audio transcription
 */

import axios from 'axios';
import { PythonWorkerManager } from './pythonWorkerManager.js';
import { 
  STTConfig, 
  TranscriptionResult, 
  WhisperSegment,
  AudioChunk 
} from '../types/index.js';

export class ParakeetSTTService {
  private config: STTConfig;
  private transcriptionCache: Map<string, TranscriptionResult> = new Map();
  private worker = PythonWorkerManager.getInstance();

  constructor(config?: Partial<STTConfig>) {
    this.config = {
      modelType: config?.modelType || 'parakeet-tdt',
      sampleRate: config?.sampleRate || 16000,
      language: config?.language || 'de',
      useVAD: config?.useVAD ?? true
    };
  }

  async initialize(): Promise<void> {
    await this.worker.initialize();
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

    console.log(`🎙️ [STT] Sende Audio an Unified Worker...`);

    const cacheKey = this.generateCacheKey(audioBuffer);
    const cached = this.transcriptionCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    return await this.transcribeLocally(audioBuffer, { language: lang, wordTimestamps: wordTs });
  }

  private async transcribeLocally(
    audioBuffer: Buffer,
    options: { language: string; wordTimestamps: boolean }
  ): Promise<TranscriptionResult> {
    // Temp File via Manager erstellen
    const tempFile = this.worker.saveTempFile(audioBuffer, 'stt', 'wav');

    try {
      const response = await this.worker.executeCommand({
        method: 'transcribe',
        path: tempFile
      });

      const result: TranscriptionResult = {
        text: response.text,
        segments: [],
        language: options.language,
        duration: 3,
        confidence: 0.98
      };

      this.transcriptionCache.set(this.generateCacheKey(audioBuffer), result);
      return result;
    } catch (error) {
      console.error('❌ [STT] Lokale Transkription fehlgeschlagen:', error);
      throw error;
    } finally {
      this.worker.cleanupTempFile(tempFile);
    }
  }

  private async transcribeViaExternalAPI(
    audioBuffer: Buffer,
    options: { language: string; wordTimestamps: boolean }
  ): Promise<TranscriptionResult> {
    // Diese Methode wird durch die lokale Python-Bridge ersetzt
    console.warn("⚠️ External API Logic ist deaktiviert. Nutze lokale Python-Bridge.");
    return {
      text: "",
      segments: [],
      language: options.language,
      duration: 0,
      confidence: 0
    };
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
    const texts = [
      'Transkription wird verarbeitet...',
      'Audio-Inhalt wird analysiert...',
      'Spracherkennung läuft...'
    ];
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

  async transcribe(
    audioBuffer: Buffer
  ): Promise<TranscriptionResult> {
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