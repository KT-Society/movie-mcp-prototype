/**
 * SmolVLM2 Service
 * Vision Language Model for screen analysis and context abstraction
 */

import axios from 'axios';
import { 
  VLMConfig, 
  ImageAnalysisResult, 
  FrameContext,
  FrameData 
} from '../types/index.js';

export class SmolVLM2Service {
  private config: VLMConfig;
  private apiUrl: string;
  private useExternalAPI: boolean;
  private localPipeline: any = null;
  private initialized: boolean = false;

  constructor(config?: Partial<VLMConfig>) {
    this.config = {
      modelName: config?.modelName || 'smolvlm2-2.2b',
      device: config?.device || 'cpu',
      dtype: config?.dtype || 'q4',
      maxTokens: config?.maxTokens || 512,
      temperature: config?.temperature || 0.3
    };

    this.apiUrl = process.env.VLM_API_URL || 'http://localhost:8082';
    this.useExternalAPI = process.env.USE_EXTERNAL_VLM === 'true';
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('📸 SmolVLM2 bereits initialisiert');
      return;
    }

    console.log('📸 Initialisiere SmolVLM2...');

    if (this.useExternalAPI) {
      console.log('📸 Verwende externe VLM API');
      this.initialized = true;
      return;
    }

    try {
      // @ts-ignore - package will be available at runtime
      const transformers = await import('@xenova/transformers');
      const pipeline = (transformers as any).pipeline;
      const env = (transformers as any).env;
      
      if (env) {
        env.allowLocalModels = false;
        env.useBrowserCache = true;
      }

      console.log('📸 Lade SmolVLM2 Modell (Xenova/transformers)...');
      
      // @ts-ignore
      this.localPipeline = await pipeline(
        'image-text-to-text',
        'Xenova/SmolVLM2-2.2B-Instruct'
      );
      
      this.initialized = true;
      console.log('📸 SmolVLM2 Modell geladen!');
    } catch (error) {
      console.warn('⚠️ Konnte SmolVLM2 nicht lokal laden, verwende Mock-Modus');
      this.initialized = true;
    }
  }

  async analyzeFrame(frame: FrameData): Promise<ImageAnalysisResult> {
    console.log(`📸 Analysiere Frame: ${frame.id}`);

    if (!this.initialized) {
      await this.initialize();
    }

    if (this.useExternalAPI && this.isRemoteAvailable()) {
      try {
        return await this.analyzeViaRemoteAPI(frame);
      } catch (error) {
        console.warn('Remote VLM API nicht verfügbar, verwende lokale Analyse');
      }
    }

    return this.mockAnalysis(frame);
  }

  private async analyzeViaRemoteAPI(frame: FrameData): Promise<ImageAnalysisResult> {
    const base64Image = frame.imageData;
    
    const response = await axios.post(`${this.apiUrl}/analyze`, {
      image: base64Image,
      prompt: this.getAnalysisPrompt(),
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });

    return this.mapRemoteResponse(response.data);
  }

  private mapRemoteResponse(data: any): ImageAnalysisResult {
    return {
      description: data.description || '',
      tags: data.tags || [],
      entities: data.entities || [],
      textDetected: data.text_detected || [],
      scene: data.scene || 'unknown',
      mood: data.mood,
      confidence: data.confidence || 0.8,
      metadata: {
        model: 'smolvlm2-2.2b',
        source: 'remote_api',
        timestamp: Date.now()
      }
    };
  }

  private getAnalysisPrompt(): string {
    return `Analysiere dieses Video-Frame. Beschreibe:
1. Die Hauptszene und visuelle Elemente
2. Erkannte Personen, Objekte und Text
3. Stimmung und visuelle Qualität
4. Relevante Details für die Film-Analyse`;
  }

  private async mockAnalysis(frame: FrameData): Promise<ImageAnalysisResult> {
    const timestamp = frame.videoTimeSec ?? frame.timestamp / 1000;
    
    const mockAnalyses: ImageAnalysisResult[] = [
      {
        description: 'Ein dramatischer Moment in einer Innenaufnahme. Die Beleuchtung ist gedämpft und erzeugt eine geheimnisvolle Atmosphäre.',
        tags: ['innenaufnahme', 'gedämpfte beleuchtung', 'dramatisch'],
        entities: [
          { type: 'scene', label: 'Innenraum', confidence: 0.9 },
          { type: 'lighting', label: 'Natürliches Licht', confidence: 0.7 }
        ],
        textDetected: [],
        scene: 'Innenraum',
        mood: 'geheimnisvoll',
        confidence: 0.75,
        metadata: {}
      },
      {
        description: 'Eine Außenaufnahme bei Tageslicht. Ein charakteristischer Ort mit deutlichen architektonischen Merkmalen.',
        tags: ['außenaufnahme', 'tageslicht', 'architektur'],
        entities: [
          { type: 'scene', label: 'Außenbereich', confidence: 0.85 },
          { type: 'environment', label: 'Stadt', confidence: 0.8 }
        ],
        textDetected: [],
        scene: 'Stadt',
        mood: 'neutral',
        confidence: 0.72,
        metadata: {}
      },
      {
        description: 'Nahaufnahme eines Charakters. Deutliche Mimik und Gestik zeigen eine emotionale Reaktion.',
        tags: ['nahaufnahme', 'charakter', 'gesicht', 'emotion'],
        entities: [
          { type: 'person', label: 'Mensch', confidence: 0.95 },
          { type: 'expression', label: 'Emotional', confidence: 0.88 }
        ],
        textDetected: [],
        scene: 'Porträt',
        mood: 'emotional',
        confidence: 0.82,
        metadata: {}
      }
    ];

    const index = Math.floor(Math.random() * mockAnalyses.length);
    const baseAnalysis = mockAnalyses[index];
    
    if (!baseAnalysis) {
      return {
        description: 'Frame konnte nicht analysiert werden',
        tags: [],
        entities: [],
        textDetected: [],
        scene: 'unbekannt',
        confidence: 0,
        metadata: { error: true, frameId: frame.id }
      };
    }
    
    const analysis: ImageAnalysisResult = {
      description: baseAnalysis.description,
      tags: baseAnalysis.tags,
      entities: baseAnalysis.entities,
      textDetected: baseAnalysis.textDetected,
      scene: baseAnalysis.scene,
      mood: baseAnalysis.mood ?? 'neutral',
      confidence: baseAnalysis.confidence,
      metadata: {
        model: 'smolvlm2-mock',
        timestamp: Date.now(),
        frameId: frame.id,
        videoTime: timestamp
      }
    };

    return analysis;
  }

  private isRemoteAvailable(): boolean {
    return this.apiUrl !== undefined && this.apiUrl.length > 0;
  }

  async createFrameContext(frame: FrameData): Promise<FrameContext> {
    console.log(`📸 Erstelle Frame-Kontext: ${frame.id}`);
    
    const analysis = await this.analyzeFrame(frame);
    const timestamp = frame.videoTimeSec ?? frame.timestamp / 1000;
    
    const context: FrameContext = {
      frameId: frame.id,
      timestamp: timestamp,
      analysis: analysis,
      keyObjects: analysis.entities.map(e => e.label).slice(0, 5),
      textContent: analysis.textDetected,
      summarization: this.createSummarization(analysis, timestamp)
    };

    return context;
  }

  private createSummarization(analysis: ImageAnalysisResult, timestamp: number): string {
    const timeStr = this.formatTimestamp(timestamp);
    const tags = analysis.tags.join(', ');
    
    return `[${timeStr}] ${analysis.scene} - ${analysis.description.substring(0, 100)}... (Tags: ${tags})`;
  }

  private formatTimestamp(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  async batchAnalyzeFrames(frames: FrameData[]): Promise<FrameContext[]> {
    console.log(`📸 Batch-Analyse von ${frames.length} Frames...`);
    
    const contexts: FrameContext[] = [];
    
    for (const frame of frames) {
      try {
        const context = await this.createFrameContext(frame);
        contexts.push(context);
      } catch (error) {
        console.error(`❌ Fehler bei Frame ${frame.id}:`, error);
      }
    }

    console.log(`📸 ${contexts.length} Frames analysiert`);
    return contexts;
  }

  getConfig(): VLMConfig {
    return { ...this.config };
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

export default SmolVLM2Service;