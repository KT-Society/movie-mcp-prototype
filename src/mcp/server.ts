import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { MovieSession, FrameData, SubtitleData, TranscriptionResult } from '../types/index.js';
import { BrowserMCPIntegration } from '../browser/integration.js';
import { Orchestrator } from '../orchestrator/index.js';
import { NarratorBridge } from '../bridge/habitatBridge.js'; // Dateiname vorerst gleich

export class MovieMCPServer {
  private server: Server;
  private browserIntegration: BrowserMCPIntegration;
  private orchestrator: Orchestrator;
  private narrator: NarratorBridge;
  private activeSessions: Map<string, any> = new Map();

  constructor(
    orchestrator: Orchestrator,
    narrator: NarratorBridge,
    browserIntegration: BrowserMCPIntegration
  ) {
    this.server = new Server(
      {
        name: 'movie-mcp-standalone',
        version: '1.2.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.orchestrator = orchestrator;
    this.narrator = narrator;
    this.browserIntegration = browserIntegration;
    
    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List Tools Handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'start_movie_session',
            description: 'Startet eine neue Film-Session (Standalone)',
            inputSchema: {
              type: 'object',
              properties: {
                movieId: { type: 'string' },
                title: { type: 'string' },
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
            name: 'chat_with_movie',
            description: 'Frage den Movie MCP Narrator basierend auf dem Film-Kontext',
            inputSchema: {
              type: 'object',
              properties: {
                sessionId: { type: 'string' },
                question: { type: 'string', description: 'Deine Frage' }
              },
              required: ['sessionId', 'question']
            }
          },
          {
            name: 'get_session_context',
            description: 'Holt die gesamte History-Matrix für eine Soul (Nyra-Ready)',
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
          case 'chat_with_movie':
            return await this.chatWithMovie(args);
          case 'get_session_context':
            return await this.getSessionContext(args);
          default:
            throw new Error(`Tool ${name} nicht verfügbar oder im Standalone-Modus deaktiviert.`);
        }
      } catch (error: any) {
        return {
          content: [{ type: 'text', text: `Fehler: ${error.message}` }],
          isError: true
        };
      }
    });
  }

  private async startMovieSession(args: any): Promise<any> {
    const { movieId, title, url } = args;
    const sessionId = `movie_${Date.now()}`;
    
    await this.browserIntegration.initialize();
    await this.browserIntegration.navigateToUrl(url);
    
    const sessionObj: any = {
      id: sessionId,
      movieId,
      title,
      url,
      startTime: new Date(),
      isActive: true
    };
    
    this.activeSessions.set(sessionId, sessionObj);
    await this.narrator.createSession(sessionObj as MovieSession);

    return {
      content: [{ type: 'text', text: `Kinoabend gestartet! 🎬\nTitel: ${title}\nSession-ID: ${sessionId}` }]
    };
  }

  private async stopMovieSession(args: any): Promise<any> {
    const { sessionId } = args;
    const session = this.activeSessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} nicht gefunden`);

    session.isActive = false;
    await this.browserIntegration.cleanup();
    
    return {
      content: [{ type: 'text', text: `Session ${session.title} beendet.` }]
    };
  }

  private async chatWithMovie(args: any): Promise<any> {
    const { sessionId, question } = args;
    const response = await this.narrator.processQuery(sessionId, question);
    return {
      content: [{ type: 'text', text: response.text }]
    };
  }

  private async getSessionContext(args: any): Promise<any> {
    const { sessionId } = args;
    const context = this.narrator.getSessionContext(sessionId);
    return {
      content: [{ type: 'text', text: JSON.stringify(context, null, 2) }]
    };
  }

  async startSSE(app: import('express').Application): Promise<void> {
    let transport: SSEServerTransport;
    app.get('/sse', async (req, res) => {
      // Hier fangen wir den Header ab!
      const soulName = req.headers['mcp_soul_name'] || req.query.soulName;
      console.error(`👻 Soul verbunden: ${soulName}`);
      
      transport = new SSEServerTransport('/message', res as any);
      await this.server.connect(transport);
    });

    app.post('/message', async (req, res) => {
      if (transport) await transport.handlePostMessage(req as any, res as any);
      else res.status(503).send('Transport not initialized');
    });
    console.error('🎬 Movie MCP Standalone gestartet! (SSE)');
  }

  async startStdio(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('🎬 Movie MCP Standalone gestartet! (Stdio)');
  }
}