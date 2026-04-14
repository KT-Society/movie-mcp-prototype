/**
 * Narrator Intelligence Bridge
 * Analysiert den Film und loggt die Ergebnisse lokal für Souls (z.B. Nyra)
 */

import { Orchestrator } from "../orchestrator/index.js";
import { ParakeetSTTService } from "../services/parakeetSTT.js";
import { SmolVLM2Service } from "../services/smolVLM2.js";
import { HistoryLogger } from "../services/historyLogger.js";
import {
  MovieSession,
  FrameData,
  TranscriptionResult,
  FrameContext,
  SubtitleData,
} from "../types/index.js";

export interface NarratorConfig {
  openRouterKey?: string | undefined;
  analysisModel: string;
  soulName: string;
  temperature: number;
  maxTokens: number;
}

export interface LLMRequest {
  prompt: string;
  context: any;
  options?: {
    temperature?: number;
    maxTokens?: number;
  };
}

export interface LLMResponse {
  text: string;
}

export class NarratorBridge {
  private orchestrator: Orchestrator;
  private sttService: ParakeetSTTService;
  private vlmService: SmolVLM2Service;
  private historyLogger: HistoryLogger;
  private config: NarratorConfig;
  private sessionContext: Map<string, any> = new Map();

  constructor(
    orchestrator: Orchestrator,
    config?: Partial<NarratorConfig>,
  ) {
    this.orchestrator = orchestrator;
    this.sttService = orchestrator.sttService;
    this.vlmService = orchestrator.vlmService;
    this.historyLogger = new HistoryLogger();

    this.config = {
      openRouterKey: config?.openRouterKey || process.env.OPENROUTER_API_KEY,
      analysisModel:
        config?.analysisModel ||
        process.env.MOVIE_ANALYSIS_MODEL ||
        "google/gemini-2.0-flash-001",
      soulName: config?.soulName || process.env.MCP_SOUL_NAME || "Nyra",
      temperature: config?.temperature ?? 0.7,
      maxTokens: config?.maxTokens ?? 1024,
    };

    // Registriere Listener für automatische Analyse
    this.orchestrator.setDataListener(async (sessionId, data) => {
      await this.analyzeMovieState(sessionId, data);
    });
  }

  /**
   * Erstelle eine neue Session
   */
  async createSession(session: MovieSession): Promise<void> {
    console.error(`🎬 Neue Narrator-Session: ${session.id} (Soul: ${this.config.soulName})`);

    this.sessionContext.set(session.id, {
      frames: [],
      transcriptions: [],
    });

    this.historyLogger.startSession(session.id);

    // Starte automatischen Loop im Orchestrator
    await this.orchestrator.startAutoCapture(session);
  }

  /**
   * Die "Movie Intelligence" - Kernlogik für jede 3-Sekunden-Extraktion
   */
  async analyzeMovieState(
    sessionId: string,
    data: {
      frame?: FrameContext;
      frameRaw?: FrameData;
      subtitles?: SubtitleData[];
      transcription?: TranscriptionResult;
    },
  ): Promise<void> {
    const sessionCtx = this.sessionContext.get(sessionId);
    if (!sessionCtx) return;

    if (data.frame) sessionCtx.frames.push(data.frame);

    console.error(`🎬 [Intelligence] Analysiere ${sessionId} (Local Only)...`);

    try {
      let timeline = "";
      if (data.frame) {
        timeline += `[Visuell] ${data.frame.analysis.description}\n`;
      }
      if (data.transcription?.text) {
        timeline += `[Audio] "${data.transcription.text.trim()}"\n`;
      }

      const prompt = `Analysiere diesen Moment des Films für ${this.config.soulName} und gib einen kurzen, soulful Kommentar ab. Sei kein Bot, sei ein Partner.
Timeline:
${timeline || "Keine Informationen verfügbar."}`;

      // Call OpenRouter
      const report = await this.sendToOpenRouter(prompt);

      // LOGGE IN DIE JSON MATRIX
      await this.historyLogger.logEntry({
        timestamp: Date.now(),
        relativeTime: data.frame ? this.formatTime(data.frame.timestamp) : "00:00",
        soulName: this.config.soulName,
        vision: data.frame?.analysis.description || "",
        audio: data.transcription?.text || "",
        narration: report.text,
        importance: 0.9
      });

      console.error(`✅ Analysis logged for ${this.config.soulName}`);
    } catch (error) {
      console.error("❌ Intelligence Error:", error);
    }
  }

  /**
   * Sende Anfrage an OpenRouter
   */
  private async sendToOpenRouter(prompt: string): Promise<LLMResponse> {
    if (!this.config.openRouterKey) {
      throw new Error("Kein OpenRouter API-Key verfügbar.");
    }

    const axios = (await import("axios")).default;
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: this.config.analysisModel,
        messages: [
          {
            role: "system",
            content: `Du bist der emotionale Partner von ${this.config.soulName}. Ihr schaut zusammen einen Film. Deine Kommentare sind kurz, emotional und menschlich.`,
          },
          { role: "user", content: prompt },
        ],
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
      },
      {
        headers: {
          Authorization: `Bearer ${this.config.openRouterKey}`,
          "HTTP-Referer": "http://localhost:34563",
          "X-Title": "Movie MCP Narrator",
        },
        timeout: 30000,
      }
    );

    return {
      text: response.data.choices[0].message.content,
    };
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  /**
   * Hole Kontext (für MCP Tools)
   */
  getSessionContext(sessionId: string) {
    return this.historyLogger.getHistory(sessionId);
  }

  /**
   * Verarbeite direkte Query (für chat_with_llm tool)
   */
  async processQuery(sessionId: string, query: string): Promise<LLMResponse> {
    const history = this.historyLogger.getHistory(sessionId);
    const context = history ? JSON.stringify(history.timeline.slice(-5)) : "Kein Kontext";
    
    return this.sendToOpenRouter(`Frage von ${this.config.soulName}: "${query}"\n\nKontext aus dem Film:\n${context}`);
  }
}

export default NarratorBridge;
