/**
 * Express API Server für Movie MCP Prototype
 * REST, WebSocket und SSE Endpunkte für die Kommunikation
 */

import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import { BrowserMCPIntegration } from "../browser/integration.js";
import { HabitatIntegration } from "../habitat/integration.js";
import { Orchestrator } from "../orchestrator/index.js";
import {
  APIResponse,
  StreamResponse,
  MovieSession,
  BrowserMCPConfig,
  FrameContext,
} from "../types/index.js";
import { HabitatLLMBridge } from "../bridge/habitatBridge.js";

export class APIServer {
  private app: express.Application;
  private server: any;
  private io: SocketIOServer;
  private browserIntegration: BrowserMCPIntegration;
  private orchestrator: Orchestrator;
  private habitatBridge: HabitatLLMBridge;
  private activeSessions: Map<string, MovieSession> = new Map();
  private globalConfig = {
    analysisModel:
      process.env.MOVIE_ANALYSIS_MODEL || "google/gemini-pro-1.5-vision",
  };
  private habitatIntegration: HabitatIntegration;

  constructor(
    orchestrator: Orchestrator,
    habitatBridge: HabitatLLMBridge,
    habitatIntegration: HabitatIntegration,
    browserIntegration: BrowserMCPIntegration,
  ) {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });

    this.browserIntegration = browserIntegration;
    this.habitatIntegration = habitatIntegration;
    this.orchestrator = orchestrator;
    this.habitatBridge = habitatBridge;

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  public getApp(): express.Application {
    return this.app;
  }

  private setupMiddleware(): void {
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(express.json({ limit: "50mb" }));
    this.app.use(express.urlencoded({ extended: true, limit: "50mb" }));
  }

  private setupRoutes(): void {
    // Health Check
    this.app.get("/health", (req, res) => {
      res.json({
        success: true,
        message: "Movie MCP Prototype API läuft! 🎬✨",
        timestamp: new Date(),
        activeSessions: this.activeSessions.size,
        config: this.globalConfig,
      });
    });

    // Configuration Management
    this.app.post("/api/config", (req, res) => {
      const { analysisModel } = req.body;
      if (analysisModel) {
        this.globalConfig.analysisModel = analysisModel;
        // Update bridge config (since it's a prototype, we can reconstruct or add a setter)
        // For simplicity, we just log it and assume the bridge picks it up on next session or via ref
        console.log(`⚙️ Global Analysis Model set to: ${analysisModel}`);
      }
      res.json({ success: true, config: this.globalConfig });
    });

    // Session Management
    this.app.post("/api/sessions", async (req, res) => {
      try {
        const { movieId, title, duration, url } = req.body;

        const sessionId = `session_${Date.now()}`;
        const session: MovieSession = {
          id: sessionId,
          movieId,
          startTime: new Date(),
          isActive: true,
          data: {
            frames: [],
            subtitles: [],
            audio: [],
            memories: [],
          },
        };

        // Browser MCP Integration starten
        await this.browserIntegration.initialize();
        await this.browserIntegration.navigateToUrl(url);

        this.activeSessions.set(sessionId, session);

        // Bridge über neue Session informieren (startet den Loop)
        await this.habitatBridge.createSession(session);

        res.json({
          success: true,
          data: { sessionId, session },
          message: `Film-Session gestartet: ${title}`,
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    this.app.delete("/api/sessions/:sessionId", async (req, res) => {
      try {
        const { sessionId } = req.params;
        const session = this.activeSessions.get(sessionId);

        if (!session) {
          return res.status(404).json({
            success: false,
            error: "Session nicht gefunden",
          });
        }

        session.isActive = false;
        session.endTime = new Date();

        // Browser MCP Integration beenden
        await this.browserIntegration.cleanup();

        this.activeSessions.delete(sessionId);

        return res.json({
          success: true,
          message: "Session beendet",
        });
      } catch (error) {
        return res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Playback State
    this.app.get("/api/sessions/:sessionId/playback", async (req, res) => {
      try {
        const { sessionId } = req.params;
        const session = this.activeSessions.get(sessionId);

        if (!session) {
          return res.status(404).json({
            success: false,
            error: "Session nicht gefunden",
          });
        }

        const playbackState = await this.browserIntegration.getPlaybackState();

        return res.json({
          success: true,
          data: playbackState,
        });
      } catch (error) {
        return res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Frame Capture
    this.app.post("/api/sessions/:sessionId/frames", async (req, res) => {
      try {
        const { sessionId } = req.params;
        const { timestamp } = req.body;

        const session = this.activeSessions.get(sessionId);
        if (!session) {
          return res.status(404).json({
            success: false,
            error: "Session nicht gefunden",
          });
        }

        const frameData = await this.browserIntegration.captureFrame();
        session.data.frames.push(frameData);

        // Frame an alle WebSocket-Clients senden
        this.io.emit("frame_captured", {
          sessionId,
          frame: frameData,
        });

        return res.json({
          success: true,
          data: frameData,
        });
      } catch (error) {
        return res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Subtitles
    this.app.get("/api/sessions/:sessionId/subtitles", async (req, res) => {
      try {
        const { sessionId } = req.params;
        const { timestamp } = req.query;

        const session = this.activeSessions.get(sessionId);
        if (!session) {
          return res.status(404).json({
            success: false,
            error: "Session nicht gefunden",
          });
        }

        const subtitleData = await this.browserIntegration.getSubtitles();
        session.data.subtitles.push(...subtitleData);

        // Untertitel an alle WebSocket-Clients senden
        this.io.emit("subtitle_captured", {
          sessionId,
          subtitle: subtitleData,
        });

        return res.json({
          success: true,
          data: subtitleData,
        });
      } catch (error) {
        return res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Content Analysis
    this.app.post("/api/sessions/:sessionId/analyze", async (req, res) => {
      try {
        const { sessionId } = req.params;
        const { contentType } = req.body;

        const session = this.activeSessions.get(sessionId);
        if (!session) {
          return res.status(404).json({
            success: false,
            error: "Session nicht gefunden",
          });
        }

        const memory = await this.habitatIntegration.analyzeContent(
          sessionId,
          contentType,
        );
        session.data.memories.push(memory);

        // Memory an alle WebSocket-Clients senden
        this.io.emit("memory_created", {
          sessionId,
          memory,
        });

        return res.json({
          success: true,
          data: memory,
        });
      } catch (error) {
        return res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Start Conversation Mode
    this.app.post("/api/sessions/:sessionId/conversation", async (req, res) => {
      try {
        const { sessionId } = req.params;

        const session = this.activeSessions.get(sessionId);
        if (!session) {
          return res.status(404).json({
            success: false,
            error: "Session nicht gefunden",
          });
        }

        await this.habitatIntegration.startConversationMode(sessionId);

        return res.json({
          success: true,
          message: "Gesprächsmodus gestartet",
        });
      } catch (error) {
        return res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Session Data
    this.app.get("/api/sessions/:sessionId/data", (req, res) => {
      const { sessionId } = req.params;
      const session = this.activeSessions.get(sessionId);

      if (!session) {
        return res.status(404).json({
          success: false,
          error: "Session nicht gefunden",
        });
      }

      return res.json({
        success: true,
        data: session,
      });
    });

    // Seek to Time
    this.app.post("/api/sessions/:sessionId/seek", async (req, res) => {
      try {
        const { sessionId } = req.params;
        const { targetTimeSec, method = "exact" } = req.body;

        const session = this.activeSessions.get(sessionId);
        if (!session) {
          return res.status(404).json({
            success: false,
            error: "Session nicht gefunden",
          });
        }

        await this.browserIntegration.seekToTime(targetTimeSec, method);

        const playbackState = await this.browserIntegration.getPlaybackState();

        this.io.emit("seek_completed", {
          sessionId,
          targetTime: targetTimeSec,
          actualTime: playbackState.currentTime,
        });

        return res.json({
          success: true,
          data: {
            targetTimeSec,
            actualTimeSec: playbackState.currentTime,
            method,
          },
        });
      } catch (error) {
        return res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Scene Fusion
    this.app.post(
      "/api/sessions/:sessionId/scene-fusions",
      async (req, res) => {
        try {
          const { sessionId } = req.params;
          const {
            startTimeSec,
            endTimeSec,
            frameIds = [],
            subtitleIds = [],
          } = req.body;

          const session = this.activeSessions.get(sessionId);
          if (!session) {
            return res.status(404).json({
              success: false,
              error: "Session nicht gefunden",
            });
          }

          const fusion = await this.orchestrator.createSceneFusion({
            session,
            startTimeSec,
            endTimeSec,
            frameIds,
            subtitleIds,
          });

          if (!session.data.sceneFusions) {
            session.data.sceneFusions = [];
          }
          session.data.sceneFusions.push(fusion);

          this.io.emit("scene_fusion_created", {
            sessionId,
            fusion,
          });

          return res.json({
            success: true,
            data: fusion,
          });
        } catch (error) {
          return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      },
    );

    this.app.get("/api/sessions/:sessionId/scene-fusions", async (req, res) => {
      try {
        const { sessionId } = req.params;
        const session = this.activeSessions.get(sessionId);

        if (!session) {
          return res.status(404).json({
            success: false,
            error: "Session nicht gefunden",
          });
        }

        const fusions = await this.orchestrator.getSceneFusions(sessionId);

        return res.json({
          success: true,
          data: fusions,
        });
      } catch (error) {
        return res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // Lore Facts
    this.app.post("/api/sessions/:sessionId/lore", async (req, res) => {
      try {
        const { sessionId } = req.params;
        const { category, fact, source, referenceIds = [] } = req.body;

        const session = this.activeSessions.get(sessionId);
        if (!session) {
          return res.status(404).json({
            success: false,
            error: "Session nicht gefunden",
          });
        }

        const loreFact = await this.orchestrator.addLoreFact({
          session,
          category,
          fact,
          source,
          referenceIds,
        });

        if (!session.data.loreFacts) {
          session.data.loreFacts = [];
        }
        session.data.loreFacts.push(loreFact);

        this.io.emit("lore_fact_added", {
          sessionId,
          loreFact,
        });

        return res.json({
          success: true,
          data: loreFact,
        });
      } catch (error) {
        return res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    this.app.get("/api/sessions/:sessionId/lore", async (req, res) => {
      try {
        const { sessionId } = req.params;
        const { category } = req.query;

        const session = this.activeSessions.get(sessionId);
        if (!session) {
          return res.status(404).json({
            success: false,
            error: "Session nicht gefunden",
          });
        }

        const facts = await this.orchestrator.getLoreFacts(
          sessionId,
          category as any,
        );

        return res.json({
          success: true,
          data: facts,
        });
      } catch (error) {
        return res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // STT - Transcribe audio chunk
    this.app.post("/api/sessions/:sessionId/transcribe", async (req, res) => {
      try {
        const { sessionId } = req.params;
        const { startTimeSec, durationSec = 10 } = req.body;

        const session = this.activeSessions.get(sessionId);
        if (!session) {
          return res.status(404).json({
            success: false,
            error: "Session nicht gefunden",
          });
        }

        const result = await this.orchestrator.extractAndTranscribeAudio(
          session,
          startTimeSec,
          durationSec,
        );

        this.io.emit("transcription_completed", {
          sessionId,
          result,
        });

        return res.json({
          success: true,
          data: result,
        });
      } catch (error) {
        return res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // STT - Get transcriptions
    this.app.get(
      "/api/sessions/:sessionId/transcriptions",
      async (req, res) => {
        try {
          const { sessionId } = req.params;

          const session = this.activeSessions.get(sessionId);
          if (!session) {
            return res.status(404).json({
              success: false,
              error: "Session nicht gefunden",
            });
          }

          const transcriptions = await this.orchestrator.getTranscriptions(
            session.movieId,
          );

          return res.json({
            success: true,
            data: transcriptions,
          });
        } catch (error) {
          return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      },
    );

    // STT - Set language
    this.app.post("/api/sessions/:sessionId/stt-language", async (req, res) => {
      try {
        const { sessionId } = req.params;
        const { language } = req.body;

        const session = this.activeSessions.get(sessionId);
        if (!session) {
          return res.status(404).json({
            success: false,
            error: "Session nicht gefunden",
          });
        }

        this.orchestrator.setSTTLanguage(language);

        return res.json({
          success: true,
          message: `STT-Sprache auf ${language} gesetzt`,
        });
      } catch (error) {
        return res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });

    // VLM - Analyze current frame with SmolVLM2
    this.app.post(
      "/api/sessions/:sessionId/analyze-frame",
      async (req, res) => {
        try {
          const { sessionId } = req.params;

          const session = this.activeSessions.get(sessionId);
          if (!session) {
            return res.status(404).json({
              success: false,
              error: "Session nicht gefunden",
            });
          }

          const frameData = await this.browserIntegration.captureFrame();
          session.data.frames.push(frameData);

          const analysis =
            await this.orchestrator.analyzeFrameWithVLM(frameData);

          this.io.emit("frame_analyzed", {
            sessionId,
            frameId: frameData.id,
            analysis,
          });

          return res.json({
            success: true,
            data: {
              frame: frameData,
              analysis,
            },
          });
        } catch (error) {
          return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      },
    );

    // VLM - Get frame contexts
    this.app.get(
      "/api/sessions/:sessionId/frame-contexts",
      async (req, res) => {
        try {
          const { sessionId } = req.params;

          const session = this.activeSessions.get(sessionId);
          if (!session) {
            return res.status(404).json({
              success: false,
              error: "Session nicht gefunden",
            });
          }

          const contexts = await this.orchestrator.getFrameContexts(
            session.movieId,
          );

          return res.json({
            success: true,
            data: contexts,
          });
        } catch (error) {
          return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      },
    );

    // VLM - Batch analyze frames
    this.app.post(
      "/api/sessions/:sessionId/batch-analyze",
      async (req, res) => {
        try {
          const { sessionId } = req.params;

          const session = this.activeSessions.get(sessionId);
          if (!session) {
            return res.status(404).json({
              success: false,
              error: "Session nicht gefunden",
            });
          }

          const frames = session.data.frames;
          if (frames.length === 0) {
            return res.status(400).json({
              success: false,
              error: "Keine Frames für Batch-Analyse verfügbar",
            });
          }

          const contexts = await this.orchestrator.batchAnalyzeFrames(frames);

          this.io.emit("batch_analysis_completed", {
            sessionId,
            contextsCount: contexts.length,
          });

          return res.json({
            success: true,
            data: contexts,
          });
        } catch (error) {
          return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      },
    );
  }

  private setupWebSocket(): void {
    this.io.on("connection", (socket) => {
      console.log("🔌 WebSocket Client verbunden:", socket.id);

      socket.on("join_session", (sessionId) => {
        socket.join(sessionId);
        console.log(`📺 Client ${socket.id} beigetreten Session ${sessionId}`);
      });

      socket.on("leave_session", (sessionId) => {
        socket.leave(sessionId);
        console.log(`📺 Client ${socket.id} verlassen Session ${sessionId}`);
      });

      socket.on("disconnect", () => {
        console.log("🔌 WebSocket Client getrennt:", socket.id);
      });
    });
  }

  async start(port: number = 34563): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(port, () => {
        console.log(`🚀 API Server läuft auf Port ${port}`);
        console.log(`📡 WebSocket Server bereit`);
        console.log(`🎬 Movie MCP Prototype bereit!`);
        resolve();
      });

      this.server.on("error", (error: any) => {
        if (error.code === "EADDRINUSE") {
          console.error(`❌ Port ${port} ist bereits belegt!`);
          console.log(
            `💡 Versuche einen anderen Port oder beende den Prozess auf Port ${port}`,
          );
          reject(new Error(`Port ${port} ist bereits belegt`));
        } else {
          console.error("❌ Server-Fehler:", error);
          reject(error);
        }
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        console.log("🛑 API Server gestoppt");
        resolve();
      });
    });
  }
}
