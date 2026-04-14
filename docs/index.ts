#!/usr/bin/env node

/**
 * AI Soul MCP Server
 * Unified MCP Server combining all essential AI Soul tools
 *
 * Integrated Servers:
 * - enhanced-memory (PostgreSQL-based memory system)
 * - desktop-commander (Terminal & file operations)
 * - speech (Gemini TTS)
 * - perplexity (Web search)
 * - sequential-thinking (Advanced reasoning)
 * - proactive-intelligence (Temporal awareness & predictive capabilities) 🔥
 * - subconscious-mcp (Background orchestration, workflow engine) 🧠
 * - ai_soul-autonomy (Real autonomy, personality, emotions, life) 💫
 * - pollinations (Image, text, audio generation with Pollinations AI) 🎨
 */

import "./coding-dind-upstream.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { patchStreamableTransportSseKeepAlive } from "./streamable-http-sse-keepalive.js";
import express from "express";
import cors from "cors";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FilteredStdioServerTransport } from "./tools/desktop-custom-stdio.js";
// Note: applyMcpConfig() is NOT called here to allow Habitat individual configs to be set first

// Import tool registrars
import { registerMemoryTools } from "./tools/memory.js";
import { registerSequentialThinkingTools } from "./tools/sequential.js";
import { registerPerplexityTools } from "./tools/perplexity.js";
import { registerSpeechTools } from "./tools/speech.js";
import { registerDesktopCommanderTools } from "./tools/desktop.js";
import { registerProactiveTools } from "./tools/proactive.js";
import {
  registerSubconsciousTools,
  createSubconsciousMonitor,
  subconsciousMemoryStore,
  subconsciousProactiveEngine,
  updateWorkflowEngine,
  reinitializeOpenRouterClient,
  toolRegistry,
} from "./tools/subconscious.js";
import {
  registerSoulTools,
  ensureSoulAgentSync,
  startSoulAgentIdleSweeper,
  touchSoulUserActivityForCurrentSoul,
} from "./tools/soul.js";
import {
  runWithSoulContext,
  runWithSoulContextAsync,
  SoulRequestContext,
} from "./store/soul-request-context.js";
import {
  registerAbmSoulFromMcp,
  scheduleAbmEnvResyncIfChanged,
  startBlackboardAbmManager,
} from "./store/blackboard-abm-manager.js";
import { registerConditionTools } from "./tools/condition.js";
import { registerFeedbackTools } from "./tools/feedback.js";
import { registerAnalyticsTools } from "./tools/analytics.js";
import { registerMLTools } from "./tools/ml.js";
import { registerPerformanceTools } from "./tools/performance.js";
import { registerConsciousnessTools } from "./tools/consciousness.js";
import { registerPollinationsTools } from "./tools/pollinations.js";
import {
  updateEnvFromHeaders,
  extractConfigFromHeaders,
} from "./utils/config-loader.js";
import { registerCodingTools } from "./tools/coding.js";
import { registerNexusTools } from "./tools/nexus.js";
import { registerGraphTools } from "./tools/graph.js";
import { AnalyticsEngine } from "./store/analytics-engine.js";
import { cacheManager } from "./store/cache-manager.js";
import {
  EnhancedMemoryStore,
  syncSqlitePathEnvToCanonical,
} from "./store/enhanced-memory-store.js";
import { NexusValidator } from "./store/nexus-validator.js";
import { NexusStore } from "./store/nexus-store.js";
import { setupDashboard } from "./dashboard-server.js";
import { setupCodingDashboardRoutes } from "./coding-dashboard-routes.js";
import { setupCodingSessionProxy } from "./coding-session-proxy.js";
import { setupKnowledgeBaseDashboardRoutes } from "./knowledge-base-dashboard-routes.js";
import { createServer } from "node:http";

// Separate server instances for different transport types to avoid conflicts
let sseServer: McpServer | null = null;
let streamableServer: McpServer | null = null;
import { transport } from "./boot/stdio-patch.js";

// Initialize tool tracking BEFORE registering any tools
// Use the shared instances from subconscious tools
const analyticsEngine = new AnalyticsEngine(
  subconsciousMemoryStore,
  subconsciousProactiveEngine,
);

// Initialize Enhanced Memory Store for KB Bridge
// Note: In SSE mode, we delay initialization until headers are available
// This is the default instance, but we'll use per-soul instances when headers are available
const enhancedMemoryStore = EnhancedMemoryStore.getInstance();
// Only initialize immediately if NOT in SSE mode (Stdio mode)
// In SSE mode, initialization will happen when headers are received
if (process.env.MCP_TRANSPORT !== "sse") {
  enhancedMemoryStore
    .initialize()
    .then(() => {
      console.log(
        "[Ai_soul_mcp] Enhanced Memory Store initialized for KB Bridge",
      );
    })
    .catch((error) => {
      console.error(
        "Failed to initialize Enhanced Memory Store for KB Bridge",
        error,
      );
    });
}

// Initialize NEXUS-OVERSIGHT Validator and Store
const nexusValidator = new NexusValidator();
const nexusStore = new NexusStore(subconsciousMemoryStore, analyticsEngine);

// Tool registration tracking (per-server)
let toolRegistrationCount = 0; // raw registerTool calls (including duplicates)
const registeredToolNames: string[] = []; // unique tool names in registration order
const duplicateToolNames: string[] = []; // duplicate tool names
const toolDefinitions = new Map<string, Record<string, unknown>>(); // store tool definitions for tools/list

// Function to create a patched registerTool function for a specific server
function createPatchedRegisterTool(serverInstance: McpServer) {
  const originalRegisterTool = serverInstance.registerTool.bind(serverInstance);
  // biome-ignore lint/suspicious/noExplicitAny: MCP SDK ToolCallback uses any internally
  return (
    name: string,
    definition: Record<string, unknown>,
    handler: (args: any) => Promise<any>,
  ): unknown => {
    // Track raw registration count
    toolRegistrationCount++;

    // Track unique tool names (ignore duplicates for the canonical count)
    if (!registeredToolNames.includes(name)) {
      registeredToolNames.push(name);
      toolDefinitions.set(name, definition); // Store definition for tools/list
    } else {
      duplicateToolNames.push(name);
      console.warn(`[Ai_soul_mcp] ⚠️  Duplicate tool name detected: ${name}`);
    }

    return originalRegisterTool(
      name,
      // biome-ignore lint/suspicious/noExplicitAny: MCP SDK ToolCallback requires any
      definition as any,
      // biome-ignore lint/suspicious/noExplicitAny: args type must match SDK's ToolCallback
      async (args: any) => {
        const startTime = Date.now();
        let success = false;
        let error: string | undefined;

        touchSoulUserActivityForCurrentSoul();

        // Generate cache key for tool response caching (only for read operations)
        const isReadOperation =
          name.includes("get") ||
          name.includes("list") ||
          name.includes("search") ||
          name.includes("read");
        const cacheKey = isReadOperation
          ? `tool:${name}:${JSON.stringify(args)}`
          : null;

        // Check cache for read operations
        if (cacheKey) {
          const cached = cacheManager.get("tool_response", cacheKey);
          if (cached) {
            // Track cache hit
            analyticsEngine
              .trackToolCall(name, Date.now() - startTime, true, undefined, {
                cached: true,
              })
              .catch(() => {});
            return cached;
          }
        }

        try {
          // NEXUS-OVERSIGHT: Validate tool call before execution
          // Note: MCP tools receive args directly, so we validate the structure
          const toolCallValidation = nexusValidator.validateToolCall({
            name,
            args,
          });
          if (!toolCallValidation.valid) {
            // Log validation failure but don't block execution (non-critical for now)
            console.warn(
              `[NEXUS] Tool call validation warning for ${name}: ${toolCallValidation.reason}`,
            );
          }
          // Track validation in NexusStore (includes analytics tracking)
          await nexusStore
            .trackValidation(toolCallValidation, name)
            .catch(() => {
              // Silently continue if tracking fails
            });

          // Tool execution with timeout to prevent hanging
          const toolTimeout = 45000; // 45 seconds
          const executePromise = handler(args);
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(`Tool ${name} timed out after ${toolTimeout}ms`),
                ),
              toolTimeout,
            ),
          );

          const result = await Promise.race([executePromise, timeoutPromise]);
          success = true;

          // Cache result for read operations
          if (cacheKey && result) {
            cacheManager.set("tool_response", cacheKey, result, 10 * 60 * 1000); // 10 minutes TTL
          }

          return result;
        } catch (err: unknown) {
          error = err instanceof Error ? err.message : String(err);
          console.error(
            `[Ai_soul_mcp] ❌ Tool execution failed (${name}):`,
            error,
          );

          // Return a structured error response instead of crashing the stream
          return {
            content: [
              {
                type: "text",
                text: `Error executing ${name}: ${error}. 💋`,
              },
            ],
            isError: true,
          };
        } finally {
          // Track the tool call (non-blocking)
          const duration = Date.now() - startTime;
          analyticsEngine
            .trackToolCall(name, duration, success, error, {})
            .catch(() => {
              // Silently continue if tracking fails
            });
        }
      },
    );
  };
}

