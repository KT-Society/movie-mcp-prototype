import { BrowserMCPIntegration } from '../browser/integration.js';
import { NyraIntegration } from '../nyra/integration.js';
import {
  FrameData,
  SubtitleData,
  SceneFusion,
  LoreFact,
  WhisperSegment,
  MovieSession,
  AudioChunk,
} from '../types/index.js';

export class Orchestrator {
  private browser: BrowserMCPIntegration;
  private nyra: NyraIntegration;

  constructor(browser: BrowserMCPIntegration, nyra: NyraIntegration) {
    this.browser = browser;
    this.nyra = nyra;
  }

  async captureFrameWithTiming(session: MovieSession): Promise<FrameData> {
    const frame = await this.browser.captureFrame();
    // Enrich with session/time info if available
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

  async seekToTimeSec(targetSec: number): Promise<void> {
    // Placeholder: would use page.evaluate to set currentTime
    await this.browser.getPlaybackState();
  }

  async createSceneFusion(params: {
    session: MovieSession;
    startTimeSec: number;
    endTimeSec: number;
    frameIds: string[];
    subtitleIds: string[];
    whisperSegments?: WhisperSegment[];
  }): Promise<SceneFusion> {
    const fusion: SceneFusion = {
      id: `scene_fusion_${Date.now()}`,
      movieId: params.session.movieId,
      sessionId: params.session.id,
      startTimeSec: params.startTimeSec,
      endTimeSec: params.endTimeSec,
      synopsis: 'Scene fusion placeholder summary',
      frameIds: params.frameIds,
      subtitleIds: params.subtitleIds,
      whisperSegments: params.whisperSegments ?? [],
      confidence: 0.5,
      createdAt: new Date(),
    };
    return fusion;
  }

  async addLoreFact(params: {
    session: MovieSession;
    category: LoreFact['category'];
    fact: string;
    source: LoreFact['source'];
    referenceIds?: string[];
  }): Promise<LoreFact> {
    return {
      id: `lore_${Date.now()}`,
      movieId: params.session.movieId,
      sessionId: params.session.id,
      category: params.category,
      fact: params.fact,
      source: params.source,
      referenceIds: params.referenceIds ?? [],
      createdAt: new Date(),
    };
  }

  async analyzeFrame(frame: FrameData) {
    return this.nyra.analyzeFrame(frame);
  }

  async analyzeSubtitle(subtitle: SubtitleData) {
    return this.nyra.analyzeSubtitle(subtitle);
  }

  async handleAudioChunk(_chunk: AudioChunk) {
    // Placeholder: hook for future audio chunk analysis
    return { success: true };
  }
}
