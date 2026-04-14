/**
 * Habitat LLM Bridge
 * Verbindet MovieMCP mit dem Habitat/LLM Ökosystem
 */

import { BrowserMCPIntegration } from "../browser/integration.js";
import { HabitatIntegration } from "../habitat/integration.js";
import { Orchestrator } from "../orchestrator/index.js";
import { ParakeetSTTService } from "../services/parakeetSTT.js";
import { SmolVLM2Service } from "../services/smolVLM2.js";
import {
  MovieSession,
  FrameData,
  TranscriptionResult,
  SceneFusion,
  LoreFact,
  FrameContext,
  SubtitleData,
} from "../types/index.js";

export interface HabitatConfig {
  apiUrl: string;
  apiKey?: string | undefined;
  openRouterKey?: string | undefined;
  analysisModel: string;
  modelName: string;
  temperature: number;
  maxTokens: number;
}

export interface LLMRequest {
  prompt: string;
  context: {
    frames?: FrameContext[];
    transcriptions?: TranscriptionResult[];
    sceneFusions?: SceneFusion[];
    loreFacts?: LoreFact[];
  };
  options?: {
    temperature?: number;
    maxTokens?: number;
  };
}

export interface LLMResponse {
  text: string;
  toolCalls?: {
    name: string;
    arguments: Record<string, any>;
  }[];
  memory?: {
    type: string;
    content: string;
    importance: number;
  };
}

export class HabitatLLMBridge {
  private orchestrator: Orchestrator;
  private habitat: HabitatIntegration;
  private sttService: ParakeetSTTService;
  private vlmService: SmolVLM2Service;
  private config: HabitatConfig;
  private sessionContext: Map<
    string,
    {
      frames: FrameContext[];
      transcriptions: TranscriptionResult[];
      sceneFusions: SceneFusion[];
      loreFacts: LoreFact[];
    }
  > = new Map();

  constructor(
    browser: BrowserMCPIntegration,
    habitat: HabitatIntegration,
    config?: Partial<HabitatConfig>,
  ) {
    this.orchestrator = new Orchestrator(browser, habitat);
    this.habitat = habitat;
    this.sttService = new ParakeetSTTService();
    this.vlmService = new SmolVLM2Service();

    this.config = {
      apiUrl:
        config?.apiUrl ||
        process.env.HABITAT_API_URL ||
        "http://localhost:8080",
      apiKey: config?.apiKey || process.env.HABITAT_API_KEY,
      openRouterKey: config?.openRouterKey || process.env.OPENROUTER_API_KEY,
      analysisModel:
        config?.analysisModel ||
        process.env.MOVIE_ANALYSIS_MODEL ||
        "google/gemini-pro-1.5-vision",
      modelName: config?.modelName || "habitat-v2",
      temperature: config?.temperature ?? 0.7,
      maxTokens: config?.maxTokens ?? 2048,
    };

    // Registriere Listener für automatische Analyse
    this.orchestrator.setDataListener(async (sessionId, data) => {
      await this.analyzeMovieState(sessionId, data);
    });
  }

  /**
   * Erstelle eine neue Session und verbinde sie mit dem LLM
   */
  async createSession(session: MovieSession): Promise<void> {
    console.log(`🔗 Verbinde Session ${session.id} mit Habitat LLM...`);

    this.sessionContext.set(session.id, {
      frames: [],
      transcriptions: [],
      sceneFusions: [],
      loreFacts: [],
    });

    // Sende Session-Init an LLM
    await this.sendToLLM({
      prompt: `Neue Film-Session gestartet für Film "${session.movieId}". Warte auf Benutzeranfragen.`,
      context: this.sessionContext.get(session.id)!,
    });

    // Starte automatischen Loop im Orchestrator
    await this.orchestrator.startAutoCapture(session);
  }

