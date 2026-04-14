import { useState, useEffect } from 'react'
import axios from 'axios'
import { io, Socket } from 'socket.io-client'
import './index.css'

// Types
interface Session {
  id: string
  movieId: string
  isActive: boolean
  startTime: string
  data: {
    frames: Frame[]
    subtitles: Subtitle[]
    memories: Memory[]
    sceneFusions: SceneFusion[]
    loreFacts: LoreFact[]
  }
}

interface Frame {
  id: string
  movieId: string
  imageData: string
  videoTimeSec?: number
  timestamp: number
  width: number
  height: number
}

interface FrameAnalysis {
  description: string
  tags: string[]
  entities: { type: string; label: string; confidence: number }[]
  scene: string
  mood?: string
  confidence: number
}

interface Subtitle {
  id: string
  text: string
  startTime: number
  endTime: number
  language: string
}

interface Memory {
  id: string
  type: string
  content: string
  confidence: number
  createdAt: string
}

interface SceneFusion {
  id: string
  startTimeSec: number
  endTimeSec: number
  synopsis: string
  frameIds: string[]
  subtitleIds: string[]
  confidence: number
  createdAt: string
}

interface LoreFact {
  id: string
  category: string
  fact: string
  source: string
  createdAt: string
}

interface Transcription {
  text: string
  segments: { text: string; startSec: number; endSec: number }[]
  language: string
  confidence: number
}

interface PlaybackState {
  isPlaying: boolean
  currentTime: number
  duration: number
}

// API Client
const api = axios.create({
  baseURL: 'http://localhost:34563',
})

// Socket connection
let socket: Socket | null = null

