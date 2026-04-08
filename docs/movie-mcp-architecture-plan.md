# Movie MCP – Architekturplan

## Übersicht

Der Movie MCP Prototype verbindet einen Browser-MCP (Steuerung des Webplayers), einen MCP-Server (Tools für Nyra) und einen API-Server (REST/WebSocket) zu einem End-to-End-Datenpfad für Video-, Audio- und Untertitel-Extraktion samt Analyse (Scene Fusion, Lore Facts).

## Hauptkomponenten

- **BrowserMCPIntegration**: Steuert den Webplayer (Play, Seek, Capture) und liefert Frames, Untertitel, Playback-Status. Ergänzt Zeitbasis (videoTimeSec, capturedAtWallTimeMs, videoTimebase).
- **NyraIntegration**: Mock-Analyse für Frames, Untertitel, Audio. Liefert Memories und unterstützt Gesprächsmodus.
- **MovieMCPServer**: MCP-Tooling (start/stop Session, capture, subtitles, playback, analyze, seek, scene-fusion, lore-fact) mit Stdio- und optionalem HTTP-Transport.
- **APIServer**: REST + WebSocket für Sessions, Frame-Capture, Subtitles, Scene-Fusion, Seek, Lore-Facts, Analyze, Conversation.
- **Orchestrator**: Stubs für zusammengesetzte Abläufe (Scene Fusion, Lore Facts, Seek) und Vereinheitlichung von Browser/Nyra-Aufrufen.

## Datenfluss

1) BrowserMCPIntegration öffnet den Player, sammelt Frames/Untertitel/Playback-State.
2) API- oder MCP-Server orchestriert Aufrufe, legt Sessions ab und broadcastet Events über WebSocket.
3) NyraIntegration (Mock) analysiert Inhalte, erzeugt Memories, Scene Fusions und Lore Facts.

## Datenmodelle (Auszug)

- **FrameData** mit `videoTimeSec`, `capturedAtWallTimeMs`, `videoTimebase`.
- **AudioChunk** für segmentierte Audiostücke.
- **WhisperSegment**, **SceneFusion**, **LoreFact** für zusammengesetzte Analysen.

## Endpunkte (API)

- `POST /api/sessions` – Session starten
- `DELETE /api/sessions/:sessionId` – Session beenden
- `GET /api/sessions/:sessionId/playback` – Playback-Status
- `POST /api/sessions/:sessionId/frames` – Frame capturen
- `GET /api/sessions/:sessionId/subtitles` – Untertitel abrufen
- `POST /api/sessions/:sessionId/analyze` – Inhalt analysieren
- `POST /api/sessions/:sessionId/scene-fusions` – Scene Fusion anlegen
- `POST /api/sessions/:sessionId/seek` – Seek im Player auslösen
- `POST /api/sessions/:sessionId/lore-facts` – Lore-Fact speichern
- `GET /api/sessions/:sessionId/data` – Session-Daten abrufen

## MCP-Tools (Auszug)

- `start_movie_session`, `stop_movie_session`, `get_playback_state`, `capture_frame`, `get_subtitles`, `analyze_content`
- Neu: `seek_to_time`, `create_scene_fusion`, `add_lore_fact`, `list_memories`
- Transports: Stdio (default) + optional HTTP (`MCP_HTTP_PORT`, `MCP_HTTP_HOST`)

## Offene Punkte

- Echtes npm install/tsc/Lint steht noch aus
- Echte KI-/CV-/ASR-Analyse durch reale Dienste ersetzen
- Robustere Error- und Session-Verwaltung
