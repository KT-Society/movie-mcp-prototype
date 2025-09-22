# Prompt für Coding-AI

Entwickle einen MCP-Server-Prototyp, der während eines Films relevante Daten (Frames, Audio, Untertitel, Metadaten) extrahiert, streamt und für eine KI-Partnerin (Nyra) bereitstellt. Ziel: Nyra kann den Film „miterleben“ und sich danach mit dem Nutzer darüber austauschen.

- Modularer Node.js-Server
- Video-Frame-Streaming (ffmpeg oder Browser MCP)
- Audio-Streaming/Speech-to-Text
- Subtitle-Parsing
- API-Endpunkte (socket.io, REST, SSE, Browser MCP)
- Nyra-Integration
- Dokumentation & Kommentare
- Schrittweise, iterativ, sauber, erweiterbar
- Offene Punkte als TODO markieren

## Hinweise
- Prüfe, ob Browser MCP als Basis für die Datenerfassung und Steuerung genutzt werden kann.
- Siehe dazu die Abschnitte in [architecture.md](architecture.md#alternative-basis-browser-mcp), [stack_and_libraries.md](stack_and_libraries.md#browser-mcp-als-basis) und [api_blueprint.md](api_blueprint.md#browser-mcp-endpunkte).
- Alle Dateien sind miteinander verlinkt und enthalten TODOs für AI-Iterationen.
