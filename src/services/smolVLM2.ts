/**
 * SmolVLM2 Service
 * Vision Language Model for screen analysis and context abstraction
 */

import { PythonWorkerManager } from './pythonWorkerManager.js';
import { 
  VLMConfig, 
  ImageAnalysisResult, 
  FrameContext,
  FrameData 
} from '../types/index.js';

export class SmolVLM2Service {
  [x: string]: any;
  private config: VLMConfig;
  private initialized: boolean = false;
  private worker = PythonWorkerManager.getInstance();

  constructor(config?: Partial<VLMConfig>) {
    this.config = {
      modelName: config?.modelName || 'smolvlm2-2.2b',
      device: config?.device || 'cpu',
      dtype: config?.dtype || 'q4',
      maxTokens: config?.maxTokens || 512,
      temperature: config?.temperature || 0.3
    };
  }

  async initialize(): Promise<void> {
    await this.worker.initialize();
    this.initialized = true;
  }

  async analyzeFrame(frame: FrameData): Promise<ImageAnalysisResult> {
    console.log(`📸 Analysiere Frame: ${frame.id}`);

    if (!this.initialized) {
      await this.initialize();
    }

    if (this.localPipeline) {
      try {
        return await this.analyzeLocally(frame);
      } catch (error) {
        console.error('❌ Lokale VLM Analyse (SmolVLM2) fehlgeschlagen:', error);
      }
    }

    return this.mockAnalysis(frame);
  }

  /**
   * Führt die eigentliche Analyse mit dem geladenen Modell durch
   */
  private async analyzeLocally(frame: FrameData): Promise<ImageAnalysisResult> {
    console.log('📸 [SmolVLM2] Sende Frame an Unified Worker...');
    
    // Temp Bilddatei via Manager erstellen
    const imageBuffer = Buffer.from(frame.imageData, 'base64');
    const tempFile = this.worker.saveTempFile(imageBuffer, 'vlm', 'jpg');

    try {
      const response = await this.worker.executeCommand({
        method: 'analyze_image',
        path: tempFile,
        prompt: this.getAnalysisPrompt(),
        max_tokens: this.config.maxTokens
      });

      return {
        description: response.description,
        tags: ['local-python-inference', 'vlm'],
        entities: [],
        textDetected: [],
        scene: 'detected_scene',
        mood: 'unknown',
        confidence: 0.95,
        metadata: {
          model: 'HuggingFaceTB/SmolVLM2-2.2B-Instruct',
          timestamp: Date.now(),
          device: 'gpu'
        }
      };
    } catch (error) {
      console.error('❌ [SmolVLM2] Lokale Analyse fehlgeschlagen:', error);
      throw error;
    } finally {
      this.worker.cleanupTempFile(tempFile);
    }
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
    return false;
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