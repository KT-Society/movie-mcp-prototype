import { BrowserMCPIntegration } from "../browser/integration.js";
import { HabitatIntegration } from "../habitat/integration.js";
import { ParakeetSTTService } from "../services/parakeetSTT.js";
import { SmolVLM2Service } from "../services/smolVLM2.js";
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
  ImageAnalysisResult,
  FrameContext,
} from "../types/index.js";

export class Orchestrator {
  public browser: BrowserMCPIntegration;
  public habitat: HabitatIntegration;
  public sttService: ParakeetSTTService;
  public vlmService: SmolVLM2Service;
  private loreStore: Map<string, LoreFact[]> = new Map();
  private sceneFusionStore: Map<string, SceneFusion[]> = new Map();
  private transcriptionStore: Map<string, TranscriptionResult[]> = new Map();
  private frameContextStore: Map<string, FrameContext[]> = new Map();
  private activeIntervals: Map<string, NodeJS.Timeout> = new Map();
  private onDataCaptured?: (
    sessionId: string,
    data: {
      frame?: FrameContext;
      frameRaw?: FrameData;
      subtitles?: SubtitleData[];
      transcription?: TranscriptionResult;
    },
  ) => Promise<void>;

  constructor(browser: BrowserMCPIntegration, habitat: HabitatIntegration) {
    this.browser = browser;
    this.habitat = habitat;
    this.sttService = new ParakeetSTTService();
    this.vlmService = new SmolVLM2Service();
  }