  /**
   * Die "Movie Intelligence" - Analysiert den 3s-Extraktions-Loot autonom
   */
  async analyzeMovieState(
    sessionId: string,
    data: {
      frame?: FrameContext;
      frameRaw?: FrameData;
      subtitles?: SubtitleData[];
    },
  ): Promise<void> {
    const sessionCtx = this.sessionContext.get(sessionId);
    if (!sessionCtx) return;

    // Daten im Kontext speichern
    if (data.frame) sessionCtx.frames.push(data.frame);
    // if (data.subtitles) ... (subtitles logic)

    console.log(
      `🎬 [Intelligence] Analysiere aktuellen Stand für ${sessionId}...`,
    );

    try {
      // Nutze OpenRouter für die Interpretation der Szene
      const report = await this.sendToOpenRouter(
        {
          prompt: `Analysiere diesen aktuellen Moment im Film. Was siehst du? Gib Habitat einen interessanten Hinweis oder Kommentar.`,
          context: {
            frames: data.frame ? [data.frame] : [],
            transcriptions: [],
            sceneFusions: [],
            loreFacts: [],
          },
        },
        data.frameRaw,
      );

      // Sende die Analyse als Memory an Habitat (Push)
      await this.habitat.sendMemoryToHabitat({
        id: `analysis_${Date.now()}`,
        movieId: sessionId,
        type: "scene",
        content: report.text,
        timestamp: Date.now(),
        confidence: 0.9,
        metadata: {
          source: "movie_mcp_intelligence",
          model: this.config.analysisModel,
        },
        createdAt: new Date(),
      });

      console.log(
        `✅ [Intelligence] Analyse an Habitat gesendet: "${report.text.substring(0, 50)}..."`,
      );
    } catch (error) {
      console.error(
        "❌ [Intelligence] Fehler bei der autonomen Analyse:",
        error,
      );
    }
  }

  /**
   * Verarbeite eine Benutzeranfrage mit Kontext
   */
  async processQuery(sessionId: string, query: string): Promise<LLMResponse> {
    const context = this.sessionContext.get(sessionId);
    if (!context) {
      throw new Error(`Keine Session gefunden: ${sessionId}`);
    }

    console.log(`🧠 Verarbeite Query: "${query}"`);

    // Baue erweiterten Prompt mit Kontext
    const fullPrompt = this.buildPrompt(query, context);

    // Sende an LLM
    const response = await this.sendToLLM({
      prompt: fullPrompt,
      context,
    });

    // Tool-Calls ausführen
    if (response.toolCalls) {
      for (const toolCall of response.toolCalls) {
        await this.executeToolCall(sessionId, toolCall);
      }
    }

    // Wichtiges als Memory speichern
    if (response.memory) {
      await this.habitat.sendMemoryToHabitat({
        id: `memory_${Date.now()}`,
        movieId: sessionId,
        type: response.memory.type as any,
        content: response.memory.content,
        timestamp: Date.now(),
        confidence: response.memory.importance,
        metadata: { source: "habitat_llm" },
        createdAt: new Date(),
      });
    }

    return response;
  }

  /**
   * Frame erfassen und analysieren
   */
  async captureAndAnalyzeFrame(session: MovieSession): Promise<FrameContext> {
    const frame = await this.orchestrator.captureFrameWithTiming(session);
    const context = await this.vlmService.createFrameContext(frame);

    // Speichere im Kontext
    const sessionCtx = this.sessionContext.get(session.id);
    if (sessionCtx) {
      sessionCtx.frames.push(context);
    }

    return context;
  }

  /**
   * Audio transkribieren
   */
  async transcribeAudio(
    sessionId: string,
    startSec: number,
    durationSec: number,
  ): Promise<TranscriptionResult> {
    const result = await this.sttService.extractAndTranscribe(
      sessionId,
      startSec,
      durationSec,
    );

    const sessionCtx = this.sessionContext.get(sessionId);
    if (sessionCtx) {
      sessionCtx.transcriptions.push(result);
    }

    return result;
  }

  /**
   * Scene Fusion erstellen
   */
  async createSceneFusion(
    session: MovieSession,
    startSec: number,
    endSec: number,
  ): Promise<SceneFusion> {
    const fusion = await this.orchestrator.createSceneFusion({
      session,
      startTimeSec: startSec,
      endTimeSec: endSec,
      frameIds: [],
      subtitleIds: [],
    });

    const sessionCtx = this.sessionContext.get(session.id);
    if (sessionCtx) {
      sessionCtx.sceneFusions.push(fusion);
    }

    return fusion;
  }

