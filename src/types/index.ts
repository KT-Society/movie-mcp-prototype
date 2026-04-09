/**
 * TypeScript-Typen für den Movie MCP Prototype
 * Definiert alle Datenstrukturen für Film-Extraktion und Nyra-Integration
 */

export interface MovieData {
  id: string;
  title: string;
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  timestamp: Date;
}

export interface VideoTimebase {
  /** frames per second of the player */
  fps: number;
  /** native timebase if available, e.g. 1/30 */
  timebase?: string;
  /** duration of a single frame in milliseconds */
  frameDurationMs?: number;
}

export interface FrameData {
  id: string;
  movieId: string;
  /** wall clock timestamp (ms) when the capture happened */
  capturedAtWallTimeMs?: number;
  /** playback position in seconds as reported by the video element */
  videoTimeSec?: number;
  /** legacy timestamp field (kept for compatibility) */
  timestamp: number;
  imageData: string; // Base64 encoded
  width: number;
  height: number;
  extractedAt: Date;
  videoTimebase?: VideoTimebase;
}

export interface SubtitleData {
  id: string;
  movieId: string;
  startTime: number;
  endTime: number;
  text: string;
  language: string;
  extractedAt: Date;
}

export interface AudioData {
  id: string;
  movieId: string;
  timestamp: number;
  audioData: string; // Base64 encoded
  sampleRate: number;
  channels: number;
  extractedAt: Date;
}

export interface AudioChunk {
  id: string;
  movieId: string;
  /** start timestamp in seconds */
  startTimeSec: number;
  /** duration in seconds */
  durationSec: number;
  sampleRate: number;
  channels: number;
  /** raw PCM or encoded data */
  dataBase64: string;
  capturedAtWallTimeMs?: number;
}

export interface PlaybackState {
  movieId: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playbackRate: number;
  timestamp: Date;
}

export interface NyraMemory {
  id: string;
  movieId: string;
  type: 'highlight' | 'quote' | 'scene' | 'emotion' | 'character';
  content: string;
  timestamp: number;
  confidence: number;
  metadata: Record<string, any>;
  createdAt: Date;
}

export interface WhisperSegment {
  id: string;
  text: string;
  startSec: number;
  endSec: number;
  confidence?: number;
  language?: string;
  words?: Array<{
    text: string;
    startSec: number;
    endSec: number;
    probability?: number;
  }>;
}

export interface SceneFusion {
  id: string;
  movieId: string;
  sessionId: string;
  startTimeSec: number;
  endTimeSec: number;
  synopsis: string;
  frameIds: string[];
  subtitleIds: string[];
  whisperSegments?: WhisperSegment[];
  confidence?: number;
  createdAt: Date;
}

export type LoreFactCategory = 'character' | 'location' | 'object' | 'plot' | 'trivia';

export interface LoreFact {
  id: string;
  movieId: string;
  sessionId: string;
  category: LoreFactCategory;
  fact: string;
  source: 'frame' | 'subtitle' | 'audio' | 'scene-fusion' | 'manual';
  referenceIds?: string[];
  createdAt: Date;
}

export interface BrowserMCPConfig {
  headless: boolean;
  timeout: number;
  userAgent?: string;
  viewport?: {
    width: number;
    height: number;
  };
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  handler: (params: any) => Promise<any>;
}

export interface MovieSession {
  id: string;
  movieId: string;
  startTime: Date;
  endTime?: Date;
  isActive: boolean;
  data: {
    frames: FrameData[];
    subtitles: SubtitleData[];
    audio: AudioData[];
    audioChunks?: AudioChunk[];
    memories: NyraMemory[];
    sceneFusions?: SceneFusion[];
    loreFacts?: LoreFact[];
  };
}

// API Response Types
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
}

export interface StreamResponse {
  type: 'frame' | 'subtitle' | 'audio' | 'state';
  data: FrameData | SubtitleData | AudioData | PlaybackState;
  movieId: string;
  timestamp: Date;
}

// Browser MCP Integration Types
export interface BrowserElement {
  selector: string;
  type: 'video' | 'subtitle' | 'control';
  attributes: Record<string, string>;
}

export interface WebPlayerConfig {
  platform: 'netflix' | 'prime' | 'youtube' | 'disney' | 'generic' | 'aniworld';
  selectors: {
    video: string;
    subtitle: string;
    playButton: string;
    progressBar: string;
  };
  customScripts?: string[];
}

// MCP Tool definitions for streamable HTTP
export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface SeekParams {
  sessionId: string;
  targetTimeSec: number;
  method?: 'exact' | 'keyframes' | 'adaptive';
}

export interface SceneFusionParams {
  sessionId: string;
  startTimeSec: number;
  endTimeSec: number;
  autoGenerate?: boolean;
}

export interface LoreFactParams {
  sessionId: string;
  category: LoreFactCategory;
  fact: string;
  source: LoreFact['source'];
  referenceIds?: string[];
}

// Analysis Service Types
export interface FrameAnalysisResult {
  type: 'scene' | 'character' | 'emotion' | 'object' | 'text';
  content: string;
  confidence: number;
  labels: string[];
  metadata: Record<string, any>;
}

export interface SubtitleAnalysisResult {
  type: 'quote' | 'dialogue' | 'narration' | 'action';
  content: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  keywords: string[];
  speakers?: string[];
  metadata: Record<string, any>;
}

export interface AudioAnalysisResult {
  type: 'emotion' | 'speech' | 'music' | 'sfx';
  content: string;
  emotions: string[];
  volume: 'low' | 'medium' | 'high';
  speechDetected: boolean;
  metadata: Record<string, any>;
}

// Parakeet STT Types
export interface STTConfig {
  modelType: 'parakeet-tdt' | 'parakeet-ctc' | 'fast-conformer';
  sampleRate: number;
  language?: string;
  useVAD?: boolean;
}

export interface AudioExtractionResult {
  audioBuffer: Buffer;
  sampleRate: number;
  duration: number;
  channels: number;
  format: 'wav' | 'mp3' | 'ogg';
}

export interface TranscriptionResult {
  text: string;
  segments: WhisperSegment[];
  language: string;
  duration: number;
  confidence: number;
}

export interface AudioChunk {
  id: string;
  movieId: string;
  startTimeSec: number;
  durationSec: number;
  sampleRate: number;
  channels: number;
  dataBase64: string;
  capturedAtWallTimeMs?: number;
}