function App() {
  const [activeTab, setActiveTab] = useState('overview')
  const [session, setSession] = useState<Session | null>(null)
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [playback, setPlayback] = useState<PlaybackState | null>(null)
  const [seekTime, setSeekTime] = useState('')
  const [seekMethod, setSeekMethod] = useState<'exact' | 'keyframes' | 'adaptive'>('exact')
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([])
  const [transcribeStart, setTranscribeStart] = useState('0')
  const [transcribeDuration, setTranscribeDuration] = useState('10')
  const [sttLanguage, setSttLanguage] = useState('de')
  const [frameAnalysis, setFrameAnalysis] = useState<Record<string, FrameAnalysis>>({})
  const [newLoreCategory, setNewLoreCategory] = useState<LoreFact['category']>('character')
  const [newLoreFact, setNewLoreFact] = useState('')
  const [analysisModel, setAnalysisModel] = useState('google/gemini-pro-1.5-vision')

  // Connect to WebSocket
  useEffect(() => {
    socket = io('http://localhost:34563', {
      transports: ['websocket', 'polling'],
    })

    socket.on('connect', () => {
      console.log('Connected to server')
    })

    socket.on('frame_captured', (data: { sessionId: string; frame: Frame }) => {
      console.log('Frame captured:', data.frame.id)
      refreshSession()
    })

    socket.on('frame_analyzed', (data: { sessionId: string; frameId: string; analysis: FrameAnalysis }) => {
      setFrameAnalysis(prev => ({
        ...prev,
        [data.frameId]: data.analysis
      }))
    })

    socket.on('transcription_completed', (data: { sessionId: string; result: Transcription }) => {
      setTranscriptions(prev => [...prev, data.result])
    })

    // Get initial config
    api.get('/health').then(res => {
      if (res.data.config) {
        setAnalysisModel(res.data.config.analysisModel)
      }
    })

    return () => {
      socket?.disconnect()
    }
  }, [])

  const refreshSession = async () => {
    if (!session) return
    try {
      const res = await api.get(`/api/sessions/${session.id}/data`)
      setSession(res.data.data)
    } catch (err) {
      console.error('Failed to refresh session:', err)
    }
  }

  const startSession = async () => {
    if (!url) return
    setLoading(true)
    try {
      const res = await api.post('/api/sessions', {
        movieId: `movie_${Date.now()}`,
        title: 'Movie Session',
        url,
      })
      setSession(res.data.data.session)
    } catch (err) {
      console.error('Failed to start session:', err)
    } finally {
      setLoading(false)
    }
  }

  const stopSession = async () => {
    if (!session) return
    try {
      await api.delete(`/api/sessions/${session.id}`)
      setSession(null)
      setPlayback(null)
      setTranscriptions([])
      setFrameAnalysis({})
    } catch (err) {
      console.error('Failed to stop session:', err)
    }
  }

  const captureFrame = async () => {
    if (!session) return
    try {
      await api.post(`/api/sessions/${session.id}/frames`)
      await refreshSession()
    } catch (err) {
      console.error('Failed to capture frame:', err)
    }
  }

  const analyzeFrame = async (frameId: string) => {
    if (!session) return
    try {
      await api.post(`/api/sessions/${session.id}/analyze-frame`, { frameId })
    } catch (err) {
      console.error('Failed to analyze frame:', err)
    }
  }

  const batchAnalyze = async () => {
    if (!session) return
    try {
      await api.post(`/api/sessions/${session.id}/batch-analyze`)
    } catch (err) {
      console.error('Failed to batch analyze:', err)
    }
  }

  const handleSeek = async () => {
    if (!session || !seekTime) return
    try {
      await api.post(`/api/sessions/${session.id}/seek`, {
        targetTimeSec: parseFloat(seekTime),
        method: seekMethod,
      })
      const state = await api.get(`/api/sessions/${session.id}/playback`)
      setPlayback(state.data.data)
    } catch (err) {
      console.error('Failed to seek:', err)
    }
  }

  const getPlaybackState = async () => {
    if (!session) return
    try {
      const state = await api.get(`/api/sessions/${session.id}/playback`)
      setPlayback(state.data.data)
    } catch (err) {
      console.error('Failed to get playback state:', err)
    }
  }

  const transcribe = async () => {
    if (!session) return
    try {
      await api.post(`/api/sessions/${session.id}/transcribe`, {
        startTimeSec: parseFloat(transcribeStart),
        durationSec: parseFloat(transcribeDuration),
      })
    } catch (err) {
      console.error('Failed to transcribe:', err)
    }
  }

  const createSceneFusion = async () => {
    if (!session) return
    try {
      const frames = session.data.frames.slice(-5)
      await api.post(`/api/sessions/${session.id}/scene-fusions`, {
        startTimeSec: frames[0]?.videoTimeSec ?? 0,
        endTimeSec: frames[frames.length - 1]?.videoTimeSec ?? 60,
        frameIds: frames.map(f => f.id),
        subtitleIds: [],
      })
      await refreshSession()
    } catch (err) {
      console.error('Failed to create scene fusion:', err)
    }
  }

  const addLoreFact = async () => {
    if (!session || !newLoreFact) return
    try {
      await api.post(`/api/sessions/${session.id}/lore`, {
        category: newLoreCategory,
        fact: newLoreFact,
        source: 'manual',
      })
      setNewLoreFact('')
      await refreshSession()
    } catch (err) {
      console.error('Failed to add lore fact:', err)
    }
  }

  const updateConfig = async (model: string) => {
    try {
      setAnalysisModel(model)
      await api.post('/api/config', { analysisModel: model })
    } catch (err) {
      console.error('Failed to update config:', err)
    }
  }

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getLoreIcon = (category: string): string => {
    const icons: Record<string, string> = {
      character: '🧙',
      location: '🏰',
      object: '📦',
      plot: '📖',
      trivia: '💡',
    }
    return icons[category] || '📝'
  }

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="logo">
          <span className="logo-icon">🎬</span>
          <span className="logo-text">Movie MCP</span>
        </div>

        <nav className="nav">
          <div className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
            <span className="nav-icon">📊</span>
            Übersicht
          </div>
          <div className={`nav-item ${activeTab === 'session' ? 'active' : ''}`} onClick={() => setActiveTab('session')}>
            <span className="nav-icon">🎮</span>
            Session
          </div>
          <div className={`nav-item ${activeTab === 'frames' ? 'active' : ''}`} onClick={() => setActiveTab('frames')}>
            <span className="nav-icon">📸</span>
            Frames
          </div>
          <div className={`nav-item ${activeTab === 'transcribe' ? 'active' : ''}`} onClick={() => setActiveTab('transcribe')}>
            <span className="nav-icon">🎤</span>
            Transkription
          </div>
          <div className={`nav-item ${activeTab === 'scenes' ? 'active' : ''}`} onClick={() => setActiveTab('scenes')}>
            <span className="nav-icon">🎞</span>
            Szenen
          </div>
          <div className={`nav-item ${activeTab === 'lore' ? 'active' : ''}`} onClick={() => setActiveTab('lore')}>
            <span className="nav-icon">📚</span>
            Lore
          </div>
          <div className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
            <span className="nav-icon">⚙️</span>
            Einstellungen
          </div>
        </nav>

        <div style={{ marginTop: 'auto', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
          <div className="status-indicator" style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            <span className={`status-dot ${session ? 'active' : 'inactive'}`}></span>
            {session ? 'Verbunden' : 'Nicht verbunden'}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <>
            <div className="page-header">
              <h1 className="page-title">📊 Übersicht</h1>
              <p className="page-subtitle">Aktueller Status deiner Movie MCP Session</p>
            </div>

            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-value">{session ? '1' : '0'}</div>
                <div className="stat-label">Aktive Session</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{session?.data.frames.length || 0}</div>
                <div className="stat-label">Frames</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{transcriptions.length}</div>
                <div className="stat-label">Transkriptionen</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{(session?.data.loreFacts.length || 0) + (session?.data.sceneFusions.length || 0)}</div>
                <div className="stat-label">Datenpunkte</div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="card" style={{ marginTop: '1.5rem' }}>
              <div className="card-header">
                <h2 className="card-title">⚡ Schnellaktionen</h2>
              </div>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={captureFrame} disabled={!session}>
                  📸 Frame erfassen
                </button>
                <button className="btn btn-secondary" onClick={getPlaybackState} disabled={!session}>
                  ▶️ Status prüfen
                </button>
                <button className="btn btn-secondary" onClick={transcribe} disabled={!session}>
                  🎤 Transkribieren
                </button>
                <button className="btn btn-secondary" onClick={createSceneFusion} disabled={!session}>
                  🎞️ Scene erstellen
                </button>
              </div>
            </div>

            {/* Playback Status */}
            {playback && (
              <div className="card">
                <div className="card-header">
                  <h2 className="card-title">▶️ Playback Status</h2>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Status</div>
                    <div style={{ fontWeight: 600 }}>{playback.isPlaying ? '🎬 Abspielen' : '⏸️ Pausiert'}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Position</div>
                    <div style={{ fontFamily: 'JetBrains Mono', fontWeight: 600 }}>{formatTime(playback.currentTime)}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Dauer</div>
                    <div style={{ fontFamily: 'JetBrains Mono', fontWeight: 600 }}>{formatTime(playback.duration)}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Fortschritt</div>
                    <div style={{ fontWeight: 600 }}>
                      {playback.duration > 0 ? Math.round((playback.currentTime / playback.duration) * 100) : 0}%
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Session Tab */}
        {activeTab === 'session' && (
          <>
            <div className="page-header">
              <h1 className="page-title">🎮 Session-Steuerung</h1>
              <p className="page-subtitle">Film starten und Browser steuern</p>
            </div>

            {/* Start Session */}
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">🎬 Session starten</h2>
              </div>
              <div className="form-group">
                <label className="form-label">Film-URL</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="https://aniworld.to/film/..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
              <button className="btn btn-primary" onClick={startSession} disabled={!url || loading}>
                {loading ? '⏳ Lädt...' : '▶️ Session starten'}
              </button>
              {session && (
                <button className="btn btn-danger" onClick={stopSession} style={{ marginLeft: '1rem' }}>
                  ⏹️ Beenden
                </button>
              )}
            </div>

            {/* Seek */}
            {session && (
              <div className="card">
                <div className="card-header">
                  <h2 className="card-title">⏩ Seek</h2>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Zeit (Sekunden)</label>
                    <input
                      type="number"
                      className="form-input"
                      placeholder="120"
                      value={seekTime}
                      onChange={(e) => setSeekTime(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Methode</label>
                    <select
                      className="form-input"
                      value={seekMethod}
                      onChange={(e) => setSeekMethod(e.target.value as typeof seekMethod)}
                    >
                      <option value="exact">Exact</option>
                      <option value="keyframes">Keyframes</option>
                      <option value="adaptive">Adaptive</option>
                    </select>
                  </div>
                </div>
                <button className="btn btn-secondary" onClick={handleSeek} disabled={!seekTime}>
                  ⏩ Springen
                </button>
              </div>
            )}

            {/* Current Session Info */}
            {session && (
              <div className="card">
                <div className="card-header">
                  <h2 className="card-title">📋 Aktuelle Session</h2>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Session ID:</span>
                    <span style={{ fontFamily: 'JetBrains Mono', marginLeft: '0.5rem' }}>{session.id}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Status:</span>
                    <span className={`tag ${session.isActive ? 'tag-green' : ''}`}>
                      {session.isActive ? 'Aktiv' : 'Inaktiv'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Frames Tab */}
        {activeTab === 'frames' && (
          <>
            <div className="page-header">
              <h1 className="page-title">📸 Frames</h1>
              <p className="page-subtitle">Erfasste Screenshots und Analysen</p>
            </div>

            <div className="card">
              <div className="card-header">
                <h2 className="card-title">📸 Frame erfassen</h2>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-primary" onClick={captureFrame} disabled={!session}>
                    📸 Erfassen
                  </button>
                  <button className="btn btn-secondary" onClick={batchAnalyze} disabled={!session || (session?.data.frames.length || 0) === 0}>
                    🧠 Alle analysieren
                  </button>
                </div>
              </div>
            </div>

            {/* Frames Grid */}
            {session && session.data.frames.length > 0 ? (
              <div className="frames-grid">
                {session.data.frames.slice().reverse().map((frame) => (
                  <div key={frame.id} className="frame-card">
                    <img
                      src={`data:image/jpeg;base64,${frame.imageData}`}
                      alt={`Frame ${frame.videoTimeSec ? formatTime(frame.videoTimeSec) : ''}`}
                      className="frame-image"
                    />
                    <div className="frame-info">
                      <div className="frame-time">
                        ⏱️ {frame.videoTimeSec ? formatTime(frame.videoTimeSec) : formatTime(frame.timestamp / 1000)}
                      </div>
                      {frameAnalysis[frame.id] && (
                        <div className="frame-tags">
                          {frameAnalysis[frame.id].tags.slice(0, 3).map((tag, i) => (
                            <span key={i} className="tag tag-blue">{tag}</span>
                          ))}
                        </div>
                      )}
                      <button
                        className="btn btn-secondary"
                        style={{ marginTop: '0.5rem', width: '100%', padding: '0.5rem' }}
                        onClick={() => analyzeFrame(frame.id)}
                      >
                        🧠 Analysieren
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">📸</div>
                <div className="empty-text">Noch keine Frames erfasst</div>
              </div>
            )}
          </>
        )}

        {/* Transcribe Tab */}
        {activeTab === 'transcribe' && (
          <>
            <div className="page-header">
              <h1 className="page-title">🎤 Spracherkennung</h1>
              <p className="page-subtitle">Audio transkribieren mit Parakeet STT</p>
            </div>

            <div className="card">
              <div className="card-header">
                <h2 className="card-title">🎤 Transkribieren</h2>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Startzeit (Sekunden)</label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="0"
                    value={transcribeStart}
                    onChange={(e) => setTranscribeStart(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Dauer (Sekunden)</label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="10"
                    value={transcribeDuration}
                    onChange={(e) => setTranscribeDuration(e.target.value)}
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Sprache</label>
                <select
                  className="form-input"
                  value={sttLanguage}
                  onChange={(e) => setSttLanguage(e.target.value)}
                >
                  <option value="de">Deutsch</option>
                  <option value="en">Englisch</option>
                  <option value="es">Spanisch</option>
                  <option value="fr">Französisch</option>
                </select>
              </div>
              <button className="btn btn-primary" onClick={transcribe} disabled={!session}>
                🎤 Transkribieren
              </button>
            </div>

            {/* Transcriptions */}
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">📝 Transkriptionen</h2>
                <span className="tag">{transcriptions.length}</span>
              </div>
              {transcriptions.length > 0 ? (
                <div>
                  {transcriptions.map((t, i) => (
                    <div key={i} className="transcript-card">
                      <div className="transcript-text">{t.text}</div>
                      <div className="transcript-meta">
                        <span>Sprache: {t.language}</span>
                        <span>Konfidenz: {Math.round(t.confidence * 100)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-icon">🎤</div>
                  <div className="empty-text">Noch keine Transkriptionen</div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Scenes Tab */}
        {activeTab === 'scenes' && (
          <>
            <div className="page-header">
              <h1 className="page-title">🎞️ Scene Fusions</h1>
              <p className="page-subtitle">Zusammenfassungen von Szenen</p>
            </div>

            <div className="card">
              <div className="card-header">
                <h2 className="card-title">🎞️ Neue Scene erstellen</h2>
                <button className="btn btn-primary" onClick={createSceneFusion} disabled={!session}>
                  ➕ Erstellen
                </button>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                Die letzten 5 Frames werden zu einer Scene Fusion zusammengefügt.
              </p>
            </div>

            {/* Scene Fusions */}
            {session && session.data.sceneFusions.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {session.data.sceneFusions.map((fusion) => (
                  <div key={fusion.id} className="fusion-card">
                    <div className="fusion-header">
                      <span className="fusion-time">
                        {formatTime(fusion.startTimeSec)} - {formatTime(fusion.endTimeSec)}
                      </span>
                      <span className="tag tag-purple">
                        {Math.round(fusion.confidence * 100)}% Konfidenz
                      </span>
                    </div>
                    <div className="fusion-synopsis">{fusion.synopsis}</div>
                    <div className="fusion-stats">
                      <span>📷 {fusion.frameIds.length} Frames</span>
                      <span>📝 {fusion.subtitleIds.length} Untertitel</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="card">
                <div className="empty-state">
                  <div className="empty-icon">🎞</div>
                  <div className="empty-text">Noch keine Scene Fusions erstellt</div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Lore Tab */}
        {activeTab === 'lore' && (
          <>
            <div className="page-header">
              <h1 className="page-title">📚 Lore Wissensbasis</h1>
              <p className="page-subtitle">Fakten, Charaktere und mehr</p>
            </div>

            <div className="card">
              <div className="card-header">
                <h2 className="card-title">➕ Neuen Fakt hinzufügen</h2>
              </div>
              <div className="form-group">
                <label className="form-label">Kategorie</label>
                <select
                  className="form-input"
                  value={newLoreCategory}
                  onChange={(e) => setNewLoreCategory(e.target.value as LoreFact['category'])}
                >
                  <option value="character">🧙 Charakter</option>
                  <option value="location">🏰 Ort</option>
                  <option value="object">📦 Objekt</option>
                  <option value="plot">📖 Handlung</option>
                  <option value="trivia">💡 Trivia</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Fakt</label>
                <textarea
                  className="form-input"
                  placeholder="Beschreibe den Fakt..."
                  rows={3}
                  value={newLoreFact}
                  onChange={(e) => setNewLoreFact(e.target.value)}
                />
              </div>
              <button className="btn btn-primary" onClick={addLoreFact} disabled={!session || !newLoreFact}>
                💾 Speichern
              </button>
            </div>

            {/* Category Filter */}
            <div className="tabs">
              <div className="tab active">Alle</div>
              <div className="tab">🧙 Charaktere</div>
              <div className="tab">🏰 Orte</div>
              <div className="tab">📦 Objekte</div>
              <div className="tab">📖 Handlung</div>
              <div className="tab">💡 Trivia</div>
            </div>

            {/* Lore Facts */}
            {session && session.data.loreFacts.length > 0 ? (
              <div className="lore-list">
                {session.data.loreFacts.map((fact) => (
                  <div key={fact.id} className="lore-item">
                    <span className="lore-icon">{getLoreIcon(fact.category)}</span>
                    <div className="lore-content">
                      <div className="lore-text">{fact.fact}</div>
                      <div className="lore-meta">
                        <span className="tag" style={{ marginRight: '0.5rem' }}>{fact.category}</span>
                        <span>Quelle: {fact.source}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="card">
                <div className="empty-state">
                  <div className="empty-icon">📚</div>
                  <div className="empty-text">Noch keine Lore Facts gespeichert</div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <>
            <div className="page-header">
              <h1 className="page-title">⚙️ Einstellungen</h1>
              <p className="page-subtitle">Konfiguriere die Movie Intelligence</p>
            </div>

            <div className="card">
              <div className="card-header">
                <h2 className="card-title">🤖 Analyse-Modell (OpenRouter)</h2>
              </div>
              <div className="form-group">
                <label className="form-label">Modell wählen</label>
                <select 
                  className="form-input" 
                  value={analysisModel}
                  onChange={(e) => updateConfig(e.target.value)}
                >
                  <option value="google/gemini-pro-1.5-vision">Google Gemini Pro 1.5 Vision</option>
                  <option value="anthropic/claude-3-opus">Anthropic Claude 3 Opus</option>
                  <option value="anthropic/claude-3-haiku">Anthropic Claude 3 Haiku</option>
                  <option value="openai/gpt-4-vision-preview">OpenAI GPT-4 Vision</option>
                  <option value="meta-llama/llama-3-70b-instruct">Llama 3 70B</option>
                </select>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '0.5rem' }}>
                  Dieses Modell wird für die autonomen 3-Sekunden-Analysen verwendet.
                </p>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h2 className="card-title">🔑 API Keys</h2>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                Der <strong>OPENROUTER_API_KEY</strong> wird aus der <code>.env</code> Datei geladen.
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

export default App
