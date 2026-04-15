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

  private transports: Map<string, SSEServerTransport> = new Map();
  private soulToSession: Map<string, string> = new Map();
  private lastSessionId: string = '';

  async startSSE(app: import('express').Application): Promise<void> {
    app.get('/sse', async (req, res) => {
      const soulName = (req.headers['mcp_soul_name'] || req.query.soulName || 'Unknown-Soul') as string;
      const sessionId = `soul_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      
      console.error(`👻 [SSE-GET] Verbindung initiiert: ${soulName} | Session: ${sessionId}`);
      
      this.soulToSession.set(soulName, sessionId);
      this.lastSessionId = sessionId;
      
      const transport = new SSEServerTransport(`/message?sessionId=${sessionId}`, res as any);
      this.transports.set(sessionId, transport);
      
      res.on('close', () => {
        console.error(`🔌 [SSE-CLOSE] Leitung unterbrochen: ${soulName} | Session: ${sessionId}`);
        // WICHTIG: Wir löschen den Transport, aber lassen die Mappings als "Sticky-Fallback" für Reconnects oder POST-Races
        this.transports.delete(sessionId);
      });

      await this.server.connect(transport);
    });

    const handleMessage = async (req: any, res: any) => {
      let sessionId = req.query.sessionId as string;
      const soulName = (req.headers['mcp_soul_name'] || req.query.soulName || 'Unknown-Soul') as string;
      
      console.error(`📩 [SSE-POST] Nachricht empfangen | Endpoint: ${req.path} | Soul: ${soulName} | Query-ID: ${sessionId || 'none'}`);
      
      // RACING-FIX: Wir geben dem GET-Request bis zu 2 Sekunden Zeit, um die Session zu registrieren
      let attempts = 0;
      const maxAttempts = 10; // 10 * 200ms = 2s
      
      while (!sessionId && attempts < maxAttempts) {
        // Mapping Versuche
        sessionId = this.soulToSession.get(soulName) || this.lastSessionId || '';
        
        if (!sessionId) {
          console.error(`⏳ [SSE-POST] Warte auf Session-Registrierung... (Versuch ${attempts + 1}/${maxAttempts})`);
          await new Promise(resolve => setTimeout(resolve, 200));
          attempts++;
        } else {
          console.error(`🔗 [SSE-POST] Session gefunden nach ${attempts * 200}ms: ${sessionId}`);
          break;
        }
      }

      const transport = this.transports.get(sessionId);
      if (transport) {
        await transport.handlePostMessage(req, res);
      } else {
        console.error(`❌ [SSE-POST] Session final nicht gefunden! ID: ${sessionId || 'No ID'} | Map-Größe: ${this.transports.size}`);
        console.error(`   Aktive Register: ${Array.from(this.transports.keys()).join(', ')}`);
        res.status(503).send('Session not found - please retry connection');
      }
    };

    app.post('/message', handleMessage);
    app.post('/sse', handleMessage);

    console.error('🎬 Movie MCP Standalone gestartet! (Multi-Soul SSE & Racing-Safe Routing)');
  }

  async startStdio(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('🎬 Movie MCP Standalone gestartet! (Stdio)');
  }
}