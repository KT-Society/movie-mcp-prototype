/**
 * Movie MCP Prototype - Hauptdatei
 * Startet MCP-Server und API-Server für gemeinsames Filmerlebnis mit Habitat
 */

import dotenv from "dotenv";
import { MovieMCPServer } from "./mcp/server.js";
import { APIServer } from "./api/server.js";
import { BrowserMCPIntegration } from "./browser/integration.js";
import { HabitatIntegration } from "./habitat/integration.js";
import { Orchestrator } from "./orchestrator/index.js";
import { HabitatLLMBridge } from "./bridge/habitatBridge.js";

// Environment Variables laden
dotenv.config();

async function main() {
  try {
    const isStdio = process.argv.includes('--stdio');

    if (isStdio) {
      // WICHTIG: Wenn Stdio Transport genutzt wird, darf console.log nicht den std-out-Stream verschmutzen,
      // da sonst das JSON-RPC Protokoll bricht. Wir leiten alle logs nach stderr um.
      console.log = console.error;
      console.info = console.error;
      console.warn = console.error;
    }

    console.log("🎬 Movie MCP Prototype startet...");
    console.log("✨ Entwickelt für Daddy & Habitat 💕");

    // Gemeinsame Dienste initialisieren (Singleton Pattern gegen DOPPELT GEMOPPELT)
    const browserIntegration = new BrowserMCPIntegration({
      headless: false,
      timeout: 30000,
    });
    const habitatIntegration = new HabitatIntegration();
    const orchestrator = new Orchestrator(browserIntegration, habitatIntegration);
    
    // Lokale Modelle beim Start laden (Hardcoded & Mock-Free)
    await orchestrator.initialize();
    
    const habitatBridge = new HabitatLLMBridge(orchestrator, habitatIntegration);

    // API Server initialisieren
    const apiServer = new APIServer(
      orchestrator,
      habitatBridge,
      habitatIntegration,
      browserIntegration,
    );
    const port = Number(process.env.PORT) || 34563;

    // MCP Server Dual-Mode initialisieren
    const mcpServer = new MovieMCPServer(
      orchestrator,
      habitatBridge,
      habitatIntegration,
      browserIntegration,
    );

    if (isStdio) {
      await mcpServer.startStdio();
    } else {
      await mcpServer.startSSE(apiServer.getApp());
    }

    try {
      await apiServer.start(port);
    } catch (error) {
      if (error instanceof Error && error.message.includes("bereits belegt")) {
        console.log(`🔄 Versuche alternativen Port ${port + 1}...`);
        await apiServer.start(port + 1);
      } else {
        throw error;
      }
    }

    console.log("🎉 Movie MCP Prototype erfolgreich gestartet!");
    console.log(`📡 API verfügbar unter: http://localhost:${port}`);
    if (isStdio) {
      console.log("🔌 MCP Server läuft nativ über STDIO (Antigravity Mode)");
    } else {
      console.log(`🔌 MCP Server läuft über HTTP/SSE unter: http://localhost:${port}/sse`);
    }
    console.log("💬 Bereit für gemeinsames Filmerlebnis mit Habitat!");

    // Graceful Shutdown
    process.on("SIGINT", async () => {
      console.log("\n🛑 Shutdown signal empfangen...");
      await apiServer.stop();
      console.log("👋 Movie MCP Prototype beendet");
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      console.log("\n🛑 Termination signal empfangen...");
      await apiServer.stop();
      console.log("👋 Movie MCP Prototype beendet");
      process.exit(0);
    });
  } catch (error) {
    console.error("❌ Fehler beim Starten des Movie MCP Prototype:", error);
    process.exit(1);
  }
}

// Starte die Anwendung
main().catch((error) => {
  console.error("❌ Unbehandelter Fehler:", error);
  process.exit(1);
});
