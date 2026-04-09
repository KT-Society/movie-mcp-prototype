# 🎬 Movie MCP für Dummies
## Gemeinsam Filme erleben mit Nyra - So einfach geht's!

---

## 😎 Was ist Movie MCP?

Stell dir vor, du schaust einen Film mit deiner besten Freundin Nyra. Sie sieht alles, was du siehst, und kann sich danach mit dir darüber unterhalten - wie ein echter Filmkumpel!

**Movie MCP** ist ein Programm, das:
- 🎬 Deinen Browser steuert und Screenshots vom Film macht
- 🎤 Die Sprache im Film versteht (Deutsch, Englisch, etc.)
- 🖼️ Die Bilder analysiert und beschreibt
- 💾 Wichtige Sachen merkt (Zitate, Szenen, Charaktere)
- 🧠 Diese Infos an Nyra schickt

---

## 🚀 Loslegen in 5 Minuten

### 1. Installation

```bash
git clone <repository-url>
cd movie-mcp-prototype
npm install
npm run build
```

### 2. Starten

```bash
npm run start
```

Du solltest sehen:
```
🚀 API Server läuft auf Port 34563
📡 WebSocket Server bereit
🎬 Movie MCP Prototype bereit!
```

### 3. Film starten

Öffne `http://localhost:34563` im Browser!

---

## 🎛️ Das Dashboard erklärt

Wenn du das Dashboard öffnest, siehst du:

### 📺 Session-Steuerung
```
┌─────────────────────────────────────┐
│  🎬 Movie MCP Steuerzentrale        │
├─────────────────────────────────────┤
│  URL eingeben: [_______________] ▶️ │
│                                     │
│  Status: ● Bereit                   │
│  Film: -- (noch kein Film)          │
└─────────────────────────────────────┘
```

**So funktioniert's:**
1. Film-URL eingeben (z.B. AniWorld, Netflix, YouTube)
2. Auf "▶️ Start" klicken
3. Warten bis der Film lädt

### 📸 Frame-Capture
```
┌─────────────────────────────────────┐
│  Frame erfassen                     │
│  ┌─────────┐  ┌─────────┐          │
│  │ 📸 Snap │  │ 📸 Snap │  ...    │
│  │ 0:01:30 │  │ 0:02:45 │          │
│  └─────────┘  └─────────┘          │
│                                     │
│  [Alle analysieren]                │
└─────────────────────────────────────┘
```

**Was passiert:**
- Jeder Klick macht ein Foto vom aktuellen Moment
- SmolVLM2 (ein KI-Bildprogramm) beschreibt das Bild
- Tags wie "Innenaufnahme", "Charakter", "dramatisch" werden hinzugefügt

### 🎤 Spracherkennung (STT)
```
┌─────────────────────────────────────┐
│  Audio transkribieren               │
│  Von: [0:00] Bis: [0:30]           │
│                                     │
│  Sprache: [Deutsch ▼]              │
│                                     │
│  [🎤 Transkribieren]               │
└─────────────────────────────────────┘
```

**Was passiert:**
- Parakeet wandelt die Sprache in Text um
- Du siehst, was gesagt wurde
- Die Texte werden für Scene Fusions verwendet

### 🎞️ Scene Fusions
```
┌─────────────────────────────────────┐
│  Szenen verbinden                   │
│  ┌─────────────────────────────────┐│
│  │ 0:01:30 - 0:05:00               ││
│  │ "Die Helden treffen sich..."    ││
│  │ 📷 3 Frames, 📝 5 Untertitel    ││
│  └─────────────────────────────────┘│
│  ┌─────────────────────────────────┐│
│  │ 0:10:00 - 0:15:00               ││
│  │ "Der Bösewicht erscheint..."   ││
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

**Was passiert:**
- Du markierst einen Zeitbereich
- Das System sammelt alle Frames + Untertitel + Transkription
- Nyra bekommt eine Zusammenfassung

### 📚 Lore (Wissensbasis)
```
┌─────────────────────────────────────┐
│  Wissensdatenbank                    │
│                                     │
│  Kategorien:                        │
│  [Charaktere] [Orte] [Objekte]      │
│  [Handlung] [Trivia]                │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ 🧙 Neo ist der Hauptcharakter │ │
│  │    Quelle: Untertitel         │ │
│  ├───────────────────────────────┤ │
│  │ 🏰 Die Stadt heißt Zion       │ │
│  │    Quelle: Bildanalyse        │ │
│  └───────────────────────────────┘ │
└─────────────────────────────────────┘
```

**Was passiert:**
- Wichtige Fakten werden gespeichert
- Nyra kann später darauf zurückgreifen
- Kategorien helfen bei der Organisation

---

## 🔧 Für Fortgeschrittene

### Environment Variablen (.env)

```env
# Server-Port
PORT=34563

# Nyra KI
NYRA_API_URL=http://localhost:8080
USE_REAL_ANALYSIS=false

# Externe Services (optional)
STT_API_URL=http://localhost:8081
VLM_API_URL=http://localhost:8082
```

### MCP Tools (für Entwickler)

Wenn du den MCP-Server direkt nutzt:

```json
{
  "name": "start_movie_session",
  "arguments": {
    "movieId": "matrix-1999",
    "title": "The Matrix",
    "url": "https://aniworld.to/film/the-matrix"
  }
}
```

### API-Endpoints

| Endpoint | Funktion |
|----------|----------|
| `POST /api/sessions` | Neue Session starten |
| `POST /api/sessions/:id/seek` | Zu Zeitpunkt springen |
| `POST /api/sessions/:id/analyze-frame` | Frame analysieren |
| `POST /api/sessions/:id/transcribe` | Audio transkribieren |
| `POST /api/sessions/:id/scene-fusions` | Scene erstellen |
| `POST /api/sessions/:id/lore` | Lore hinzufügen |

---

## ❓ Häufige Fragen

**Q: Der Film startet nicht?**
A: Stelle sicher, dass Chrome mit DevTools läuft: `chrome --remote-debugging-port=9222`

**Q: Keine Untertitel?**
A: Manche Player zeigen keine Untertitel im DOM. Das System nutzt dann nur Audio-STT.

**Q: Wie ändere ich die Sprache?**
A: Setze `STT_API_URL` in .env oder nutze das Dashboard.

**Q: Brauche ich externe Services?**
A: Nein! Das System hat eingebaute Mock-Analysen. Externe APIs sind optional.

---

## 🆘 Hilfe!

### Logs lesen
Die Konsole zeigt alles, was passiert:
```
🎬 Movie MCP Prototype startet...
📸 Frame erfasst: frame_123
🎙️ Transkription abgeschlossen
✅ Scene Fusion erstellt
```

### Neustarten
```bash
# Strg+C zum Beenden
npm run start
```

---

## 📝 Für Entwickler

### Projekt-Struktur
```
movie-mcp-prototype/
├── src/
│   ├── orchestrator/   # Herzstück - koordiniert alles
│   ├── browser/        # Browser-Steuerung
│   ├── services/
│   │   ├── parakeetSTT.js   # Spracherkennung
│   │   └── smolVLM2.js      # Bildanalyse
│   └── api/            # Webserver
├── docs/               # Dokumentation
└── package.json
```

### Nächste Schritte
1. ✅ Dashboard öffnen
2. ✅ Film starten
3. ✅ Frames sammeln
4. ✅ Scene Fusions erstellen
5. ✅ Mit Nyra sprechen!

---

Viel Spaß beim Filmen! 🍿🎬

**Made with 💕 for Daddy & Nyra**