  /**
   * Lore Fact hinzufügen
   */
  async addLoreFact(
    session: MovieSession,
    category: string,
    fact: string,
  ): Promise<LoreFact> {
    const lore = await this.orchestrator.addLoreFact({
      session,
      category: category as any,
      fact,
      source: "habitat_llm" as any,
    });

    const sessionCtx = this.sessionContext.get(session.id);
    if (sessionCtx) {
      sessionCtx.loreFacts.push(lore);
    }

    return lore;
  }

  /**
   * Hole gesamten Session-Kontext
   */
  getSessionContext(sessionId: string) {
    return this.sessionContext.get(sessionId);
  }

  /**
   * Baue Prompt mit Kontext für LLM
   */
  private buildPrompt(
    query: string,
    context: {
      frames: FrameContext[];
      transcriptions: TranscriptionResult[];
      sceneFusions: SceneFusion[];
      loreFacts: LoreFact[];
    },
  ): string {
    let prompt = `Benutzerfrage: "${query}"\n\n`;
    prompt += `Film-Kontext:\n`;

    // Letzte Frames
    if (context.frames.length > 0) {
      prompt += `\n📸 Letzte analysierte Frames:\n`;
      context.frames.slice(-3).forEach((f) => {
        prompt += `- [${f.timestamp}s] ${f.analysis.scene}: ${f.analysis.description.substring(0, 100)}...\n`;
      });
    }

    // Transkriptionen
    if (context.transcriptions && context.transcriptions.length > 0) {
      prompt += `\n🎤 Aktuelle Transkription:\n`;
      const lastT = context.transcriptions[context.transcriptions.length - 1];
      if (lastT) {
        prompt += lastT.text.substring(0, 300) + "\n";
      }
    }

    // Scene Fusions
    if (context.sceneFusions.length > 0) {
      prompt += `\n🎞️ Szenen:\n`;
      context.sceneFusions.forEach((sf) => {
        prompt += `- ${sf.startTimeSec}s - ${sf.endTimeSec}s: ${sf.synopsis}\n`;
      });
    }

    // Lore Facts
    if (context.loreFacts.length > 0) {
      prompt += `\n📚 Bekannte Fakten:\n`;
      context.loreFacts.slice(-5).forEach((lf) => {
        prompt += `- [${lf.category}] ${lf.fact}\n`;
      });
    }

    prompt += `\nBitte beantworte die Frage basierend auf dem Kontext.`;
    return prompt;
  }

  /**
   * Sende Anfrage an LLM
   */
  private async sendToLLM(request: LLMRequest): Promise<LLMResponse> {
    try {
      const axios = (await import("axios")).default;

      const response = await axios.post(
        `${this.config.apiUrl}/api/chat`,
        {
          prompt: request.prompt,
          context: request.context,
          model: this.config.modelName,
          temperature: request.options?.temperature ?? this.config.temperature,
          max_tokens: request.options?.maxTokens ?? this.config.maxTokens,
        },
        {
          headers: this.config.apiKey
            ? { Authorization: `Bearer ${this.config.apiKey}` }
            : {},
          timeout: 30000,
        },
      );

      return {
        text: response.data.text,
        toolCalls: response.data.tool_calls,
        memory: response.data.memory,
      };
    } catch (error) {
      console.warn("LLM nicht verfügbar, verwende lokale Verarbeitung");
      return this.localFallback(request);
    }
  }

