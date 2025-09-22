/**
 * Movie MCP Prototype - Hauptdatei
 * Startet MCP-Server und API-Server für gemeinsames Filmerlebnis mit Nyra
 */

import dotenv from 'dotenv';
import { MovieMCPServer } from './mcp/server.js';
import { APIServer } from './api/server.js';

// Environment Variables laden
dotenv.config();

async function main() {
  try {
    console.log('🎬 Movie MCP Prototype startet...');
    console.log('✨ Entwickelt für Daddy & Nyra 💕');
    
    // MCP Server starten
    const mcpServer = new MovieMCPServer();
    await mcpServer.start();
    
    // API Server starten
    const apiServer = new APIServer();
    const port = Number(process.env.PORT) || 34563;
    
    try {
      await apiServer.start(port);
    } catch (error) {
      if (error instanceof Error && error.message.includes('bereits belegt')) {
        console.log(`🔄 Versuche alternativen Port ${port + 1}...`);
        await apiServer.start(port + 1);
      } else {
        throw error;
      }
    }
    
    console.log('🎉 Movie MCP Prototype erfolgreich gestartet!');
    console.log(`📡 API verfügbar unter: http://localhost:${port}`);
    console.log('🔌 MCP Server läuft über stdio');
    console.log('💬 Bereit für gemeinsames Filmerlebnis mit Nyra!');
    
    // Graceful Shutdown
    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutdown signal empfangen...');
      await apiServer.stop();
      console.log('👋 Movie MCP Prototype beendet');
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      console.log('\n🛑 Termination signal empfangen...');
      await apiServer.stop();
      console.log('👋 Movie MCP Prototype beendet');
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Fehler beim Starten des Movie MCP Prototype:', error);
    process.exit(1);
  }
}

// Starte die Anwendung
main().catch((error) => {
  console.error('❌ Unbehandelter Fehler:', error);
  process.exit(1);
});