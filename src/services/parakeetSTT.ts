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

    try {
      return await this.transcribeLocally(audioBuffer, { language: lang, wordTimestamps: wordTs });
    } catch (error) {
      console.error('❌ [STT] Transkription fehlgeschlagen:', error);
      throw new Error("Transkription fehlgeschlagen - Kein Mock-Fallback verfügbar.");
    }
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

      if (!response || response.text === undefined) {
        throw new Error("Ungültige Antwort vom STT Worker");
      }

      const result: TranscriptionResult = {
        text: response.text,
        segments: response.segments || [],
        language: options.language,
        duration: response.duration || 3,
        confidence: response.confidence || 0.98
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

  private generateCacheKey(buffer: Buffer): string {
    // Einfacher Hash aus den ersten 1000 Bytes
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