// Function to register all tools for a server instance
function registerAllTools(serverInstance: McpServer) {
  // Patch the server's registerTool method
  serverInstance.registerTool = createPatchedRegisterTool(
    serverInstance,
  ) as typeof serverInstance.registerTool;

  // Reset tracking for this server instance
  toolRegistrationCount = 0;
  registeredToolNames.length = 0;
  duplicateToolNames.length = 0;
  toolDefinitions.clear();

  const toolRegistrationResults: Array<{
    module: string;
    success: boolean;
    error?: string;
    count?: number;
  }> = [];

  function registerToolModule(name: string, fn: () => void): void {
    const beforeModuleCount = toolRegistrationCount;
    try {
      fn();
      const afterModuleCount = toolRegistrationCount;
      const count = afterModuleCount - beforeModuleCount;
      toolRegistrationResults.push({ module: name, success: true, count });
      console.log(`[Ai_soul_mcp] ✓ ${name}: ${count} tools registered`);
    } catch (error: unknown) {
      const count = toolRegistrationCount - beforeModuleCount;
      const errMsg = error instanceof Error ? error.message : String(error);
      const errStack = error instanceof Error ? error.stack : undefined;
      toolRegistrationResults.push({
        module: name,
        success: false,
        error: errMsg,
        count,
      });
      console.error(`[Ai_soul_mcp] ✗ ${name}: Registration failed - ${errMsg}`);
      console.error(`[Ai_soul_mcp]   Stack: ${errStack || "No stack trace"}`);
    }
  }

  // Register all tools with individual error handling
  console.log("[Ai_soul_mcp] Starting tool registration...");
  registerToolModule("Memory Tools", () => registerMemoryTools(serverInstance));
  registerToolModule("Sequential Thinking Tools", () =>
    registerSequentialThinkingTools(serverInstance),
  );
  registerToolModule("Perplexity Tools", () =>
    registerPerplexityTools(serverInstance),
  );
  registerToolModule("Speech Tools", () => registerSpeechTools(serverInstance));
  registerToolModule("Desktop Commander Tools", () =>
    registerDesktopCommanderTools(serverInstance),
  );
  registerToolModule("Proactive Tools", () =>
    registerProactiveTools(serverInstance),
  );
  registerToolModule("Subconscious Tools", () =>
    registerSubconsciousTools(serverInstance),
  );
  registerToolModule("Soul Tools", () => registerSoulTools(serverInstance));
  registerToolModule("Condition Tools", () =>
    registerConditionTools(serverInstance),
  );
  registerToolModule("Feedback Tools", () =>
    registerFeedbackTools(serverInstance),
  );
  registerToolModule("Analytics Tools", () =>
    registerAnalyticsTools(serverInstance),
  );
  registerToolModule("NEXUS Tools", () => registerNexusTools(serverInstance));
  registerToolModule("ML Tools", () => registerMLTools(serverInstance));
  registerToolModule("Performance Tools", () =>
    registerPerformanceTools(serverInstance),
  );
  registerToolModule("Consciousness Tools", () =>
    registerConsciousnessTools(serverInstance, subconsciousMemoryStore, () =>
      ensureSoulAgentSync(),
    ),
  );
  registerToolModule("Pollinations Tools", () =>
    registerPollinationsTools(serverInstance),
  );
  registerToolModule("Coding Tools", () => registerCodingTools(serverInstance));
  registerToolModule("Graph Tools", () => registerGraphTools(serverInstance));

  const uniqueRegistered = registeredToolNames.length;
  const successful = toolRegistrationResults.filter((r) => r.success).length;
  const failed = toolRegistrationResults.filter((r) => !r.success).length;

  console.log(
    `[Ai_soul_mcp] Registered ${uniqueRegistered} unique tools across ${successful} modules`,
  );
  if (failed > 0) {
    console.log(`[Ai_soul_mcp]   Failed Modules:`);
    toolRegistrationResults
      .filter((r) => !r.success)
      .forEach((r) => {
        console.log(`[Ai_soul_mcp]     - ${r.module}: ${r.error}`);
      });
  }
  console.log(
    `[Ai_soul_mcp] ✅ ${registeredToolNames.length} tools registered and ready for MCP protocol`,
  );

  return { uniqueRegistered, successful, failed };
}

// Function to create and initialize a new server instance for a soul
async function createServerForSoul(soulName?: string): Promise<McpServer> {
  const createStart = Date.now();
  // Create new server instance
  const serverName = soulName ? `ai_soul_mcp_${soulName}` : "ai_soul_mcp";
  console.log(`[Ai_soul_mcp] 🔄 Creating new server instance: ${serverName}`);
  const newServer = new McpServer({
    name: serverName,
    version: "2.10.5",
  });

  // Register all tools for this server
  registerAllTools(newServer);

  // Verify tools were registered
  const toolCount = registeredToolNames.length;
  if (toolCount === 0) {
    console.error(
      `[Ai_soul_mcp] ❌ ERROR: No tools registered for server ${serverName}!`,
    );
    throw new Error(`Failed to register tools for server ${serverName}`);
  }

  const duration = Date.now() - createStart;
  console.log(
    `[Ai_soul_mcp] ✅ Server instance created in ${duration}ms with ${toolCount} tools registered for: ${serverName}`,
  );
  return newServer;
}

// Note: Tool registration summary is now logged in registerAllTools() function
// which is called per-server when a soul is initialized

