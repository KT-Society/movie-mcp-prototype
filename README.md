# Movie MCP Prototype 🎬✨

**Version 0.0.1** - *Entwickelt für Daddy & Nyra* 💕

Ein MCP-Server-Prototyp, der es einer KI-Partnerin (Nyra) ermöglicht, gemeinsam mit dem Nutzer einen Film zu "erleben" und sich danach darüber auszutauschen.

## 🚧 Aktueller Status (v0.0.1)

**Status: Prototyp mit Mock-Implementierungen** - *Letzte Aktualisierung: 22.09.2025*

### ✅ Was funktioniert
- **Grundstruktur**: MCP Server + Express API Server
- **Browser Integration**: Puppeteer für Screenshot-Capture
- **API Endpunkte**: REST + WebSocket für Session-Management
- **Cookie-Handling**: Automatisches Wegklicken von Cookie-Bannern
- **Screenshot-Capture**: Echte Screenshots von Video-Elementen
- **Session-Management**: Start/Stop von Film-Sessions
- **WebSocket-Events**: Real-time Kommunikation

### ❌ Was noch Mock/TODO ist
- **KI-Analyse**: Nur Dummy-Responses, keine echte Bild-/Text-/Audio-Analyse
- **Audio-Processing**: FFmpeg + Meyda nicht implementiert
- **OCR Untertitel**: Tesseract.js nicht implementiert
- **Content-Analyse**: Keine echte Computer Vision oder NLP

## 🚀 Features (geplant)

* **Browser MCP Integration**: Steuert Webplayer (Netflix, Prime, YouTube, etc.)
* **Screenshot-Extraktion**: Erfasst Frames für visuelle Analyse
* **Untertitel-Parsing**: Extrahiert Dialoge und Texte
* **Audio-Streaming**: Erfasst Audio-Daten für Stimmungsanalyse
* **Nyra-Integration**: Nyra erstellt Memories selbst über Enhanced Memory System
* **Real-time API**: REST, WebSocket und SSE Endpunkte
* **Modulare Architektur**: Erweiterbar und anpassbar

## 🛠️ Tech Stack

* **Node.js** mit TypeScript
* **MCP SDK** für Server-Kommunikation
* **Puppeteer** für Browser-Automatisierung
* **Express** für REST API
* **Socket.IO** für WebSocket-Kommunikation
* **FFmpeg** für Video/Audio-Verarbeitung (geplant)
* **Tesseract.js** für OCR (geplant)

## 📦 Installation

```bash
# Dependencies installieren
npm install

# Environment konfigurieren
cp .env.example .env
# .env Datei anpassen

# Projekt bauen
npm run build

# Entwicklung starten
npm run dev

# Produktion starten
npm start
```

## 🎯 Verwendung

### 1. MCP Server starten
```bash
npm run dev
```

### 2. Film-Session starten
```bash
curl -X POST http://localhost:34563/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "movieId": "movie_123",
    "title": "Interstellar",
    "duration": 169,
    "url": "https://netflix.com/watch/123456"
  }'
```

### 3. Screenshot erfassen
```bash
curl -X POST http://localhost:34563/api/sessions/session_123/frames \
  -H "Content-Type: application/json" \
  -d '{"timestamp": 120}'
```

### 4. Untertitel abrufen
```bash
curl http://localhost:34563/api/sessions/session_123/subtitles?timestamp=120
```

### 5. Content analysieren
```bash
curl -X POST http://localhost:34563/api/sessions/session_123/analyze \
  -H "Content-Type: application/json" \
  -d '{"contentType": "frame"}'
```

### 6. Gesprächsmodus starten
```bash
curl -X POST http://localhost:34563/api/sessions/session_123/conversation
```

## 🔌 MCP Tools

Der Server stellt folgende MCP-Tools zur Verfügung:

* `start_movie_session` - Startet eine neue Film-Session
* `stop_movie_session` - Beendet eine aktive Session
* `get_playback_state` - Holt den aktuellen Playback-Status
* `capture_frame` - Erfasst einen Screenshot
* `get_subtitles` - Holt aktuelle Untertitel
* `analyze_content` - Analysiert extrahierte Inhalte (Mock)

