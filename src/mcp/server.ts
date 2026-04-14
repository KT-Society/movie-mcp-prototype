/**
 * MCP-Server für Movie-Prototype
 * Stdio Transport mit Express HTTP Fallback
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { MovieData, FrameData, SubtitleData, AudioData, PlaybackState, NyraMemory, BrowserMCPConfig, SceneFusion, LoreFact } from '../types/index.js';
import { BrowserMCPIntegration } from '../browser/integration.js';
import { NyraIntegration } from '../nyra/integration.js';
import { Orchestrator } from '../orchestrator/index.js';
import { HabitatLLMBridge } from '../bridge/habitatBridge.js';

export class MovieMCPServer {
  private server: Server;
  private browserIntegration: BrowserMCPIntegration;
  private nyraIntegration: NyraIntegration;
  private orchestrator: Orchestrator;
  private habitatBridge: HabitatLLMBridge;
  private activeSessions: Map<string, any> = new Map();

  constructor() {
    this.server = new Server(
      {
        name: 'movie-mcp-prototype',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    const config: BrowserMCPConfig = {
      headless: false,
      timeout: 30000
    };
    this.browserIntegration = new BrowserMCPIntegration(config);
    this.nyraIntegration = new NyraIntegration();
    this.orchestrator = new Orchestrator(this.browserIntegration, this.nyraIntegration);
    this.habitatBridge = new HabitatLLMBridge(this.browserIntegration, this.nyraIntegration);
    
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List Tools Handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'start_movie_session',
            description: 'Startet eine neue Film-Session für Datenextraktion',
            inputSchema: {
              type: 'object',
              properties: {
                movieId: { type: 'string' },
                title: { type: 'string' },
                duration: { type: 'number' },
                url: { type: 'string' }
              },
              required: ['movieId', 'title', 'url']
            }
          },
          {
            name: 'stop_movie_session',
            description: 'Beendet eine aktive Film-Session',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: { type: 'string' }
              },
              required: ['sessionId']
            }
          },
          {
            name: 'get_playback_state',
            description: 'Holt den aktuellen Playback-Status',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: { type: 'string' }
              },
              required: ['sessionId']
            }
          },
          {
            name: 'capture_frame',
            description: 'Erfasst einen Screenshot vom aktuellen Frame',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: { type: 'string' },
                timestamp: { type: 'number' }
              },
              required: ['sessionId']
            }
          },
          {
            name: 'get_subtitles',
            description: 'Holt aktuelle Untertitel',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: { type: 'string' },
                timestamp: { type: 'number' }
              },
              required: ['sessionId']
            }
          },
          {
            name: 'seek_to_time',
            description: 'Springt zu einer bestimmten Zeitposition im Video',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: { type: 'string' },
                targetTimeSec: { type: 'number', description: 'Zielzeit in Sekunden' },
                method: { type: 'string', enum: ['exact', 'keyframes', 'adaptive'], description: 'Seek-Methode' }
              },
              required: ['sessionId', 'targetTimeSec']
            }
          },
          {
            name: 'create_scene_fusion',
            description: 'Erstellt eine Szenen-Fusion aus Frames und Untertiteln',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: { type: 'string' },
                startTimeSec: { type: 'number' },
                endTimeSec: { type: 'number' },
                frameIds: { type: 'array', items: { type: 'string' } },
                subtitleIds: { type: 'array', items: { type: 'string' } },
                autoGenerate: { type: 'boolean', description: 'Automatisch Synopsis generieren' }
              },
              required: ['sessionId', 'startTimeSec', 'endTimeSec']
            }
          },
          {
            name: 'add_lore_fact',
            description: 'Fügt einen Lore-Fakt zur Wissensbasis hinzu',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: { type: 'string' },
                category: { type: 'string', enum: ['character', 'location', 'object', 'plot', 'trivia'] },
                fact: { type: 'string' },
                source: { type: 'string', enum: ['frame', 'subtitle', 'audio', 'scene-fusion', 'manual'] },
                referenceIds: { type: 'array', items: { type: 'string' } }
              },
              required: ['sessionId', 'category', 'fact', 'source']
            }
          },
          {
            name: 'get_lore_facts',
            description: 'Holt alle Lore-Fakten für eine Session oder einen Film',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: { type: 'string' },
                movieId: { type: 'string' },
                category: { type: 'string', enum: ['character', 'location', 'object', 'plot', 'trivia'] }
              },
              required: ['sessionId']
            }
          },
          {
            name: 'get_scene_fusions',
            description: 'Holt alle Szenen-Fusionen für eine Session',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: { type: 'string' },
                movieId: { type: 'string' }
              },
              required: ['sessionId']
            }
          },
          {
            name: 'analyze_content',
            description: 'Analysiert extrahierte Inhalte für Nyra',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: { type: 'string' },
                contentType: { type: 'string', enum: ['frame', 'subtitle', 'audio'] }
              },
              required: ['sessionId', 'contentType']
            }
          },
          {
            name: 'chat_with_llm',
            description: 'Frage den LLM basierend auf dem Film-Kontext',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: { type: 'string' },
                question: { type: 'string', description: 'Frage zum Film' }
              },
              required: ['sessionId', 'question']
            }
          },
          {
            name: 'get_session_context',
            description: 'Holt den gesamten Session-Kontext für den LLM',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: { type: 'string' }
              },
              required: ['sessionId']
            }
          }
        ]
      };
    });

    // Call Tool Handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'start_movie_session':
            return await this.startMovieSession(args);
          case 'stop_movie_session':
            return await this.stopMovieSession(args);
          case 'get_playback_state':
            return await this.getPlaybackState(args);
          case 'capture_frame':
            return await this.captureFrame(args);
          case 'get_subtitles':
            return await this.getSubtitles(args);
          case 'seek_to_time':
            return await this.seekToTime(args);
          case 'create_scene_fusion':
            return await this.createSceneFusion(args);
          case 'add_lore_fact':
            return await this.addLoreFact(args);
          case 'get_lore_facts':
            return await this.getLoreFacts(args);
          case 'get_scene_fusions':
            return await this.getSceneFusions(args);
          case 'analyze_content':
            return await this.analyzeContent(args);
          case 'chat_with_llm':
            return await this.chatWithLLM(args);
          case 'get_session_context':
            return await this.getSessionContext(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
            }
          ]
        };
      }
    });
  }

  private async startMovieSession(args: any): Promise<any> {
    const { movieId, title, duration, url } = args;
    
    // TODO: Implementiere Session-Erstellung
    const sessionId = `session_${Date.now()}`;
    
    // Browser MCP Integration starten
    await this.browserIntegration.initialize();
    await this.browserIntegration.navigateToUrl(url);
    
    this.activeSessions.set(sessionId, {
      movieId,
      title,
      duration,
      url,
      startTime: new Date(),
      isActive: true
    });

    return {
      content: [
        {
          type: 'text',
          text: `Film-Session gestartet: ${title} (ID: ${sessionId})`
        }
      ]
    };
  }

  private async stopMovieSession(args: any): Promise<any> {
    const { sessionId } = args;
    
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} nicht gefunden`);
    }

    session.isActive = false;
    session.endTime = new Date();
    
    // Browser MCP Integration beenden
    await this.browserIntegration.cleanup();
    
    return {
      content: [
        {
          type: 'text',
          text: `Film-Session beendet: ${session.title}`
        }
      ]
    };
  }

  private async getPlaybackState(args: any): Promise<any> {
    const { sessionId } = args;
    
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} nicht gefunden`);
    }

    // TODO: Implementiere Playback-Status-Abfrage über Browser MCP
    const playbackState = await this.browserIntegration.getPlaybackState();
    
    return {
      content: [
        {
          type: 'text',
          text: `Playback-Status: ${JSON.stringify(playbackState, null, 2)}`
        }
      ]
    };
  }

  private async captureFrame(args: any): Promise<any> {
    const { sessionId, timestamp } = args;
    
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} nicht gefunden`);
    }

    // TODO: Implementiere Frame-Capture über Browser MCP
    const frameData = await this.browserIntegration.captureFrame();
    
    return {
      content: [
        {
          type: 'text',
          text: `Frame erfasst: ${frameData.id}`
        }
      ]
    };
  }

  private async getSubtitles(args: any): Promise<any> {
    const { sessionId, timestamp } = args;
    
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} nicht gefunden`);
    }

    // TODO: Implementiere Untertitel-Extraktion über Browser MCP
    const subtitleData = await this.browserIntegration.getSubtitles();
    
    return {
      content: [
        {
          type: 'text',
          text: `Untertitel extrahiert: ${subtitleData.length} Untertitel gefunden`
        }
      ]
    };
  }

  private async analyzeContent(args: any): Promise<any> {
    const { sessionId, contentType } = args;
    
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} nicht gefunden`);
    }

    const analysis = await this.nyraIntegration.analyzeContent(sessionId, contentType);
    
    return {
      content: [
        {
          type: 'text',
          text: `Content-Analyse abgeschlossen: ${JSON.stringify(analysis, null, 2)}`
        }
      ]
    };
  }

  private async seekToTime(args: any): Promise<any> {
    const { sessionId, targetTimeSec, method = 'exact' } = args;
    
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} nicht gefunden`);
    }

    await this.browserIntegration.seekToTime(targetTimeSec, method);
    
    return {
      content: [
        {
          type: 'text',
          text: `Zu Zeit ${targetTimeSec}s gesprungen (Methode: ${method})`
        }
      ]
    };
  }

  private async createSceneFusion(args: any): Promise<any> {
    const { sessionId, startTimeSec, endTimeSec, frameIds = [], subtitleIds = [], autoGenerate = true } = args;
    
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} nicht gefunden`);
    }

    const fusion = await this.orchestrator.createSceneFusion({
      session,
      startTimeSec,
      endTimeSec,
      frameIds,
      subtitleIds
    });

    if (!session.data.sceneFusions) {
      session.data.sceneFusions = [];
    }
    session.data.sceneFusions.push(fusion);
    
    return {
      content: [
        {
          type: 'text',
          text: `Szenen-Fusion erstellt: ${fusion.id} (${startTimeSec}s - ${endTimeSec}s)`
        }
      ]
    };
  }

  private async addLoreFact(args: any): Promise<any> {
    const { sessionId, category, fact, source, referenceIds = [] } = args;
    
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} nicht gefunden`);
    }

    const loreFact = await this.orchestrator.addLoreFact({
      session,
      category,
      fact,
      source,
      referenceIds
    });

    if (!session.data.loreFacts) {
      session.data.loreFacts = [];
    }
    session.data.loreFacts.push(loreFact);
    
    return {
      content: [
        {
          type: 'text',
          text: `Lore-Fakt hinzugefügt: ${loreFact.id} (${category})`
        }
      ]
    };
  }

  private async getLoreFacts(args: any): Promise<any> {
    const { sessionId, movieId, category } = args;
    
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} nicht gefunden`);
    }

    let facts = session.data.loreFacts || [];
    
    if (category) {
      facts = facts.filter((f: { category: string }) => f.category === category);
    }

    return {
      content: [
        {
          type: 'text',
          text: `${facts.length} Lore-Fakten gefunden:\n${JSON.stringify(facts, null, 2)}`
        }
      ]
    };
  }

  private async getSceneFusions(args: any): Promise<any> {
    const { sessionId, movieId } = args;
    
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} nicht gefunden`);
    }

    const fusions = session.data.sceneFusions || [];

    return {
      content: [
        {
          type: 'text',
          text: `${fusions.length} Szenen-Fusionen gefunden:\n${JSON.stringify(fusions, null, 2)}`
        }
      ]
    };
  }

  private async chatWithLLM(args: any): Promise<any> {
    const { sessionId, question } = args;
    
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} nicht gefunden`);
    }

    try {
      const response = await this.habitatBridge.processQuery(sessionId, question);
      
      return {
        content: [
          {
            type: 'text',
            text: response.text
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Fehler bei LLM-Anfrage: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private async getSessionContext(args: any): Promise<any> {
    const { sessionId } = args;
    
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} nicht gefunden`);
    }

    const context = this.habitatBridge.getSessionContext(sessionId);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(context, null, 2)
        }
      ]
    };
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('🎬 Movie MCP Server gestartet! (Stdio)');
  }
}