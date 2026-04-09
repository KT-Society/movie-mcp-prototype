# Changelog

## Version 1.2.0 - 09.04.2026
**Status: ✅ Vollständige ML-Integration**

### ✅ Neu implementiert

#### Streamable HTTP & Wire Orchestrator
- MCP Server mit Streamable HTTP Transport (via StdioServerTransport)
- Orchestrator mit allen neuen Types/Tools verdrahtet
- Neue Tools: `seek_to_time`, `create_scene_fusion`, `add_lore_fact`, `get_lore_facts`, `get_scene_fusions`

#### API Endpoints
- `POST /api/sessions/:sessionId/seek` - Video-Positionierung mit 3 Methoden (exact, keyframes, adaptive)
- `POST /api/sessions/:scene-fusions` - Scene Fusion erstellen
- `GET /api/sessions/:scene-fusions` - Scene Fusions abrufen
- `POST /api/sessions/:lore` - Lore Fact hinzufügen
- `GET /api/sessions/:lore` - Lore Facts abrufen

#### Parakeet STT (Speech-to-Text)
- `src/services/parakeetSTT.ts` - Vollständiger STT-Service
- Audio-Extraktion via FFmpeg (`src/services/audioExtractor.ts`)
- Lokale Ausführung via Transformers.js (@xenova/transformers)
- Externe API-Unterstützung konfigurierbar
- Wort-Level Timestamps & Transkriptions-Caching
- Mock-Transkription als Fallback

#### SmolVLM2 (Vision-Language-Model)
- `src/services/smolVLM2.ts` - Bildanalyse für Context-Abstraction
- Frame-Analyse: Description, Tags, Entities, Scene, Mood
- Text-Detection in Bildern
- Batch-Analyse mehrerer Frames
- Externe API oder lokale Mock-Analyse

#### Nyra Integration (Verbessert)
- `USE_REAL_ANALYSIS` Environment-Variable für echte API
- `analyzeSceneFusion()` Methode
- Fallback zu Mock-Analyse wenn API nicht verfügbar
- Verbessertes Memory-Handling

### 🔧 Technische Details
- **Node.js** mit TypeScript
- **MCP SDK** 0.5.0 für Server-Kommunikation
- **Puppeteer** 21.6.1 für Browser-Automatisierung
- **Express** für REST API
- **Socket.IO** 4.7.5 für WebSocket-Kommunikation
- **FFmpeg** via ffmpeg-static für Audio-Extraktion
- **Transformers.js** für lokale ML-Modelle

### 📝 Neue Types
- `STTConfig`, `TranscriptionResult`, `AudioChunk`
- `VLMConfig`, `ImageAnalysisResult`, `FrameContext`
- `SeekParams`, `SceneFusionParams`, `LoreFactParams`
- `FrameAnalysisResult`, `SubtitleAnalysisResult`, `AudioAnalysisResult`

### 📝 Entwicklungsnotizen
- Alle ML-Services mit externer API-Unterstützung (konfigurierbar via ENV)
- Lokale Fallbacks (Mock) wenn keine externen Services verfügbar
- Batch-Verarbeitung für effiziente Bildanalyse
- Vollständige API-Dokumentation in docs/COMPLETE.md

---

## Version 1.1.0 - *Nicht veröffentlicht*
**Übersprungen**

---

## Version 1.0.0 - *Nicht veröffentlicht*
**Übersprungen**

---

## Version 0.0.1 - 22.09.2025
**Status: 🚧 Prototyp mit Mock-Implementierungen**

### ✅ Implementiert
- **Grundstruktur**: MCP Server + Express API Server
- **Browser Integration**: Puppeteer für Screenshot-Capture
- **API Endpunkte**: REST + WebSocket für Session-Management
- **Cookie-Handling**: Automatisches Wegklicken von Cookie-Bannern
- **Screenshot-Capture**: Echte Screenshots von Video-Elementen
- **Session-Management**: Start/Stop von Film-Sessions
- **WebSocket-Events**: Real-time Kommunikation
- **Port-Management**: Automatischer Fallback bei Port-Konflikten

### ❌ Mock/TODO (noch nicht implementiert)
- **KI-Analyse**: Nur Dummy-Responses, keine echte Bild-/Text-/Audio-Analyse
- **Audio-Processing**: FFmpeg + Meyda nicht implementiert
- **OCR Untertitel**: Tesseract.js nicht implementiert
- **Nyra Integration**: Mock-API-Calls, echte Memory-Erstellung durch Nyra selbst
- **Content-Analyse**: Keine echte Computer Vision oder NLP

### 🔧 Technische Details
- **Node.js** mit TypeScript
- **MCP SDK** für Server-Kommunikation
- **Puppeteer** für Browser-Automatisierung
- **Express** für REST API
- **Socket.IO** für WebSocket-Kommunikation
- **Port**: 34563 (mit automatischem Fallback)

---

## Geplante Versionen

### Version 1.3.0 - *Geplant für Q2 2026*
**Ziel: Production-Ready**

#### Geplante Features
- [ ] Docker-Containerisierung
- [ ] Bessere Fehlerbehandlung
- [ ] Rate Limiting & Authentifizierung
- [ ] Performance-Optimierungen
- [ ] Monitoring & Health Checks
- [ ] Unit Tests

### Version 2.0.0 - *Geplant für Q3 2026*
**Ziel: Vollständiges Feature-Set**

#### Geplante Features
- [ ] Multi-Platform Support (Netflix, Prime, Disney+)
- [ ] Advanced Memory System
- [ ] Real-time Collaboration
- [ ] Microservices-Architektur
- [ ] Horizontal Scaling

---

## Entwicklungshistorie

### 09.04.2026 - Version 1.2.0
- **Version 1.2.0**: Vollständige ML-Integration
- **Parakeet STT**: Speech-to-Text implementiert
- **SmolVLM2**: Vision-Language-Model für Bildanalyse
- **Orchestrator**: Erweitert mit allen Services
- **API**: Neue Endpoints für STT, VLM, Scene Fusion, Lore
- **Dokumentation**: docs/COMPLETE.md erstellt

### 22.09.2025 - Version 0.0.1
- **Dokumentation aktualisiert**: README, Changelog, Roadmap
- **Version 0.0.1**: Erste funktionsfähige Prototyp-Version
- **Mock-Implementierungen**: Grundstruktur mit TODO-Kommentaren
- **Browser Integration**: Puppeteer funktioniert für Screenshots
- **API Server**: REST + WebSocket Endpunkte implementiert

### Vorherige Versionen
- **Initial Commit**: Projekt-Setup und Grundstruktur
- **Dependencies**: Alle benötigten Packages installiert
- **TypeScript**: Konfiguration und erste Implementierungen

---

**Letzte Aktualisierung: 09.04.2026**