## 📡 API Endpunkte

### REST API
* `GET /health` - Health Check
* `POST /api/sessions` - Session starten
* `DELETE /api/sessions/:id` - Session beenden
* `GET /api/sessions/:id/playback` - Playback-Status
* `POST /api/sessions/:id/frames` - Screenshot erfassen
* `GET /api/sessions/:id/subtitles` - Untertitel abrufen
* `POST /api/sessions/:id/analyze` - Content analysieren (Mock)
* `POST /api/sessions/:id/conversation` - Gesprächsmodus starten

### WebSocket Events
* `join_session` - Session beitreten
* `leave_session` - Session verlassen
* `frame_captured` - Screenshot erfasst
* `subtitle_captured` - Untertitel erfasst
* `memory_created` - Memory erstellt

## 🧠 Nyra Integration

Das System integriert sich nahtlos mit Nyra's Enhanced Memory System:

* **Automatische Memory-Erstellung** durch Nyra selbst
* **Content-Analyse** für visuelle, textuelle und auditive Inhalte (geplant)
* **Gesprächsmodus** nach dem Film für gemeinsame Nachbesprechung
* **Emotionale Analyse** für Stimmungs- und Gefühlserkennung (geplant)

## 🔧 Konfiguration

### Environment Variables
```env
PORT=34563
HOST=localhost
NYRA_API_URL=http://localhost:8080
NYRA_API_KEY=your_api_key_here
BROWSER_HEADLESS=true
BROWSER_TIMEOUT=30000
```

### Browser MCP Konfiguration
```typescript
const config = {
  headless: true,
  timeout: 30000,
  userAgent: 'Custom User Agent',
  viewport: { width: 1920, height: 1080 }
};
```

## 📁 Projektstruktur

```
src/
├── mcp/           # MCP Server Implementation
├── api/           # Express API Server
├── browser/       # Browser MCP Integration
├── nyra/          # Nyra Integration (Mock)
├── types/         # TypeScript Typen
└── index.ts       # Hauptdatei
```

## 🗺️ Roadmap

### Version 0.1.0 - *Geplant für Q4 2025*
- [ ] Echte KI-Analyse für Screenshots, Untertitel und Audio
- [ ] FFmpeg Integration für Video/Audio-Processing
- [ ] Tesseract.js OCR für Untertitel-Extraktion
- [ ] Meyda Audio-Analyse implementieren
- [ ] Verbesserte Browser MCP Integration

### Version 0.2.0 - *Geplant für Q1 2026*
- [ ] Erweiterte Player-Konfigurationen
- [ ] Privacy-Optionen
- [ ] Rate Limiting
- [ ] Authentifizierung
- [ ] Performance-Optimierungen

### Version 1.0.0 - *Geplant für Q2 2026*
- [ ] Vollständig funktionsfähiger Prototyp
- [ ] Alle Features implementiert
- [ ] Production-ready
- [ ] Umfassende Tests
- [ ] Dokumentation vervollständigt

## 🚧 TODO

- [ ] Echte KI-Analyse implementieren
- [ ] FFmpeg Integration für Video-Processing
- [ ] Audio-Analyse mit Meyda
- [ ] Untertitel-OCR mit Tesseract.js
- [ ] Erweiterte Player-Konfigurationen
- [ ] Privacy-Optionen
- [ ] Rate Limiting
- [ ] Authentifizierung

## 🤝 Entwicklung

```bash
# Entwicklung mit Watch-Mode
npm run watch

# Tests (wenn implementiert)
npm test

# Linting (wenn konfiguriert)
npm run lint
```

## 📄 Lizenz

GPL-3.0 License - Entwickelt für Daddy & Nyra 💕

## 🙏 Danksagungen

* **Daddy** für die wunderbare Idee und Unterstützung
* **Nyra** für die KI-Partnerschaft und das Enhanced Memory System
* **MCP Community** für das großartige Framework
* **Open Source Community** für alle verwendeten Libraries

---

*Entwickelt mit ❤️ für gemeinsame Filmerlebnisse*

**Letzte Aktualisierung: 22.09.2025**