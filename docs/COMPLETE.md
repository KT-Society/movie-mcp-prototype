# Movie MCP Prototype - Umfassende Dokumentation

## Inhaltsverzeichnis

1. [Projektübersicht](#projektübersicht)
2. [Architektur](#architektur)
3. [Installation & Setup](#installation--setup)
4. [Komponenten](#komponenten)
5. [API-Referenz](#api-referenz)
6. [MCP-Tools](#mcp-tools)
7. [KI-Integration (Nyra)](#ki-integration-nyra)
8. [ML-Services](#ml-services)
9. [Konfiguration](#konfiguration)
10. [Entwicklung](#entwicklung)

---

## 1. Projektübersicht

**Movie MCP Prototype** ist ein MCP-Server, der es einer KI-Partnerin (Nyra) ermöglicht, gemeinsam mit dem Nutzer einen Film zu "erleben" und sich danach darüber auszutauschen.

### Kernfunktionen

- 🎬 **Browser-Integration** - Steuerung von Webplayern (Netflix, Prime, YouTube, AniWorld, etc.)
- 📸 **Frame-Extraktion** - Screenshots vom aktuellen Video-Frame
- 📝 **Untertitel-Extraktion** - Automatisches Auslesen von Subtitles
- 🎙️ **Parakeet STT** - Spracherkennung für Audio-Inhalte
- 📡 **SmolVLM2** - Bildanalyse für Context-Abstraction
- 🔍 **Scene-Fusion** - Zusammenführen von Frames, Untertiteln und Transkription
- 📚 **Lore-Management** - Wissensbasis für Film-Fakten
- ⏩ **Seek-Steuerung** - Video-Positionierung

### Use Cases

- Gemeinsames Filmerlebnis mit KI
- Automatische Highlights-Erkennung
- Zitate und Szenen speichern
- Nachbesprechung mit Nyra

---

## 2. Architektur

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client (User/CLI)                       │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │  MCP Server │  (Stdio/HTTP)
                    └──────┬──────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────▼────┐       ┌────▼────┐       ┌────▼────┐
   │ Browser │       │  Nyra   │       │   API   │
   │   MCP   │       │   LLM   │       │ Server  │
   └────┬────┘       └────┬────┘       └────┬────┘
        │                  │                  │
   ┌────▼──────────────────▼──────────────────▼────┐
   │                 Orchestrator                   │
   │  ┌─────────────┐ ┌────────────┐ ┌──────────┐  │
   │  │ SmolVLM2    │ │ Parakeet   │ │  Scene   │  │
   │  │ (Vision)    │ │   STT      │ │  Fusion  │  │
   │  └─────────────┘ └────────────┘ └──────────┘  │
   │  ┌─────────────┐ ┌────────────┐ ┌──────────┐  │
   │  │   Lore      │ │  Subtitle  │ │  Frame   │  │
   │  │  Storage    │ │   Extractor│ │  Capture │  │
   │  └─────────────┘ └────────────┘ └──────────┘  │
   └────────────────────────────────────────────────┘
```

### Datenfluss

1. **Session Start** → Browser öffnet Video-URL
2. **Frame Capture** → Screenshots mit Zeitstempel
3. **STT** → Audio → Text-Transkription
4. **VLM** → Frame → Bildanalyse & Tags
5. **Scene Fusion** → Frames + Subs + Transcripts → Szenen-Summary
6. **Lore Facts** → Extragierte Fakten speichern
7. **Nyra Memory** → Alle Daten an Nyra senden

---

## 3. Installation & Setup

### Voraussetzungen

- Node.js >= 18.0.0
- npm >= 8.0.0
- FFmpeg (automatisch via `ffmpeg-static`)

### Installation

```bash
# Repository klonen
git clone <repository-url>
cd movie-mcp-prototype

# Dependencies installieren
npm install

# Bauen
npm run build

# Oder im Development-Modus starten
npm run dev
```

### Environment Variables (.env)

```env
# Server
PORT=34563
NODE_ENV=development

# Nyra API
NYRA_API_URL=http://localhost:8080
NYRA_API_KEY=
USE_REAL_ANALYSIS=false

# Externe Services (optional)
STT_API_URL=http://localhost:8081
VLM_API_URL=http://localhost:8082
USE_EXTERNAL_STT=false
USE_EXTERNAL_VLM=false
```

---

## 4. Komponenten

### 4.1 Orchestrator (`src/orchestrator/index.ts`)

Zentrale Koordinations-Komponente für alle Services.

**Methoden:**
- `captureFrameWithTiming(session)` - Frame mit Zeitstempel erfassen
- `captureSubtitles(session)` - Untertitel extrahieren
- `seekToTimeSec(target, method)` - Video-Positionieren
- `createSceneFusion(params)` - Szenen-Fusion erstellen
- `addLoreFact(params)` - Lore-Fakt hinzufügen
- `getLoreFacts(sessionId, category)` - Lore-Fakten abrufen
- `getSceneFusions(sessionId)` - Szenen-Fusionen abrufen
- `analyzeFrameWithVLM(frame)` - Frame mit SmolVLM2 analysieren
- `transcribeAudioChunk(chunk)` - Audio transkribieren
- `extractAndTranscribeAudio(session, start, duration)` - Audio extrahieren & transkribieren

### 4.2 Browser MCP Integration (`src/browser/integration.ts`)

Puppeteer-basierte Browser-Steuerung für Webplayer.

**Unterstützte Plattformen:**
- Netflix, Prime Video, YouTube, Disney+
- AniWorld, Mediatheken
- Generic HTML5 Video

**Methoden:**
- `initialize()` - Browser starten/verbinden
- `navigateToUrl(url)` - URL öffnen
- `captureFrame()` - Screenshot vom Video
- `getSubtitles()` - Untertitel auslesen
- `getPlaybackState()` - Aktueller Status
- `seekToTime(time, method)` - Positionieren

### 4.3 Nyra Integration (`src/nyra/integration.ts`)

Kommunikation mit der Nyra KI.

**Methoden:**
- `analyzeContent(sessionId, contentType)` - Inhalt analysieren
- `analyzeSceneFusion(...)` - Szenen-Fusion analysieren
- `sendMemoryToNyra(memory)` - Memory speichern
- `getMemoriesForMovie(movieId)` - Memories abrufen
- `startConversationMode(movieId)` - Gesprächsmodus starten

### 4.4 Parakeet STT (`src/services/parakeetSTT.ts`)

Spracherkennungs-Service (Speech-to-Text).

**Features:**
- Lokale Ausführung via Transformers.js
- Externe API-Unterstützung
- Wort-Level Timestamps
- Caching

**Konfiguration:**
```typescript
{
  modelType: 'parakeet-tdt' | 'parakeet-ctc' | 'fast-conformer',
  sampleRate: 16000,
  language: 'de',
  useVAD: true
}
```

### 4.5 SmolVLM2 (`src/services/smolVLM2.ts`)

Vision-Language-Model für Bildanalyse.

**Features:**
- Frame-Analyse mit Description, Tags, Entities
- Scene Recognition & Mood Detection
- Text Detection in Bildern
- Batch-Verarbeitung

**Konfiguration:**
```typescript
{
  modelName: 'smolvlm2-2.2b',
  device: 'cpu' | 'webgpu' | 'cuda',
  dtype: 'q4' | 'q8' | 'fp16',
  maxTokens: 512,
  temperature: 0.3
}
```

---

## 5. API-Referenz

Alle Endpoints auf Port `34563` (default).

### 5.1 Sessions

| Methode | Endpoint | Beschreibung |
|---------|----------|--------------|
| POST | `/api/sessions` | Neue Session erstellen |
| DELETE | `/api/sessions/:sessionId` | Session beenden |
| GET | `/api/sessions/:sessionId/data` | Session-Daten abrufen |

### 5.2 Playback

| Methode | Endpoint | Beschreibung |
|---------|----------|--------------|
| GET | `/api/sessions/:sessionId/playback` | Playback-Status |
| POST | `/api/sessions/:sessionId/seek` | Video positionieren |

**Seek Request:**
```json
{
  "targetTimeSec": 120.5,
  "method": "exact"  // exact | keyframes | adaptive
}
```

### 5.3 Frames & Subtitles

| Methode | Endpoint | Beschreibung |
|---------|----------|--------------|
| POST | `/api/sessions/:sessionId/frames` | Frame erfassen |
| GET | `/api/sessions/:sessionId/subtitles` | Subtitles abrufen |

### 5.4 Bildanalyse (SmolVLM2)

| Methode | Endpoint | Beschreibung |
|---------|----------|--------------|
| POST | `/api/sessions/:sessionId/analyze-frame` | Frame analysieren |
| GET | `/api/sessions/:sessionId/frame-contexts` | Kontexte abrufen |
| POST | `/api/sessions/:sessionId/batch-analyze` | Batch-Analyse |

### 5.5 Audio (Parakeet STT)

| Methode | Endpoint | Beschreibung |
|---------|----------|--------------|
| POST | `/api/sessions/:sessionId/transcribe` | Audio transkribieren |
| GET | `/api/sessions/:sessionId/transcriptions` | Transkriptionen abrufen |
| POST | `/api/sessions/:sessionId/stt-language` | STT-Sprache setzen |

**Transcribe Request:**
```json
{
  "startTimeSec": 0,
  "durationSec": 10
}
```

### 5.6 Scene Fusion

| Methode | Endpoint | Beschreibung |
|---------|----------|--------------|
| POST | `/api/sessions/:sessionId/scene-fusions` | Fusion erstellen |
| GET | `/api/sessions/:sessionId/scene-fusions` | Fusionen abrufen |

**Create Fusion Request:**
```json
{
  "startTimeSec": 60,
  "endTimeSec": 120,
  "frameIds": ["frame_1", "frame_2"],
  "subtitleIds": ["sub_1"]
}
```

### 5.7 Lore Facts

| Methode | Endpoint | Beschreibung |
|---------|----------|--------------|
| POST | `/api/sessions/:sessionId/lore` | Lore-Fakt hinzufügen |
| GET | `/api/sessions/:sessionId/lore` | Lore-Fakten abrufen |

**Add Lore Request:**
```json
{
  "category": "character",
  "fact": "Der Hauptcharakter named 'Neo'...",
  "source": "subtitle",
  "referenceIds": ["sub_1"]
}
```

### 5.8 Nyra Integration

| Methode | Endpoint | Beschreibung |
|---------|----------|--------------|
| POST | `/api/sessions/:sessionId/analyze` | Inhalt analysieren |
| POST | `/api/sessions/:sessionId/conversation` | Gesprächsmodus starten |

### 5.9 WebSocket Events

- `frame_captured` - Frame erfasst
- `subtitle_captured` - Subtitles erfasst
- `memory_created` - Nyra Memory erstellt
- `seek_completed` - Seek abgeschlossen
- `scene_fusion_created` - Scene Fusion erstellt
- `lore_fact_added` - Lore-Fakt hinzugefügt
- `transcription_completed` - Transkription abgeschlossen
- `frame_analyzed` - Frame analysiert (VLM)
- `batch_analysis_completed` - Batch-Analyse abgeschlossen

---

## 6. MCP-Tools

### Verfügbare Tools

| Tool | Beschreibung |
|------|---------------|
| `start_movie_session` | Neue Session starten |
| `stop_movie_session` | Session beenden |
| `get_playback_state` | Playback-Status |
| `capture_frame` | Frame erfassen |
| `get_subtitles` | Subtitles abrufen |
| `seek_to_time` | Video positionieren |
| `create_scene_fusion` | Scene Fusion erstellen |
| `add_lore_fakt` | Lore-Fakt hinzufügen |
| `get_lore_facts` | Lore-Fakten abrufen |
| `get_scene_fusions` | Scene Fusionen abrufen |
| `analyze_content` | Inhalt analysieren |

---

## 7. KI-Integration (Nyra)

### Memory-Typen

- `highlight` - Wichtiger Moment
- `quote` - Zitat/Dialog
- `scene` - Szenen-Beschreibung
- `emotion` - Emotionserkennung
- `character` - Charakter-Info

### Datenfluss zu Nyra

1. Frame/Screen wird analysiert (SmolVLM2)
2. Audio wird transkribiert (Parakeet STT)
3. Scene Fusion fasst zusammen
4. Memory wird erstellt und gesendet
5. Nyra speichert im Enhanced Memory System

---

## 8. ML-Services

### Parakeet STT

**Modell-Typen:**
- `parakeet-tdt` - Transformer Decoder Table (empfohlen)
- `parakeet-ctc` - CTC-basiert
- `fast-conformer` - Schnell, weniger genau

**Beispiel-Output:**
```json
{
  "text": "Die Geschichte beginnt in einer kleinen Stadt.",
  "segments": [
    {
      "id": "seg_0",
      "text": "Die Geschichte beginnt",
      "startSec": 0.0,
      "endSec": 2.5,
      "confidence": 0.89,
      "language": "de",
      "words": [...]
    }
  ],
  "language": "de",
  "duration": 15.3,
  "confidence": 0.85
}
```

### SmolVLM2 Bildanalyse

**Beispiel-Output:**
```json
{
  "description": "Ein dramatischer Moment in einer Innenaufnahme.",
  "tags": ["innenaufnahme", "gedämpfte beleuchtung", "dramatisch"],
  "entities": [
    { "type": "scene", "label": "Innenraum", "confidence": 0.9 },
    { "type": "lighting", "label": "Natürliches Licht", "confidence": 0.7 }
  ],
  "textDetected": [],
  "scene": "Innenraum",
  "mood": "geheimnisvoll",
  "confidence": 0.75,
  "metadata": { ... }
}
```

---

## 9. Konfiguration

### .env Beispiel

```env
# ===== SERVER =====
PORT=34563
NODE_ENV=development

# ===== NYRA =====
NYRA_API_URL=http://localhost:8080
NYRA_API_KEY=your-api-key
USE_REAL_ANALYSIS=false

# ===== PARAKET STT =====
STT_API_URL=http://localhost:8081
USE_EXTERNAL_STT=false

# ===== SMOLVLM2 =====
VLM_API_URL=http://localhost:8082
USE_EXTERNAL_VLM=false
```

### Browser-Konfiguration

```typescript
const config: BrowserMCPConfig = {
  headless: false,
  timeout: 30000,
  userAgent: 'Mozilla/5.0...',
  viewport: { width: 1920, height: 1080 }
};
```

---

## 10. Entwicklung

### Scripts

| Script | Beschreibung |
|--------|--------------|
| `npm run build` | TypeScript bauen |
| `npm run start` | Server starten (produktion) |
| `npm run dev` | Development-Modus |
| `npm run watch` | Watch-Mode |

### Projektstruktur

```
movie-mcp-prototype/
├── src/
│   ├── index.ts              # Main entry
│   ├── api/server.ts         # REST API
│   ├── mcp/server.ts        # MCP Server
│   ├── orchestrator/index.ts # Orchestrator
│   ├── browser/integration.ts # Browser MCP
│   ├── nyra/integration.ts   # Nyra Client
│   ├── services/
│   │   ├── audioExtractor.ts  # FFmpeg audio
│   │   ├── parakeetSTT.ts    # Speech-to-Text
│   │   └── smolVLM2.ts       # Vision Model
│   └── types/index.ts        # TypeScript types
├── docs/                     # Dokumentation
├── package.json
├── tsconfig.json
└── .env.example
```

### Fehlerbehebung

**Port bereits belegt:**
```bash
# Alternative Ports ausprobieren
PORT=34564 npm run start
```

**FFmpeg nicht gefunden:**
- `ffmpeg-static` lädt automatisch
- Alternativ: FFmpeg systemweit installieren

**Browser-Verbindung:**
- Chrome mit DevTools aktivieren: `chrome --remote-debugging-port=9222`
- Oder neue Instanz starten (headless)

---

## Lizenz

GPL-3.0 - Siehe LICENSE Datei.

## Autor

Daddy & Nyra 💕