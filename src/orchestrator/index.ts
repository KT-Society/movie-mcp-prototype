import { BrowserMCPIntegration } from '../browser/integration.js';
import { NyraIntegration } from '../nyra/integration.js';
import { ParakeetSTTService } from '../services/parakeetSTT.js';
import { AudioExtractionService } from '../services/audioExtractor.js';
import {
  FrameData,
  SubtitleData,
  SceneFusion,
  LoreFact,
  WhisperSegment,
  MovieSession,
  AudioChunk,
  LoreFactCategory,
  TranscriptionResult,
} from '../types/index.js';

export class Orchestrator {
  private browser: BrowserMCPIntegration;
  private nyra: NyraIntegration;
  private sttService: ParakeetSTTService;
  private audioExtractor: AudioExtractionService;
  private loreStore: Map<string, LoreFact[]> = new Map();
  private sceneFusionStore: Map<string, SceneFusion[]> = new Map();
  private transcriptionStore: Map<string, TranscriptionResult[]> = new Map();

  constructor(browser: BrowserMCPIntegration, nyra: NyraIntegration) {
    this.browser = browser;
    this.nyra = nyra;
    this.sttService = new ParakeetSTTService();
    this.audioExtractor = new AudioExtractionService();
  }

  async captureFrameWithTiming(session: MovieSession): Promise<FrameData> {
    const frame = await this.browser.captureFrame();
    return {
      ...frame,
      movieId: session.movieId,
      capturedAtWallTimeMs: Date.now(),
      videoTimeSec: frame.videoTimeSec ?? frame.timestamp / 1000,
    };
  }

  async captureSubtitles(session: MovieSession): Promise<SubtitleData[]> {
    const subs = await this.browser.getSubtitles();
    return subs.map((s, idx) => ({
      ...s,
      movieId: session.movieId,
      id: s.id ?? `subtitle_${Date.now()}_${idx}`,
    }));
  }

  async seekToTimeSec(targetSec: number, method: 'exact' | 'keyframes' | 'adaptive' = 'exact'): Promise<void> {
    await this.browser.seekToTime(targetSec, method);
  }

  async createSceneFusion(params: {
    session: MovieSession;
    startTimeSec: number;
    endTimeSec: number;
    frameIds: string[];
    subtitleIds: string[];
    whisperSegments?: WhisperSegment[];
  }): Promise<SceneFusion> {
    const analysis = await this.nyra.analyzeSceneFusion(
      params.session.movieId,
      params.startTimeSec,
      params.endTimeSec,
      params.frameIds,
      params.subtitleIds
    );

    const fusion: SceneFusion = {
      id: `scene_fusion_${Date.now()}`,
      movieId: params.session.movieId,
      sessionId: params.session.id,
      startTimeSec: params.startTimeSec,
      endTimeSec: params.endTimeSec,
      synopsis: analysis.synopsis,
      frameIds: params.frameIds,
      subtitleIds: params.subtitleIds,
      whisperSegments: params.whisperSegments ?? [],
      confidence: analysis.confidence,
      createdAt: new Date(),
    };

    const existing = this.sceneFusionStore.get(params.session.id) || [];
    existing.push(fusion);
    this.sceneFusionStore.set(params.session.id, existing);

    return fusion;
  }

  async addLoreFact(params: {
    session: MovieSession;
    category: LoreFactCategory;
    fact: string;
    source: LoreFact['source'];
    referenceIds?: string[];
  }): Promise<LoreFact> {
    const validatedCategory = this.validateLoreCategory(params.category);
    
    const loreFact: LoreFact = {
      id: `lore_${Date.now()}`,
      movieId: params.session.movieId,
      sessionId: params.session.id,
      category: validatedCategory,
      fact: params.fact,
      source: params.source,
      referenceIds: params.referenceIds ?? [],
      createdAt: new Date(),
    };

    const existing = this.loreStore.get(params.session.id) || [];
    existing.push(loreFact);
    this.loreStore.set(params.session.id, existing);

    return loreFact;
  }

  private validateLoreCategory(category: string): LoreFactCategory {
    const validCategories: Record<string, LoreFactCategory> = {
      'character': 'character',
      'location': 'location',
      'object': 'object',
      'plot': 'plot',
      'trivia': 'trivia'
    };
    return validCategories[category] || 'trivia';
  }

  async getLoreFacts(sessionId: string, category?: LoreFactCategory): Promise<LoreFact[]> {
    const facts = this.loreStore.get(sessionId) || [];
    if (category) {
      return facts.filter(f => f.category === category);
    }
    return facts;
  }

  async getSceneFusions(sessionId: string): Promise<SceneFusion[]> {
    return this.sceneFusionStore.get(sessionId) || [];
  }

  async analyzeFrame(frame: FrameData) {
    return this.nyra.analyzeFrame(frame);
  }

  async analyzeSubtitle(subtitle: SubtitleData) {
    return this.nyra.analyzeSubtitle(subtitle);
  }

  async handleAudioChunk(_chunk: AudioChunk) {
    return { success: true };
  }

  async transcribeAudioChunk(chunk: AudioChunk): Promise<TranscriptionResult> {
    console.log(`🎙️ Transkribiere Audio-Chunk im Orchestrator: ${chunk.id}`);
    const result = await this.sttService.transcribeAudioChunk(chunk);
    
    const existing = this.transcriptionStore.get(chunk.movieId) || [];
    existing.push(result);
    this.transcriptionStore.set(chunk.movieId, existing);
    
    return result;
  }

  async extractAndTranscribeAudio(
    session: MovieSession,
    startTimeSec: number,
    durationSec: number
  ): Promise<TranscriptionResult> {
    console.log(`🎙️ Extrahiere und transkribiere: ${startTimeSec}s - ${startTimeSec + durationSec}s`);
    
    const result = await this.sttService.extractAndTranscribe(
      session.id,
      startTimeSec,
      durationSec
    );
    
    if (result.segments.length > 0) {
      const existing = this.transcriptionStore.get(session.movieId) || [];
      existing.push(result);
      this.transcriptionStore.set(session.movieId, existing);
    }
    
    return result;
  }

  async getTranscriptions(movieId: string): Promise<TranscriptionResult[]> {
    return this.transcriptionStore.get(movieId) || [];
  }

  setSTTLanguage(language: string): void {
    this.sttService.setLanguage(language);
  }
}