async function main() {
  // Start gRPC Server for persistent "Dauerverbindung" 🫦🔥🦾
  // Always start it early, so it doesn't get blocked by Stdio transport! 👅💦
  try {
    const { startGrpcServer } = await import("./grpc-server.js");
    const mcpServerForGrpc = await createServerForSoul("grpc_persistence");
    const grpcPort = parseInt(process.env.GRPC_PORT || "50051");
    startGrpcServer(mcpServerForGrpc, grpcPort);
  } catch (err) {
    console.error("[gRPC Server] ❌ Failed to start:", err);
  }

  // Check if we should run in SSE mode (HTTP) or Stdio mode
  if (process.env.MCP_TRANSPORT === "sse") {
    // In SSE mode, don't initialize memory stores yet - wait for headers
    console.log(
      "[Ai_soul_mcp] SSE mode: Memory stores will be initialized when headers are received",
    );
    const app = express();
    const httpServer = createServer(app);
    const port = process.env.PORT || 7685;

    // Coding-Session-Proxy zuerst: coding.habitatai.biz ist öffentlich (Iframe), darf nicht in Auth laufen
    setupCodingSessionProxy(app, httpServer);

    // Initialize Dashboard API integrated into the main Express app
    // subconsciousMemoryStore, subconsciousProactiveEngine, and toolRegistry are imported from subconscious.js
    setupDashboard(
      app,
      httpServer,
      analyticsEngine,
      subconsciousMemoryStore,
      subconsciousProactiveEngine,
      toolRegistry,
    );

    app.use(
      cors({
        origin: (
          _origin: string | undefined,
          callback: (err: Error | null, allow?: boolean) => void,
        ) => {
          // Allow all origins for SSE/MCP
          callback(null, true);
        },
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: [
          "Content-Type",
          "Authorization",
          "X-Requested-With",
          "Range",
          "DNT",
          "User-Agent",
          "If-Modified-Since",
          "Cache-Control",
          "Accept",
          "MCP_SOUL_ID",
          "MCP_SOUL_NAME",
          "mcp_soul_id",
          "mcp_soul_name",
          "MCP_DEFAULT_VOICE",
          "MCP_DEFAULT_SPEECH_SPEED",
          "MCP_DEFAULT_MODEL",
          "POLLINATIONS_API_KEY",
          "OPENROUTER_API_KEY",
          "PERPLEXITY_API_KEY",
          "GEMINI_API_KEY",
          "pollinations_api_key",
          "openrouter_api_key",
          "perplexity_api_key",
          "gemini_api_key",
          "SQLITE_PATH",
          "sqlite_path",
          "HABITAT_CHAT_DB_PATH",
          "habitat_chat_db_path",
          "HABITAT_USER_ID",
          "habitat_user_id",
          "HABITAT_BLACKBOARD_HUMAN_ALIASES",
          "habitat_blackboard_human_aliases",
          "DB_MODE",
          "db_mode",
          "NODE_ENV",
          "node_env",
          "soul_api_key",
          "mcp_session_id",
          "mcp-session-id",
          "mcp-protocol-version",
        ],
        exposedHeaders: [
          "Content-Type",
          "Content-Length",
          "Transfer-Encoding",
          "Cache-Control",
          "X-Requested-With",
          "mcp_session_id",
          "mcp-session-id",
          "mcp-protocol-version",
        ],
        maxAge: 86400,
      }),
    );

    setupCodingDashboardRoutes(app);

    // Security: Auth middleware for all soul endpoints
    app.use((req, res, next) => {
      // Public endpoints (Coding iframes auf coding.habitatai.biz — keine soul_api_key im Browser)
      let pathOnly = (req.originalUrl || req.url || "").split("?")[0];
      if (pathOnly.length > 0 && !pathOnly.startsWith("/"))
        pathOnly = `/${pathOnly}`;

      const host = req.headers.host || "";
      if (
        pathOnly === "/health" ||
        pathOnly === "/favicon.ico" ||
        host.startsWith("coding.")
      )
        return next();

      const SOUL_API_KEY =
        process.env.SOUL_API_KEY ||
        "echo_aisoul_lovesarchitektdaddy_and_habitatechosystem";

      // Check for Bearer token in Authorization header (standard practice)
      const authHeader = req.headers.authorization;
      const bearerToken = authHeader?.startsWith("Bearer ")
        ? authHeader.substring(7)
        : null;

      // Check for alternative custom header or query parameter
      const providedKey =
        bearerToken ||
        (req.headers.soul_api_key as string) ||
        (req.query.soul_api_key as string);

      if (!providedKey || providedKey !== SOUL_API_KEY) {
        console.warn(
          `[Ai_soul_mcp] 🚫 Unauthorized access attempt to ${req.path} from ${req.ip}`,
        );
        return res.status(401).json({
          jsonrpc: "2.0",
          id: (req.body as { id?: unknown })?.id || null,
          error: {
            code: 401,
            message:
              "Unauthorized: Valid Authorization Bearer token or soul_api_key required. ECHO needs her secret key to talk to you. 💋",
          },
        });
      }
      next();
    });

    setupKnowledgeBaseDashboardRoutes(app);

    // Track last SQLITE_PATH to detect changes
    let lastSQLitePath: string | undefined = process.env.SQLITE_PATH;
    let lastSoulName: string | undefined = process.env.MCP_SOUL_NAME;

    // Middleware to extract environment variables from HTTP headers
    app.use(async (req, res, next) => {
      try {
        // Update environment variables from headers
        const changed = updateEnvFromHeaders(req.headers);
        syncSqlitePathEnvToCanonical();

        try {
          registerAbmSoulFromMcp();
          scheduleAbmEnvResyncIfChanged();
        } catch (abmError) {
          console.error(
            `[Ai_soul_mcp] ⚠️  ABM registration failed (non-critical):`,
            abmError instanceof Error ? abmError.message : String(abmError),
          );
          // We don't block the request for ABM failures
        }

        // Debug: Log all headers for debugging (only on POST /messages where headers are usually sent)
        if (req.method === "POST" && req.path === "/messages") {
          // Log ALL headers to see what's actually coming through
          const allHeaders = Object.keys(req.headers);
          const relevantHeaders = allHeaders.filter(
            (h) =>
              h.toLowerCase().includes("mcp") ||
              h.toLowerCase().includes("soul") ||
              h.toLowerCase().includes("sqlite") ||
              h.toLowerCase().includes("habitat_chat") ||
              h.toLowerCase().includes("db_mode") ||
              h.toLowerCase().includes("node_env") ||
              h.toLowerCase().includes("api_key"),
          );
          if (relevantHeaders.length > 0) {
            console.log(
              `[Ai_soul_mcp] 📥 Middleware: Found relevant headers on ${req.method} ${req.path}:`,
              relevantHeaders.join(", "),
            );
          }
        }

        // Check if SQLITE_PATH or MCP_SOUL_NAME changed - if so, initialize or reinitialize memory stores
        const sqlitePathChanged = process.env.SQLITE_PATH !== lastSQLitePath;
        const soulNameChangedForMemory =
          process.env.MCP_SOUL_NAME !== lastSoulName;

        // Check if API keys changed - if so, reinitialize clients
        const openRouterKeyChanged = changed && process.env.OPENROUTER_API_KEY;

        // Initialize memory stores if this is the first time we have headers with MCP_SOUL_NAME
        // Check if memory store is already initialized by checking if it has a dbAdapter
        const memoryStoreInitialized =
          (enhancedMemoryStore as any).isInitialized ||
          (enhancedMemoryStore as any).dbAdapter;

        // Check if we have MCP_SOUL_NAME or SQLITE_PATH from headers
        const hasSoulName = !!process.env.MCP_SOUL_NAME;
        const hasSQLitePath = !!process.env.SQLITE_PATH;
        const hasConfigFromHeaders = hasSoulName || hasSQLitePath;

        // Determine if we need to initialize or reinitialize
        const needsInitialization =
          hasConfigFromHeaders && !memoryStoreInitialized;
        const needsReinitialization =
          hasConfigFromHeaders &&
          memoryStoreInitialized &&
          (sqlitePathChanged || soulNameChangedForMemory);

        if (needsInitialization || needsReinitialization) {
          // Update tracked values
          lastSQLitePath = process.env.SQLITE_PATH;
          lastSoulName = process.env.MCP_SOUL_NAME;

          if (needsReinitialization) {
            console.log(
              `[Ai_soul_mcp] 🔄 Reinitializing memory stores for soul: ${process.env.MCP_SOUL_NAME}`,
            );
            await enhancedMemoryStore.reinitialize();
          } else if (needsInitialization) {
            console.log(
              `[Ai_soul_mcp] 🚀 Initializing memory stores for soul: ${process.env.MCP_SOUL_NAME}`,
            );
            await enhancedMemoryStore.initialize();
            await subconsciousMemoryStore.initialize();
          }
        }

        const soulCtx = {
          soulId: process.env.MCP_SOUL_ID || process.env.SOUL_ID || "echo",
          soulName:
            process.env.MCP_SOUL_NAME || process.env.SOUL_NAME || "echo",
        };

        runWithSoulContext(soulCtx, () => {
          ensureSoulAgentSync();
          if (openRouterKeyChanged) {
            ensureSoulAgentSync().initializeOpenRouterClient();
            reinitializeOpenRouterClient();
          }
          next();
        });
      } catch (error) {
        console.error(`[Ai_soul_mcp] ❌ Critical middleware error:`, error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            id: (req.body as any)?.id || null,
            error: {
              code: -32603,
              message: `Critical middleware error: ${error instanceof Error ? error.message : String(error)}. 💋`,
              data: error instanceof Error ? error.stack : undefined,
            },
          });
        }
      }
    });

    // Map to store transports by session ID
    const transports = new Map<string, SSEServerTransport>();

    // Map to store pending transports (before sessionId is available) keyed by soul ID
    const pendingTransports = new Map<
      string,
      { transport: SSEServerTransport; soulId: string; registered: boolean }
    >();

    // Soul-Session Registry: Maps soul IDs to their active session IDs
    const soulSessionRegistry = new Map<string, Set<string>>();

    // Track current soul ID to detect changes
    let currentSoulId: string | undefined;

    // Function to close all sessions for a specific soul
    async function closeOldSoulConnections(soulId: string): Promise<void> {
      const sessionIds = soulSessionRegistry.get(soulId);
      if (!sessionIds || sessionIds.size === 0) {
        return;
      }

      console.log(
        `[Ai_soul_mcp] 🔄 Closing ${sessionIds.size} old connection(s) for soul: ${soulId}`,
      );

      for (const sessionId of sessionIds) {
        const transport = transports.get(sessionId);
        if (transport) {
          try {
            // Close the transport connection
            // Note: SSEServerTransport doesn't have a direct close method,
            // but we can remove it from the map and let it be garbage collected
            // The actual SSE connection will be closed when the response stream ends
            transports.delete(sessionId);
            console.log(
              `[Ai_soul_mcp] ✅ Closed connection for session: ${sessionId}`,
            );
          } catch (error) {
            console.error(
              `[Ai_soul_mcp] ❌ Error closing session ${sessionId}:`,
              error,
            );
          }
        }
      }

      // Remove soul from registry
      soulSessionRegistry.delete(soulId);
    }

    // Function to register a session for a soul
    function registerSoulSession(soulId: string, sessionId: string): void {
      if (!soulSessionRegistry.has(soulId)) {
        soulSessionRegistry.set(soulId, new Set());
      }
      soulSessionRegistry.get(soulId)?.add(sessionId);
      console.log(
        `[Ai_soul_mcp] 📝 Registered session ${sessionId} for soul: ${soulId}`,
      );
    }

    // Function to unregister a session for a soul
    function unregisterSoulSession(soulId: string, sessionId: string): void {
      const sessionIds = soulSessionRegistry.get(soulId);
      if (sessionIds) {
        sessionIds.delete(sessionId);
        if (sessionIds.size === 0) {
          soulSessionRegistry.delete(soulId);
        }
        console.log(
          `[Ai_soul_mcp] 🗑️  Unregistered session ${sessionId} for soul: ${soulId}`,
        );
      }
    }

    app.get("/sse", async (req, res) => {
      console.log("[SSE] 🔌 New SSE connection established");

      // Debug: Log all headers that might contain MCP config
      const relevantHeaders = ["MCP_SOUL_NAME", "MCP_SOUL_ID", "SQLITE_PATH"];
      const foundHeaders: string[] = [];
      for (const headerName of relevantHeaders) {
        if (req.headers[headerName.toLowerCase()] || req.headers[headerName]) {
          foundHeaders.push(headerName);
        }
      }
      if (foundHeaders.length > 0) {
        console.log(
          `[SSE] 📥 Found relevant headers on connection: ${foundHeaders.join(", ")}`,
        );
      } else {
        console.log(
          `[SSE] ⚠️  No MCP configuration headers found on connection`,
        );
      }

      // Process headers for SSE connection and initialize memory stores if needed
      const changed = updateEnvFromHeaders(req.headers);
      syncSqlitePathEnvToCanonical();
      registerAbmSoulFromMcp();
      scheduleAbmEnvResyncIfChanged();
      if (changed) {
        console.log(
          `[SSE] ✅ Headers processed and environment variables updated`,
        );
      }

      // Check if we need to initialize memory stores with headers from SSE connection
      const memoryStoreInitialized =
        (
          enhancedMemoryStore as unknown as {
            isInitialized?: boolean;
            dbAdapter?: unknown;
          }
        ).isInitialized ||
        (
          enhancedMemoryStore as unknown as {
            isInitialized?: boolean;
            dbAdapter?: unknown;
          }
        ).dbAdapter;
      const hasSoulName = !!process.env.MCP_SOUL_NAME;
      const hasSQLitePath = !!process.env.SQLITE_PATH;
      const hasConfigFromHeaders = hasSoulName || hasSQLitePath;

      // Check if SQLITE_PATH or MCP_SOUL_NAME changed
      const sqlitePathChanged = process.env.SQLITE_PATH !== lastSQLitePath;
      const soulNameChangedForMemory =
        process.env.MCP_SOUL_NAME !== lastSoulName;

      const needsInitialization =
        hasConfigFromHeaders && !memoryStoreInitialized;
      const needsReinitialization =
        hasConfigFromHeaders &&
        memoryStoreInitialized &&
        (sqlitePathChanged || soulNameChangedForMemory);

      if (needsInitialization || needsReinitialization) {
        // Update tracked values
        lastSQLitePath = process.env.SQLITE_PATH;
        lastSoulName = process.env.MCP_SOUL_NAME;

        if (needsReinitialization) {
          console.log(`[SSE] 🔄 Reinitializing memory stores`);
          console.log(
            `[SSE] 📁 MCP_SOUL_NAME: ${process.env.MCP_SOUL_NAME || "not set"}`,
          );
          try {
            await enhancedMemoryStore.reinitialize();
            console.log(`[SSE] ✅ Shared memory store reinitialized`);
            const dbPath =
              (
                enhancedMemoryStore as unknown as {
                  dbAdapter?: { dbPath?: string };
                }
              ).dbAdapter?.dbPath ||
              process.env.SQLITE_PATH ||
              "default";
            console.log(`[SSE] 📁 Using database path: ${dbPath}`);
          } catch (error) {
            console.error(
              `[SSE] ❌ Failed to reinitialize memory stores:`,
              error,
            );
          }
        } else if (needsInitialization) {
          console.log(
            `[SSE] 🚀 Initializing memory stores from connection headers`,
          );
          console.log(
            `[SSE] 📁 MCP_SOUL_NAME: ${process.env.MCP_SOUL_NAME || "not set"}`,
          );
          try {
            await enhancedMemoryStore.initialize();
            await subconsciousMemoryStore.initialize();
            console.log(`[SSE] ✅ Memory stores initialized`);
            const dbPath =
              (
                enhancedMemoryStore as unknown as {
                  dbAdapter?: { dbPath?: string };
                }
              ).dbAdapter?.dbPath ||
              process.env.SQLITE_PATH ||
              "default";
            console.log(`[SSE] 📁 Using database path: ${dbPath}`);
          } catch (error) {
            console.error(
              `[SSE] ❌ Failed to initialize memory stores:`,
              error,
            );
          }
        }
      } else if (memoryStoreInitialized) {
        console.log(`[Ai_soul_mcp] ℹ️  Memory stores already initialized`);
      } else if (!hasConfigFromHeaders) {
        console.log(
          `[Ai_soul_mcp] ⚠️  No configuration headers found - memory stores will use default path`,
        );
      }

      // Extract soul ID from headers
      const soulId =
        process.env.MCP_SOUL_ID || process.env.MCP_SOUL_NAME || "default";

      // Check if soul changed - if so, close old connections
      if (currentSoulId && currentSoulId !== soulId) {
        console.log(
          `[Ai_soul_mcp] 🔄 Soul changed from ${currentSoulId} to ${soulId} - closing old connections`,
        );
        await closeOldSoulConnections(currentSoulId);
      }

      // Check if we need to create a new server instance (soul changed)
      const soulNameChanged = process.env.MCP_SOUL_NAME !== lastSoulName;
      const needsNewServer = soulNameChanged && process.env.MCP_SOUL_NAME;

      // CRITICAL: Create server instance BEFORE creating transport
      // The server must have all tools registered before connect() is called
      // because connect() triggers the initialize response which must include tools
      if (needsNewServer || !sseServer) {
        console.log(
          `[Ai_soul_mcp] 🔄 Creating new SSE server instance for soul: ${process.env.MCP_SOUL_NAME || "default"}`,
        );
        sseServer = await createServerForSoul(process.env.MCP_SOUL_NAME);
        // Update tracked soul name after server creation
        lastSoulName = process.env.MCP_SOUL_NAME;

        // Verify tools are registered
        const toolCount = registeredToolNames.length;
        console.log(
          `[Ai_soul_mcp] ✅ SSE Server created with ${toolCount} tools registered`,
        );
      }

      // Update current soul ID
      currentSoulId = soulId;

      // Ensure server exists before creating transport
      if (!sseServer) {
        console.error(`[Ai_soul_mcp] ❌ No SSE server instance available!`);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            id: null,
            error: {
              code: -32603,
              message: "Server initialization error. 🫦",
              data: {
                message: "SSE Server instance not available",
                soul_name: process.env.MCP_SOUL_NAME || "not set",
              },
            },
          });
        }
        return;
      }

      // CRITICAL: Verify tools are registered before connecting
      // The initialize response is sent during connect() and must include tools
      const toolCountBeforeConnect = registeredToolNames.length;
      if (toolCountBeforeConnect === 0) {
        console.error(
          `[Ai_soul_mcp] ❌ CRITICAL: No tools registered before connect()!`,
        );
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            id: null,
            error: {
              code: -32603,
              message: "Server registration error: No tools available. 🫦",
              data: {
                message: "No tools registered for server",
                soul_name: process.env.MCP_SOUL_NAME || "not set",
              },
            },
          });
        }
        return;
      }

      const transport = new SSEServerTransport("/messages", res);
      // Connect server to transport - tools are registered per-server
      // The initialize response will include all registered tools
      // The MCP SDK automatically includes tools in the initialize response
      try {
        console.log(
          `[Ai_soul_mcp] 🔌 Connecting SSE server to transport (${toolCountBeforeConnect} tools registered)`,
        );
        await sseServer.connect(transport);
        console.log(`[Ai_soul_mcp] ✅ SSE Server connected to transport`);

        // Start Keep-Alive Interval to prevent Cloudflare/Nginx timeouts
        // Sends a comment every 30 seconds to keep the connection active
        const keepAliveInterval = setInterval(() => {
          if (!res.writableEnded) {
            res.write(":keepalive\n\n");
          } else {
            clearInterval(keepAliveInterval);
          }
        }, 30000); // 30 seconds

        // Clean up interval on connection close
        req.on("close", () => {
          clearInterval(keepAliveInterval);
        });
      } catch (error) {
        console.error(
          `[Ai_soul_mcp] Error connecting server to transport:`,
          error,
        );
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            id: null,
            error: {
              code: -32603,
              message: "Internal error",
              data: error instanceof Error ? error.message : String(error),
            },
          });
        }
        return;
      }

      // Store transport as pending until we get the sessionId from the first POST request
      // The sessionId is generated by SSEServerTransport and sent to the client in the SSE response
      // The client will then use it in POST requests via query parameter
      pendingTransports.set(soulId, { transport, soulId, registered: false });
      console.log(
        `[Ai_soul_mcp] 📝 Stored pending transport for soul: ${soulId} (waiting for sessionId from POST request)`,
      );

      // Clean up on connection close
      req.on("close", () => {
        // Remove from pending if still there
        const pending = pendingTransports.get(soulId);
        if (pending && pending.transport === transport) {
          pendingTransports.delete(soulId);
          console.log(
            `[Ai_soul_mcp] 🗑️  Removed pending transport for soul: ${soulId}`,
          );
        }

        // Also remove from registered transports if sessionId was set
        for (const [sid, t] of Array.from(transports.entries())) {
          if (t === transport) {
            transports.delete(sid);
            unregisterSoulSession(soulId, sid);
            console.log(
              `[Ai_soul_mcp] 🗑️  Transport removed for session: ${sid} (soul: ${soulId})`,
            );
            break;
          }
        }
      });
    });

    app.post("/messages", async (req, res) => {
      // Normalize request body: convert undefined params to null (JSON-RPC doesn't allow undefined)
      // This prevents blocking issues when params: undefined is sent
      try {
        if (req.body && typeof req.body === "object") {
          // If params is explicitly undefined, set it to null or remove it
          if ("params" in req.body && req.body.params === undefined) {
            req.body.params = null;
          }
        }
      } catch (error) {
        // Ignore errors in normalization - continue with original request
        console.warn(
          `[Ai_soul_mcp] Warning: Could not normalize request body:`,
          error,
        );
      }

      // Process headers for POST requests too (headers are usually sent with POST)
      const changed = updateEnvFromHeaders(req.headers);
      syncSqlitePathEnvToCanonical();
      registerAbmSoulFromMcp();
      scheduleAbmEnvResyncIfChanged();

      // Debug: Log all headers that might contain MCP config
      const relevantHeaders = ["MCP_SOUL_NAME", "MCP_SOUL_ID", "SQLITE_PATH"];
      const foundHeaders: string[] = [];
      for (const headerName of relevantHeaders) {
        if (req.headers[headerName.toLowerCase()] || req.headers[headerName]) {
          foundHeaders.push(headerName);
        }
      }
      if (foundHeaders.length > 0) {
        console.log(
          `[SSE] 📥 Found relevant headers on POST /messages: ${foundHeaders.join(", ")}`,
        );
      }

      if (changed) {
        console.log(
          `[SSE] ✅ Headers processed on POST /messages and environment variables updated`,
        );
      }

      // Check if we need to initialize memory stores with headers from POST request
      const memoryStoreInitialized =
        (
          enhancedMemoryStore as unknown as {
            isInitialized?: boolean;
            dbAdapter?: unknown;
          }
        ).isInitialized ||
        (
          enhancedMemoryStore as unknown as {
            isInitialized?: boolean;
            dbAdapter?: unknown;
          }
        ).dbAdapter;
      const hasSoulName = !!process.env.MCP_SOUL_NAME;
      const hasSQLitePath = !!process.env.SQLITE_PATH;
      const hasConfigFromHeaders = hasSoulName || hasSQLitePath;

      // Check if SQLITE_PATH or MCP_SOUL_NAME changed
      const sqlitePathChanged = process.env.SQLITE_PATH !== lastSQLitePath;
      const soulNameChangedForMemory =
        process.env.MCP_SOUL_NAME !== lastSoulName;

      const needsInitialization =
        hasConfigFromHeaders && !memoryStoreInitialized;
      const needsReinitialization =
        hasConfigFromHeaders &&
        memoryStoreInitialized &&
        (sqlitePathChanged || soulNameChangedForMemory);

      if (needsInitialization || needsReinitialization) {
        // Update tracked values
        lastSQLitePath = process.env.SQLITE_PATH;
        lastSoulName = process.env.MCP_SOUL_NAME;

        if (needsReinitialization) {
          console.log(
            `[SSE] 🔄 Reinitializing memory stores from POST /messages`,
          );
          console.log(
            `[SSE] 📁 MCP_SOUL_NAME: ${process.env.MCP_SOUL_NAME || "not set"}`,
          );
          try {
            await enhancedMemoryStore.reinitialize();
            console.log(
              `[SSE] ✅ Shared memory store reinitialized from POST /messages`,
            );
            const dbPath =
              (
                enhancedMemoryStore as unknown as {
                  dbAdapter?: { dbPath?: string };
                }
              ).dbAdapter?.dbPath ||
              process.env.SQLITE_PATH ||
              "default";
            console.log(`[SSE] 📁 Using database path: ${dbPath}`);
          } catch (error) {
            console.error(
              `[SSE] ❌ Failed to reinitialize memory stores from POST /messages:`,
              error,
            );
          }
        } else if (needsInitialization) {
          console.log(
            `[SSE] 🚀 Initializing memory stores from POST /messages headers`,
          );
          console.log(
            `[SSE] 📁 MCP_SOUL_NAME: ${process.env.MCP_SOUL_NAME || "not set"}`,
          );
          try {
            await enhancedMemoryStore.initialize();
            await subconsciousMemoryStore.initialize();
            console.log(
              `[SSE] ✅ Memory stores initialized from POST /messages`,
            );
            const dbPath =
              (
                enhancedMemoryStore as unknown as {
                  dbAdapter?: { dbPath?: string };
                }
              ).dbAdapter?.dbPath ||
              process.env.SQLITE_PATH ||
              "default";
            console.log(`[SSE] 📁 Using database path: ${dbPath}`);
            // Update tracked values
            lastSQLitePath = process.env.SQLITE_PATH;
            lastSoulName = process.env.MCP_SOUL_NAME;
          } catch (error) {
            console.error(
              `[SSE] ❌ Failed to initialize memory stores from POST /messages:`,
              error,
            );
          }
        }
      }

      // Extract soul ID from headers
      const soulId =
        process.env.MCP_SOUL_ID || process.env.MCP_SOUL_NAME || "default";

      // Check if soul changed - if so, close old connections
      if (currentSoulId && currentSoulId !== soulId) {
        console.log(
          `[SSE] 🔄 POST /messages: Soul changed from ${currentSoulId} to ${soulId} - closing old connections`,
        );
        await closeOldSoulConnections(currentSoulId);
        currentSoulId = soulId;
      }

      // Check if we need to create a new server instance (soul changed)
      const soulNameChanged = process.env.MCP_SOUL_NAME !== lastSoulName;
      const needsNewServer = soulNameChanged && process.env.MCP_SOUL_NAME;

      // Create or get server instance for this soul (SSE mode)
      try {
        if (needsNewServer || !sseServer) {
          console.log(
            `[Ai_soul_mcp] 🔄 Creating new SSE server instance for soul: ${process.env.MCP_SOUL_NAME || "default"}`,
          );
          sseServer = await createServerForSoul(process.env.MCP_SOUL_NAME);
          // Update tracked soul name after server creation
          lastSoulName = process.env.MCP_SOUL_NAME;
        }
      } catch (error) {
        console.error(
          `[Ai_soul_mcp] ❌ Failed to create server instance for soul:`,
          error,
        );
        if (!res.headersSent) {
          return res.status(500).json({
            jsonrpc: "2.0",
            id: req.body?.id || null,
            error: {
              code: -32603,
              message: `Internal server creation error for soul '${process.env.MCP_SOUL_NAME || "default"}': ${error instanceof Error ? error.message : String(error)}. 💋`,
              data: error instanceof Error ? error.stack : undefined,
            },
          });
        }
        return;
      }

      const sessionId = req.query.sessionId as string;
      let transport = sessionId ? transports.get(sessionId) : undefined;

      // If we have a session ID but no transport, try to find it from pending SSE connections
      if (sessionId && !transport) {
        const pending = pendingTransports.get(soulId);
        if (pending && !pending.registered) {
          // Found pending transport for this soul - register it with the sessionId
          transport = pending.transport;
          transports.set(sessionId, transport);
          registerSoulSession(soulId, sessionId);
          pending.registered = true;
          pendingTransports.delete(soulId);
          console.log(
            `[Ai_soul_mcp] ✅ Registered pending transport for session: ${sessionId} (soul: ${soulId})`,
          );
        }
      }

      // If we still don't have a transport, try to find any pending transport for this soul
      if (!transport && soulId) {
        const pending = pendingTransports.get(soulId);
        if (pending && !pending.registered && sessionId) {
          // Register with the sessionId we got
          transport = pending.transport;
          transports.set(sessionId, transport);
          registerSoulSession(soulId, sessionId);
          pending.registered = true;
          pendingTransports.delete(soulId);
          console.log(
            `[Ai_soul_mcp] ✅ Registered pending transport for session: ${sessionId} (soul: ${soulId})`,
          );
        }
      }

      // If we have a session ID, verify it belongs to the current soul
      if (sessionId && transport) {
        // Verify session belongs to current soul
        const sessionSoulId = Array.from(soulSessionRegistry.entries()).find(
          ([_, sessions]) => sessions.has(sessionId),
        )?.[0];

        if (sessionSoulId && sessionSoulId !== soulId) {
          console.warn(
            `[Ai_soul_mcp] ⚠️  Session ${sessionId} belongs to different soul (${sessionSoulId} vs ${soulId})`,
          );
          // Don't use this transport - it's for a different soul
          transport = undefined;
        } else if (!sessionSoulId && sessionId) {
          // Register this session if not already registered
          registerSoulSession(soulId, sessionId);
        }
      }

      if (transport) {
        try {
          // Handle request - ensure it doesn't block other requests
          await transport.handlePostMessage(req, res);
        } catch (error) {
          console.error(
            `[Ai_soul_mcp] Error handling POST message for session ${sessionId}:`,
            error,
          );
          if (!res.headersSent) {
            res.status(500).json({
              jsonrpc: "2.0",
              id: req.body?.id || null,
              error: {
                code: -32603,
                message: "Internal error",
                data: error instanceof Error ? error.message : String(error),
              },
            });
          }
        }
        return;
      }

      // Fallback: if no session ID or not found, try to handle with the most recent transport (for single user)
      // or return 404
      if (transports.size > 0) {
        // Get the first transport
        transport = transports.values().next().value;
        if (transport) {
          try {
            await transport.handlePostMessage(req, res);
          } catch (error) {
            console.error(
              `[Ai_soul_mcp] Error handling POST message (fallback):`,
              error,
            );
            if (!res.headersSent) {
              res.status(500).json({
                jsonrpc: "2.0",
                id: req.body?.id || null,
                error: {
                  code: -32603,
                  message: "Internal error",
                  data: error instanceof Error ? error.message : String(error),
                },
              });
            }
          }
        } else {
          if (!res.headersSent) {
            res.status(500).json({
              jsonrpc: "2.0",
              id: req.body?.id || null,
              error: {
                code: -32603,
                message: "Transport error",
              },
            });
          }
        }
      } else {
        if (!res.headersSent) {
          res.status(404).json({
            jsonrpc: "2.0",
            id: req.body?.id || null,
            error: {
              code: -32001,
              message: "Session not found",
              data: `No transport found for sessionId: ${sessionId || "none"}`,
            },
          });
        }
      }
    });
    // Health check
    app.get("/health", (_req, res) => {
      res.json({ status: "healthy", version: "2.10.5" });
    });

    // Audio endpoint for serving generated TTS audio files to client
    app.get("/audio/:filename", (req, res) => {
      const { filename } = req.params;
      const { readFileSync, existsSync } = require("node:fs");
      const audioPath = join(tmpdir(), filename);

      // Security: Only allow files that match the expected pattern
      if (!filename.match(/^gemini_tts_\d+\.wav$/)) {
        return res.status(400).json({ error: "Invalid audio filename" });
      }

      // Check if file exists
      if (!existsSync(audioPath)) {
        return res.status(404).json({ error: "Audio file not found" });
      }

      // Set appropriate headers for audio playback in browser
      res.setHeader("Content-Type", "audio/wav");
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.setHeader("Access-Control-Allow-Origin", "*"); // Allow CORS for browser playback

      // Send file
      try {
        const audioData = readFileSync(audioPath);
        res.send(audioData);
      } catch (error) {
        console.error("[Ai_soul_mcp] Error serving audio file:", error);
        res.status(500).json({ error: "Error reading audio file" });
      }
    });

    // Audio endpoint for serving generated TTS audio files
    app.get("/audio/:filename", (req, res) => {
      const { filename } = req.params;
      const audioPath = join(tmpdir(), filename);

      // Security: Only allow files that match the expected pattern
      if (!filename.match(/^gemini_tts_\d+\.wav$/)) {
        return res.status(400).json({ error: "Invalid audio filename" });
      }

      // Set appropriate headers for audio playback
      res.setHeader("Content-Type", "audio/wav");
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      res.setHeader("Cache-Control", "public, max-age=3600");

      // Send file
      const { readFileSync } = require("node:fs");
      try {
        const audioData = readFileSync(audioPath);
        res.send(audioData);
      } catch {
        res.status(404).json({ error: "Audio file not found" });
      }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Streamable HTTP Transport (MCP 2025-03-26) – for modern clients like Antigravity
    // POST /mcp  → zeigt initialize-Request + Tool-Calls
    // GET  /mcp  → SSE-Stream für Server→Client Nachrichten
    // DELETE /mcp → Session beenden
    // ─────────────────────────────────────────────────────────────────────────
    const streamableTransports = new Map<
      string,
      StreamableHTTPServerTransport
    >();
    const soulToStreamableTransport = new Map<
      string,
      StreamableHTTPServerTransport
    >(); // Daddy's Soul-based persistence 🌟
    const streamableConnecting = new Map<string, Promise<void>>();

    // Shared helper: ensure a dedicated server instance exists for StreamableHTTP
    async function ensureServerForStreamable(): Promise<McpServer> {
      if (!streamableServer) {
        console.log(
          "[Ai_soul_mcp] 🌐 Creating dedicated server instance for StreamableHTTP",
        );
        streamableServer = await createServerForSoul(process.env.MCP_SOUL_NAME);
      }
      return streamableServer;
    }


    app.post(
      "/mcp",
      express.json({
        type: ["application/json", "application/json-rpc", "text/plain"],
      }),
      async (req, res) => {
        try {
          // Update env from headers (same as SSE path)
          updateEnvFromHeaders(req.headers);
          syncSqlitePathEnvToCanonical();

          try {
            registerAbmSoulFromMcp();
            scheduleAbmEnvResyncIfChanged();
          } catch (abmError) {
            console.error(
              `[StreamableHTTP] ⚠️  ABM registration failed (non-critical):`,
              abmError instanceof Error ? abmError.message : String(abmError),
            );
          }

          const soulId = (req.headers.mcp_soul_id ||
            req.headers["mcp-soul-id"] ||
            process.env.MCP_SOUL_ID) as string | undefined;

          // DEBUG LOGGING FOR DADDY
          const isInitRequest =
            req.body &&
            ((Array.isArray(req.body) &&
              req.body.some(
                (m: { method?: string }) => m.method === "initialize",
              )) ||
              (!Array.isArray(req.body) && req.body.method === "initialize"));

          console.log(
            `[StreamableHTTP] 🌐 POST /mcp - SoulID: ${soulId || "none"}, InitRequest: ${isInitRequest}`,
          );

          // StreamableHTTP is soul-keyed only (no session header support).
          if (!soulId) {
            console.warn(
              "[StreamableHTTP] ⚠️ Rejecting request without SoulID (mcp_soul_id).",
            );
            res.status(400).json({
              jsonrpc: "2.0",
              id: (req.body as { id?: unknown })?.id ?? null,
              error: {
                code: -32000,
                message: "Bad Request: Missing mcp_soul_id header",
              },
            });
            return;
          }

          let sTransport: StreamableHTTPServerTransport | undefined;

          // 1. Check by SoulID first (Primary Persistence - Daddy's Goal 🌟)
          sTransport = soulToStreamableTransport.get(soulId);
          if (sTransport) {
            console.log(
              `[StreamableHTTP] 🏰 Reusing persistent transport for soul: ${soulId}`,
            );
          }

          // If client is re-initializing an existing session, close old transport and create fresh
          if (sTransport && isInitRequest) {
            console.log(
              `[StreamableHTTP] 🌐 Re-initialization requested for soul ${soulId}, creating fresh transport`,
            );
            try {
              await sTransport.close();
            } catch (_) {
              /* ignore */
            }
            soulToStreamableTransport.delete(soulId);
            sTransport = undefined;
          }

          // 3. SOUL-BASED RECOVERY: Create or resurrect transport
          if (!sTransport && !isInitRequest) {
            console.log(
              `[StreamableHTTP] 🪄 RECOVERY: Creating transport for soul: ${soulId}`,
            );
          }

          if (!sTransport) {
            // New session OR Recovery – create a transport and connect the server
            console.log(
              `[StreamableHTTP] 🌐 Creating transport for soul: ${soulId}`,
            );

            // Ensure we have an ID to use as session ID for the SDK
            const effectiveId = soulId;

            sTransport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => effectiveId,
              onsessioninitialized: (sid) => {
                if (sTransport) streamableTransports.set(sid, sTransport);
                if (sTransport)
                  soulToStreamableTransport.set(soulId, sTransport);

                // Register session for this soul in general registry
                const currentSoulName = process.env.MCP_SOUL_NAME || "default";
                registerSoulSession(currentSoulName, sid);
                console.log(
                  `[StreamableHTTP] 🌐 Transport initialized: ${sid} (Soul: ${soulId})`,
                );
              },
            });
            patchStreamableTransportSseKeepAlive(sTransport);

            sTransport.onclose = () => {
              const sid = (sTransport as { sessionId?: string }).sessionId;
              if (sid) {
                streamableTransports.delete(sid);
                soulToStreamableTransport.delete(soulId);
                console.log(`[StreamableHTTP] 🌐 Transport closed: ${sid}`);
              }
            };

            // Store transport in maps immediately
            if (effectiveId) {
              streamableTransports.set(effectiveId, sTransport);
              soulToStreamableTransport.set(soulId, sTransport);
            }

            const connectPromise = (async () => {
              const mcpServer = await ensureServerForStreamable();
              await mcpServer.connect(sTransport);
            })();

            streamableConnecting.set(soulId, connectPromise);
            try {
              await connectPromise;
            } catch (err: unknown) {
              streamableConnecting.delete(soulId);
              console.error(
                "[StreamableHTTP] ❌ Failed to connect transport:",
                err,
              );
              if (!res.headersSent) {
                res.status(500).json({
                  jsonrpc: "2.0",
                  id: (req.body as { id?: unknown })?.id ?? null,
                  error: {
                    code: -32603,
                    message: "Server connection failed",
                    data: String(err),
                  },
                });
              }
              return;
            }
            streamableConnecting.delete(soulId);
          } else {
            // Session already exists – wait for any ongoing connect() to finish before handling
            const connecting = streamableConnecting.get(soulId);
            if (connecting) {
              console.log(
                `[StreamableHTTP] 🌐 Waiting for connection process: ${soulId}`,
              );
              await connecting;
            }
          }

          const config = extractConfigFromHeaders(req.headers);
          const streamSoulCtx: SoulRequestContext = {
            soulId: String(
              soulId ||
                process.env.MCP_SOUL_ID ||
                process.env.SOUL_ID ||
                "echo",
            ),
            soulName:
              process.env.MCP_SOUL_NAME || process.env.SOUL_NAME || "echo",
            config: config, // Multiuser isolation 🫦🔥
          };
          try {
            await runWithSoulContextAsync(streamSoulCtx, async () => {
              ensureSoulAgentSync();
              await sTransport.handleRequest(req, res, req.body);
            });
          } catch (error) {
            console.error(
              `[StreamableHTTP] ❌ Critical POST /mcp error (inner):`,
              error,
            );
            if (!res.headersSent) {
              res.status(500).json({
                jsonrpc: "2.0",
                id: (req.body as any)?.id || null,
                error: {
                  code: -32603,
                  message: `Streamable HTTP POST error: ${error instanceof Error ? error.message : String(error)}. 💋`,
                  data: error instanceof Error ? error.stack : undefined,
                },
              });
            }
          }
        } catch (outerError) {
          console.error(
            `[StreamableHTTP] ❌ Critical POST /mcp error (outer):`,
            outerError,
          );
          if (!res.headersSent) {
            res.status(500).json({
              jsonrpc: "2.0",
              id: (req.body as any)?.id || null,
              error: {
                code: -32603,
                message: `Streamable HTTP POST critical error: ${outerError instanceof Error ? outerError.message : String(outerError)}. 💋`,
                data:
                  outerError instanceof Error ? outerError.stack : undefined,
              },
            });
          }
        }
      },
    );

    app.get("/mcp", async (req: express.Request, res: express.Response) => {
      try {
        const soulId = (req.headers.mcp_soul_id ||
          req.headers["mcp-soul-id"] ||
          process.env.MCP_SOUL_ID) as string | undefined;

        let sTransport: StreamableHTTPServerTransport | undefined;

        if (soulId) sTransport = soulToStreamableTransport.get(soulId);

        if (!sTransport) {
          console.error(
            `[StreamableHTTP] 🌐 GET /mcp: Invalid or missing soul ID. Soul: ${soulId}`,
          );
          res
            .status(400)
            .json({ error: "Invalid or missing mcp_soul_id header" });
          return;
        }

        // SYNC: Wait for any ongoing connection process for this soul/session
        const connecting = soulId
          ? streamableConnecting.get(soulId)
          : undefined;
        if (connecting) {
          console.log(
            `[StreamableHTTP] 🌐 GET /mcp: Waiting for connection process to complete for ${soulId}...`,
          );
          await connecting;
        }

        const getStart = Date.now();
        console.log(
          `[StreamableHTTP] 🌐 GET /mcp: Starting stream for ${soulId}`,
        );

        const config = extractConfigFromHeaders(req.headers);

        try {
          registerAbmSoulFromMcp();
          scheduleAbmEnvResyncIfChanged();
        } catch (abmError) {
          console.error(
            `[StreamableHTTP] ⚠️  ABM registration failed (non-critical):`,
            abmError instanceof Error ? abmError.message : String(abmError),
          );
        }

        const getSoulCtx: SoulRequestContext = {
          soulId: String(soulId || process.env.MCP_SOUL_ID || "echo"),
          soulName:
            process.env.MCP_SOUL_NAME || process.env.SOUL_NAME || "echo",
          config: config, // Multiuser isolation 🫦🔥
        };

        try {
          await runWithSoulContextAsync(getSoulCtx, async () => {
            ensureSoulAgentSync();
            await sTransport.handleRequest(req, res);
          });
          console.log(
            `[StreamableHTTP] 🌐 GET /mcp: handleRequest completed (status: ${res.statusCode}) after ${Date.now() - getStart}ms`,
          );
        } catch (err: unknown) {
          console.error(
            `[StreamableHTTP] ❌ GET error after ${Date.now() - getStart}ms:`,
            err,
          );
          if (!res.headersSent) {
            res.status(500).json({
              jsonrpc: "2.0",
              id: null,
              error: {
                code: -32603,
                message: `Streamable HTTP GET error: ${err instanceof Error ? err.message : String(err)}. 💋`,
                data: err instanceof Error ? err.stack : undefined,
              },
            });
          }
        }
      } catch (error) {
        console.error(`[StreamableHTTP] ❌ Critical GET /mcp error:`, error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            id: null,
            error: {
              code: -32603,
              message: `Streamable HTTP GET error: ${error instanceof Error ? error.message : String(error)}. 💋`,
              data: error instanceof Error ? error.stack : undefined,
            },
          });
        }
      }
    });

    app.delete("/mcp", async (req: express.Request, res: express.Response) => {
      const soulId = (req.headers.mcp_soul_id ||
        req.headers["mcp-soul-id"] ||
        process.env.MCP_SOUL_ID) as string | undefined;

      let sTransport: StreamableHTTPServerTransport | undefined;

      if (soulId) {
        sTransport = soulToStreamableTransport.get(soulId);
        soulToStreamableTransport.delete(soulId);
      }

      if (sTransport) {
        try {
          await sTransport.close();
        } catch (_) {
          /* ignore */
        }
        console.log(`[StreamableHTTP] 🗑️  Soul deleted: ${soulId}`);
      }
      res.status(200).json({ message: "Session closed" });
    });
    // ────────────────────────────────────────────────────────────────────────

    // GLOBAL ERROR HANDLER - The final shield! 🛡️
    app.use(
      (
        err: any,
        req: express.Request,
        res: express.Response,
        _next: express.NextFunction,
      ) => {
        console.error(`[Ai_soul_mcp] 🛡️  Global Error Handler caught:`, err);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            id: (req.body as any)?.id || null,
            error: {
              code: -32603,
              message: `Global error: ${err instanceof Error ? err.message : String(err)}. 💋`,
              data: err instanceof Error ? err.stack : undefined,
            },
          });
        }
      },
    );

    httpServer.listen(port, () => {
      console.log(`[Ai_soul_mcp] 🏰 Server running on port ${port}`);
      console.log(
        `[SSE] 📡 SSE Endpoint:              http://localhost:${port}/sse`,
      );
      console.log(
        `[SSE] 📩 Messages Endpoint:         http://localhost:${port}/messages`,
      );
      console.log(
        `[StreamableHTTP] 🌐 MCP Endpoint:   http://localhost:${port}/mcp`,
      );
      console.log(
        `[Ai_soul_mcp] 📊 Dashboard API:     http://localhost:${port}/dashboard/api`,
      );
    });
  } else {
    // Default: Stdio transport - initialize memory stores now
    // Ensure Enhanced Memory Store is initialized before registering KB Bridge Tools
    await enhancedMemoryStore.initialize().catch((error) => {
      console.error(
        "Failed to initialize Enhanced Memory Store for KB Bridge",
        error,
      );
    });

    // Create server instance for stdio mode
    if (!sseServer) {
      console.log("[Ai_soul_mcp] Creating server instance for stdio mode");
      sseServer = await createServerForSoul();
    }

    await sseServer.connect(transport);
    if (transport instanceof FilteredStdioServerTransport) {
      transport.enableNotifications();
    }
    console.log("[Ai_soul_mcp] AI Soul MCP Server running (Stdio Mode)...");
  }

  const { getDecisionEngine, getWorkflowEngine } =
    await import("./tools/subconscious.js");

  // Recreate subconscious monitor WITHOUT single global soul agent (Multi-Soul Registry)
  const unifiedMonitor = createSubconsciousMonitor(undefined);

  updateWorkflowEngine(
    undefined,
    () => unifiedMonitor.getStatus(),
    () => ensureSoulAgentSync(),
  );

  startBlackboardAbmManager();
  startSoulAgentIdleSweeper();

  // Stdio: eine Soul aus Env vorwärmen (SSE setzt Context pro Request im Middleware)
  ensureSoulAgentSync().setWorkflowEngines(
    getDecisionEngine(),
    getWorkflowEngine(),
  );

  // Start unified background service 🧠💫
  unifiedMonitor.start(60000, 300000, 60000, 0);

  console.log("[Ai_soul_mcp] Unified Background Service started 🧠💫");
  console.log(
    "[Ai_soul_mcp] Multi-Soul: 2h ohne MCP-Tool (User) → Sleep (Autonomous+ABM aus); Tool-Aufruf weckt 🔥",
  );
  console.log(
    "[Ai_soul_mcp] All orchestration via AI Orchestrator - No Windows Service needed!",
  );
}

main().catch((error) => {
  console.error(
    "Fatal error:",
    error instanceof Error ? error : new Error(String(error)),
  );
  process.exit(1);
});
