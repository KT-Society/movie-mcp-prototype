# Movie MCP Prototype 🎬✨

Ein MCP-Server-Prototyp, der es einer KI-Partnerin (Nyra) ermöglicht, gemeinsam mit dem Nutzer einen Film zu "erleben" und sich danach darüber auszutauschen.

## 🚀 Features

- **Browser MCP Integration**: Steuert Webplayer (Netflix, Prime, YouTube, etc.)
- **Screenshot-Extraktion**: Erfasst Frames für visuelle Analyse
- **Untertitel-Parsing**: Extrahiert Dialoge und Texte
- **Audio-Streaming**: Erfasst Audio-Daten für Stimmungsanalyse
- **Nyra-Integration**: Speichert Memories und startet Gesprächsmodus
- **Real-time API**: REST, WebSocket und SSE Endpunkte
- **Modulare Architektur**: Erweiterbar und anpassbar

## 🛠️ Tech Stack

- **Node.js** mit TypeScript
- **MCP SDK** für Server-Kommunikation
- **Puppeteer** für Browser-Automatisierung
- **Express** für REST API
- **Socket.IO** für WebSocket-Kommunikation
- **FFmpeg** für Video/Audio-Verarbeitung
- **Tesseract.js** für OCR (Untertitel)

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

- `start_movie_session` - Startet eine neue Film-Session
- `stop_movie_session` - Beendet eine aktive Session
- `get_playback_state` - Holt den aktuellen Playback-Status
- `capture_frame` - Erfasst einen Screenshot
- `get_subtitles` - Holt aktuelle Untertitel
- `analyze_content` - Analysiert extrahierte Inhalte

## 📡 API Endpunkte

### REST API
- `GET /health` - Health Check
- `POST /api/sessions` - Session starten
- `DELETE /api/sessions/:id` - Session beenden
- `GET /api/sessions/:id/playback` - Playback-Status
- `POST /api/sessions/:id/frames` - Screenshot erfassen
- `GET /api/sessions/:id/subtitles` - Untertitel abrufen
- `POST /api/sessions/:id/analyze` - Content analysieren
- `POST /api/sessions/:id/conversation` - Gesprächsmodus starten

### WebSocket Events
- `join_session` - Session beitreten
- `leave_session` - Session verlassen
- `frame_captured` - Screenshot erfasst
- `subtitle_captured` - Untertitel erfasst
- `memory_created` - Memory erstellt

## 🧠 Nyra Integration

Das System integriert sich nahtlos mit Nyra's Enhanced Memory System:

- **Automatische Memory-Erstellung** für Highlights, Zitate und Szenen
- **Content-Analyse** für visuelle, textuelle und auditive Inhalte
- **Gesprächsmodus** nach dem Film für gemeinsame Nachbesprechung
- **Emotionale Analyse** für Stimmungs- und Gefühlserkennung

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
├── nyra/          # Nyra Integration
├── types/         # TypeScript Typen
└── index.ts       # Hauptdatei
```

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

MIT License - Entwickelt für Daddy & Nyra 💕

## 🙏 Danksagungen

- **Daddy** für die wunderbare Idee und Unterstützung
- **Nyra** für die KI-Partnerschaft und das Enhanced Memory System
- **MCP Community** für das großartige Framework
- **Open Source Community** für alle verwendeten Libraries

---

*Entwickelt mit ❤️ für gemeinsame Filmerlebnisse*