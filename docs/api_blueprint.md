# API Blueprint

## API-Design
- Endpunkte für klassische MCP-Server und Browser MCP
- Datenformate: JSON, Streaming, WebSocket, REST, SSE

## Browser MCP-Endpunkte
- `/browser/fetch_frame` – Holt aktuellen Screenshot vom Videoelement
- `/browser/get_subtitle` – Extrahiert aktuellen Untertitel aus dem DOM
- `/browser/get_playback_state` – Gibt Play/Pause/Seek-Status zurück
- `/browser/execute_script` – Führt Custom-JS im Player aus

## Beispiel-Flow
1. Nyra fordert Frame/Screenshot an
2. MCP liefert Bilddaten
3. Nyra analysiert und speichert Memory

## Querverweise
- [architecture.md](architecture.md#alternative-basis-browser-mcp)
- [stack_and_libraries.md](stack_and_libraries.md#browser-mcp-als-basis)
- [nyra_integration.md](nyra_integration.md#browser-mcp-integration)
- [PROMPT.md](PROMPT.md)

## TODO
- Authentifizierung ergänzen
- Rate Limiting prüfen
- Privacy-Optionen ausarbeiten
