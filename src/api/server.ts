/**
 * Express API Server für Movie MCP Prototype
 * REST, WebSocket und SSE Endpunkte für die Kommunikation
 */

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import { BrowserMCPIntegration } from '../browser/integration.js';
import { NyraIntegration } from '../nyra/integration.js';
import { APIResponse, StreamResponse, MovieSession, BrowserMCPConfig } from '../types/index.js';

export class APIServer {
  private app: express.Application;
  private server: any;
  private io: SocketIOServer;
  private browserIntegration: BrowserMCPIntegration;
  private nyraIntegration: NyraIntegration;
  private activeSessions: Map<string, MovieSession> = new Map();

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    const config: BrowserMCPConfig = {
      headless: false,
      timeout: 30000
    };
    this.browserIntegration = new BrowserMCPIntegration(config);
    this.nyraIntegration = new NyraIntegration();

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupMiddleware(): void {
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  }

  private setupRoutes(): void {
    // Health Check
    this.app.get('/health', (req, res) => {
      res.json({
        success: true,
        message: 'Movie MCP Prototype API läuft! 🎬✨',
        timestamp: new Date(),
        activeSessions: this.activeSessions.size
      });
    });

    // Session Management
    this.app.post('/api/sessions', async (req, res) => {
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
            memories: []
          }
        };

        // Browser MCP Integration starten
        await this.browserIntegration.initialize();
        await this.browserIntegration.navigateToUrl(url);
        
        this.activeSessions.set(sessionId, session);

        res.json({
          success: true,
          data: { sessionId, session },
          message: `Film-Session gestartet: ${title}`
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    this.app.delete('/api/sessions/:sessionId', async (req, res) => {
      try {
        const { sessionId } = req.params;
        const session = this.activeSessions.get(sessionId);
        
        if (!session) {
          return res.status(404).json({
            success: false,
            error: 'Session nicht gefunden'
          });
        }

        session.isActive = false;
        session.endTime = new Date();
        
        // Browser MCP Integration beenden
        await this.browserIntegration.cleanup();
        
        this.activeSessions.delete(sessionId);

        return res.json({
          success: true,
          message: 'Session beendet'
        });
      } catch (error) {
        return res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Playback State
    this.app.get('/api/sessions/:sessionId/playback', async (req, res) => {
      try {
        const { sessionId } = req.params;
        const session = this.activeSessions.get(sessionId);
        
        if (!session) {
          return res.status(404).json({
            success: false,
            error: 'Session nicht gefunden'
          });
        }

        const playbackState = await this.browserIntegration.getPlaybackState();
        
        return res.json({
          success: true,
          data: playbackState
        });
      } catch (error) {
        return res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Frame Capture
    this.app.post('/api/sessions/:sessionId/frames', async (req, res) => {
      try {
        const { sessionId } = req.params;
        const { timestamp } = req.body;
        
        const session = this.activeSessions.get(sessionId);
        if (!session) {
          return res.status(404).json({
            success: false,
            error: 'Session nicht gefunden'
          });
        }

        const frameData = await this.browserIntegration.captureFrame();
        session.data.frames.push(frameData);

        // Frame an alle WebSocket-Clients senden
        this.io.emit('frame_captured', {
          sessionId,
          frame: frameData
        });

        return res.json({
          success: true,
          data: frameData
        });
      } catch (error) {
        return res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Subtitles
    this.app.get('/api/sessions/:sessionId/subtitles', async (req, res) => {
      try {
        const { sessionId } = req.params;
        const { timestamp } = req.query;
        
        const session = this.activeSessions.get(sessionId);
        if (!session) {
          return res.status(404).json({
            success: false,
            error: 'Session nicht gefunden'
          });
        }

        const subtitleData = await this.browserIntegration.getSubtitles();
        session.data.subtitles.push(...subtitleData);

        // Untertitel an alle WebSocket-Clients senden
        this.io.emit('subtitle_captured', {
          sessionId,
          subtitle: subtitleData
        });

        return res.json({
          success: true,
          data: subtitleData
        });
      } catch (error) {
        return res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Content Analysis
    this.app.post('/api/sessions/:sessionId/analyze', async (req, res) => {
      try {
        const { sessionId } = req.params;
        const { contentType } = req.body;
        
        const session = this.activeSessions.get(sessionId);
        if (!session) {
          return res.status(404).json({
            success: false,
            error: 'Session nicht gefunden'
          });
        }

        const memory = await this.nyraIntegration.analyzeContent(sessionId, contentType);
        session.data.memories.push(memory);

        // Memory an alle WebSocket-Clients senden
        this.io.emit('memory_created', {
          sessionId,
          memory
        });

        return res.json({
          success: true,
          data: memory
        });
      } catch (error) {
        return res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Start Conversation Mode
    this.app.post('/api/sessions/:sessionId/conversation', async (req, res) => {
      try {
        const { sessionId } = req.params;
        
        const session = this.activeSessions.get(sessionId);
        if (!session) {
          return res.status(404).json({
            success: false,
            error: 'Session nicht gefunden'
          });
        }

        await this.nyraIntegration.startConversationMode(sessionId);

        return res.json({
          success: true,
          message: 'Gesprächsmodus gestartet'
        });
      } catch (error) {
        return res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Session Data
    this.app.get('/api/sessions/:sessionId/data', (req, res) => {
      const { sessionId } = req.params;
      const session = this.activeSessions.get(sessionId);
      
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session nicht gefunden'
        });
      }

      return res.json({
        success: true,
        data: session
      });
    });
  }

  private setupWebSocket(): void {
    this.io.on('connection', (socket) => {
      console.log('🔌 WebSocket Client verbunden:', socket.id);

      socket.on('join_session', (sessionId) => {
        socket.join(sessionId);
        console.log(`📺 Client ${socket.id} beigetreten Session ${sessionId}`);
      });

      socket.on('leave_session', (sessionId) => {
        socket.leave(sessionId);
        console.log(`📺 Client ${socket.id} verlassen Session ${sessionId}`);
      });

      socket.on('disconnect', () => {
        console.log('🔌 WebSocket Client getrennt:', socket.id);
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

      this.server.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`❌ Port ${port} ist bereits belegt!`);
          console.log(`💡 Versuche einen anderen Port oder beende den Prozess auf Port ${port}`);
          reject(new Error(`Port ${port} ist bereits belegt`));
        } else {
          console.error('❌ Server-Fehler:', error);
          reject(error);
        }
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        console.log('🛑 API Server gestoppt');
        resolve();
      });
    });
  }
}