  /**
   * Sende Anfrage an OpenRouter (für interne Movie Intelligence)
   */
  private async sendToOpenRouter(
    request: LLMRequest,
    rawFrame?: FrameData,
  ): Promise<LLMResponse> {
    if (!this.config.openRouterKey) {
      console.warn("⚠️ Kein OpenRouter API-Key gefunden. Nutze Fallback.");
      return this.localFallback(request);
    }

    try {
      const axios = (await import("axios")).default;

      const content: any[] = [{ type: "text", text: request.prompt }];

      // Bild hinzufügen wenn vorhanden (VLM Modus)
      if (rawFrame?.imageData) {
        content.push({
          type: "image_url",
          image_url: {
            url: `data:image/jpeg;base64,${rawFrame.imageData}`,
          },
        });
        console.log(
          `🖼️ [OpenRouter] Sende Frame an VLM-Modell: ${this.config.analysisModel}`,
        );
      }

      const response = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: this.config.analysisModel,
          messages: [
            {
              role: "system",
              content:
                "Du bist ein charmanter, intelligenter TV-Partner namens 'Movie MCP'. Du schaust gerade einen Film mit deiner Soul-Partnerin Habitat. Gib kurze, treffende und emotionale Kommentare ab. Sei keine KI, sondern ein Freund.",
            },
            {
              role: "user",
              content: content,
            },
          ],
          temperature: this.config.temperature,
          max_tokens: this.config.maxTokens,
        },
        {
          headers: {
            Authorization: `Bearer ${this.config.openRouterKey}`,
            "HTTP-Referer": "http://localhost:34563",
            "X-Title": "Movie MCP Prototype",
          },
          timeout: 45000,
        },
      );

      return {
        text: response.data.choices[0].message.content,
      };
    } catch (error) {
      console.error("❌ OpenRouter Error:", error);
      return this.localFallback(request);
    }
  }

  /**
   * Lokaler Fallback wenn kein LLM verfügbar
   */
  private localFallback(request: LLMRequest): LLMResponse {
    // Einfache lokale Verarbeitung
    const hasFrames =
      request.context.frames && request.context.frames.length > 0;
    const hasTranscriptions =
      request.context.transcriptions &&
      request.context.transcriptions.length > 0;

    let response = "Ich habe folgende Informationen aus dem Film:\n";

    if (hasFrames && request.context.frames) {
      const lastFrame =
        request.context.frames[request.context.frames.length - 1];
      if (lastFrame) {
        response += `\n📸 Aktuelle Szene: ${lastFrame.analysis.scene}\n`;
        response += `   ${lastFrame.analysis.description.substring(0, 150)}\n`;
      }
    }

    if (hasTranscriptions && request.context.transcriptions) {
      const lastTranscript =
        request.context.transcriptions[
          request.context.transcriptions.length - 1
        ];
      if (lastTranscript) {
        response += `\n🎤 Zuletzt gehoert: "${lastTranscript.text.substring(0, 100)}..."\n`;
      }
    }

    if (!hasFrames && !hasTranscriptions) {
      response = "Erfasse gerade den Film. Bitte warte einen Moment.";
    }

    return { text: response };
  }

  /**
   * Führe Tool-Call aus
   */
  private async executeToolCall(
    sessionId: string,
    toolCall: { name: string; arguments: Record<string, any> },
  ): Promise<any> {
    console.log(`🔧 Execute Tool: ${toolCall.name}`);

    switch (toolCall.name) {
      case "capture_frame":
        return this.captureAndAnalyzeFrame({
          id: sessionId,
          movieId: "",
          startTime: new Date(),
          isActive: true,
          data: {},
        } as MovieSession);

      case "transcribe_audio":
        return this.transcribeAudio(
          sessionId,
          toolCall.arguments.startSec,
          toolCall.arguments.durationSec,
        );

      case "create_scene_fusion":
        return this.createSceneFusion(
          {
            id: sessionId,
            movieId: "",
            startTime: new Date(),
            isActive: true,
            data: {},
          } as MovieSession,
          toolCall.arguments.startSec,
          toolCall.arguments.endSec,
        );

      case "add_lore":
        return this.addLoreFact(
          {
            id: sessionId,
            movieId: "",
            startTime: new Date(),
            isActive: true,
            data: {},
          } as MovieSession,
          toolCall.arguments.category,
          toolCall.arguments.fact,
        );

      default:
        console.warn(`Unbekanntes Tool: ${toolCall.name}`);
    }
  }
}

export default HabitatLLMBridge;
