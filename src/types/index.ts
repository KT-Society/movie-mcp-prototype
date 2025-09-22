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

export interface FrameData {
  id: string;
  movieId: string;
  timestamp: number;
  imageData: string; // Base64 encoded
  width: number;
  height: number;
  extractedAt: Date;
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
    memories: NyraMemory[];
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
  platform: 'netflix' | 'prime' | 'youtube' | 'disney' | 'generic';
  selectors: {
    video: string;
    subtitle: string;
    playButton: string;
    progressBar: string;
  };
  customScripts?: string[];
}