  /**
   * Initialisiert alle lokalen Modelle
   */
  async initialize(): Promise<void> {
    console.log('🧠 [Orchestrator] Initialisiere lokale KI-Modelle...');
    await Promise.all([
      this.sttService.initialize ? this.sttService.initialize() : Promise.resolve(),
      this.vlmService.initialize ? this.vlmService.initialize() : Promise.resolve()
    ]);
    console.log('✅ [Orchestrator] Alle Modelle sind einsatzbereit.');
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

  async seekToTimeSec(
    targetSec: number,
    method: "exact" | "keyframes" | "adaptive" = "exact",
  ): Promise<void> {
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
    const analysis = await this.habitat.analyzeSceneFusion(
      params.session.movieId,
      params.startTimeSec,
      params.endTimeSec,
      params.frameIds,
      params.subtitleIds,
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
    source: LoreFact["source"];
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
      character: "character",
      location: "location",
      object: "object",
      plot: "plot",
      trivia: "trivia",
    };
    return validCategories[category] || "trivia";
  }

  async getLoreFacts(
    sessionId: string,
    category?: LoreFactCategory,
  ): Promise<LoreFact[]> {
    const facts = this.loreStore.get(sessionId) || [];
    if (category) {
      return facts.filter((f) => f.category === category);
    }
    return facts;
  }

  async getSceneFusions(sessionId: string): Promise<SceneFusion[]> {
    return this.sceneFusionStore.get(sessionId) || [];
  }

  async analyzeFrame(frame: FrameData) {
    return this.habitat.analyzeFrame(frame);
  }

  async analyzeFrameWithVLM(frame: FrameData): Promise<ImageAnalysisResult> {
    console.log(`📸 Analysiere Frame mit SmolVLM2: ${frame.id}`);
    const result = await this.vlmService.analyzeFrame(frame);

    const existing = this.frameContextStore.get(frame.movieId) || [];
    const context: FrameContext = {
      frameId: frame.id,
      timestamp: frame.videoTimeSec ?? frame.timestamp / 1000,
      analysis: result,
      keyObjects: result.entities.map((e) => e.label).slice(0, 5),
      textContent: result.textDetected,
      summarization: `Frame ${frame.id}: ${result.description.substring(0, 100)}`,
    };
    existing.push(context);
    this.frameContextStore.set(frame.movieId, existing);

    return result;
  }

  async createFrameContext(frame: FrameData): Promise<FrameContext> {
    return this.vlmService.createFrameContext(frame);
  }

  async batchAnalyzeFrames(frames: FrameData[]): Promise<FrameContext[]> {
    return this.vlmService.batchAnalyzeFrames(frames);
  }

  async getFrameContexts(movieId: string): Promise<FrameContext[]> {
    return this.frameContextStore.get(movieId) || [];
  }

  async analyzeSubtitle(subtitle: SubtitleData) {
    return this.habitat.analyzeSubtitle(subtitle);
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
    durationSec: number,
  ): Promise<TranscriptionResult> {
    console.log(
      `🎙️ Erfasse und transkribiere: ${startTimeSec}s - ${startTimeSec + durationSec}s`,
    );

    const audioBuffer = (await this.browser.captureAudioContext(durationSec * 1000)) || Buffer.alloc(0);
    const result = await this.sttService.transcribe(audioBuffer);

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

  /**
   * Registriert einen Callback für extrahierte Daten
   */
  setDataListener(
    callback: (
      sessionId: string,
      data: {
        frame?: FrameContext;
        frameRaw?: FrameData;
        subtitles?: SubtitleData[];
        transcription?: TranscriptionResult;
      },
    ) => Promise<void>,
  ) {
    this.onDataCaptured = callback;
  }

  /**
   * Startet den automatischen Extraktions-Loop (Phase 1: Eye)
   */
  async startAutoCapture(
    session: MovieSession,
    intervalMs: number = 3000,
  ): Promise<void> {
    if (this.activeIntervals.has(session.id)) {
      console.log(`ℹ️ Capture-Loop läuft bereits für Session ${session.id}`);
      return;
    }

    console.log(
      `🎬 Starte automatischen Capture-Loop (Intervall: ${intervalMs}ms) für Session ${session.id}`,
    );

    const interval = setInterval(() => {
      this.runCaptureCycle(session).catch((err) => {
        console.error(
          `❌ Fehler im Capture-Cycle für Session ${session.id}:`,
          err,
        );
      });
    }, intervalMs);

    this.activeIntervals.set(session.id, interval);
  }

  /**
   * Stoppt den automatischen Extraktions-Loop
   */
  stopAutoCapture(sessionId: string): void {
    const interval = this.activeIntervals.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.activeIntervals.delete(sessionId);
      console.log(`🛑 Capture-Loop für Session ${sessionId} gestoppt.`);
    }
  }

  /**
   * Ein einzelner Durchlauf der Daten-Extraktion
   */
  private async runCaptureCycle(session: MovieSession): Promise<void> {
    if (!session.isActive) {
      this.stopAutoCapture(session.id);
      return;
    }

    console.log(`📸 [Loop] Extrahiere Daten für ${session.movieId}...`);

    try {
      // 1. Frame erfassen und analysieren (VLM)
      const frameData = await this.captureFrameWithTiming(session);
      const frameContext = await this.createFrameContext(frameData);

      // Im Store sichern
      const existingFrames = this.frameContextStore.get(session.movieId) || [];
      existingFrames.push(frameContext);
      this.frameContextStore.set(session.movieId, existingFrames);

      // 3. Audio extrahieren und transkribieren
      let transcription: TranscriptionResult | undefined;
      try {
        transcription = await this.extractAndTranscribeAudio(session, frameData.videoTimeSec || 0, 3);
      } catch (audioErr) {
        console.warn('⚠️ Audio-Extraktion fehlgeschlagen, fahre ohne Audio fort:', audioErr);
      }

      // 4. Listener benachrichtigen (speist die Bridge)
      if (this.onDataCaptured) {
        const subtitles = await this.captureSubtitles(session);
        const captureData: any = {
          frame: frameContext,
          frameRaw: frameData,
          subtitles: subtitles,
        };
        
        // Bei exactOptionalPropertyTypes: true darf kein 'undefined' übergeben werden
        if (transcription) {
          captureData.transcription = transcription;
        }

        await this.onDataCaptured(session.id, captureData);
      }

      console.log(`✅ [Loop] Zyklus abgeschlossen für ${session.movieId}`);
    } catch (error) {
      console.error(`❌ [Loop] Kritischer Fehler im Zyklus:`, error);
    }
  }
}
