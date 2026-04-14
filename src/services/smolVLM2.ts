/**
 * SmolVLM2 Service
 * Vision Language Model for screen analysis and context abstraction
 */

import { PythonWorkerManager } from "./pythonWorkerManager.js";
import {
  VLMConfig,
  ImageAnalysisResult,
  FrameContext,
  FrameData,
} from "../types/index.js";

export class SmolVLM2Service {
  private config: VLMConfig;
  private initialized: boolean = false;
  private worker = PythonWorkerManager.getInstance();

  constructor(config?: Partial<VLMConfig>) {
    this.config = {
      modelName: config?.modelName || "smolvlm2-2.2b",
      device: config?.device || "cpu",
      dtype: config?.dtype || "q4",
      maxTokens: config?.maxTokens || 512,
      temperature: config?.temperature || 0.3,
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

    try {
      return await this.analyzeLocally(frame);
    } catch (error) {
      console.error("❌ Lokale VLM Analyse (SmolVLM2) fehlgeschlagen:", error);
      throw new Error(
        "VLM Analyse fehlgeschlagen - Kein Mock-Fallback verfügbar.",
      );
    }
  }

  /**
   * Führt die eigentliche Analyse mit dem geladenen Modell durch
   */
  private async analyzeLocally(frame: FrameData): Promise<ImageAnalysisResult> {
    console.log("📸 [SmolVLM2] Sende Frame an Unified Worker...");

    // Temp Bilddatei via Manager erstellen
    const imageBuffer = Buffer.from(frame.imageData, "base64");
    const tempFile = this.worker.saveTempFile(imageBuffer, "vlm", "jpg");

    try {
      const response = await this.worker.executeCommand({
        method: "analyze_image",
        path: tempFile,
        prompt: this.getAnalysisPrompt(),
        max_tokens: this.config.maxTokens,
      });

      if (!response || !response.description) {
        throw new Error("Ungültige Antwort vom VLM Worker");
      }

      return {
        description: response.description,
        tags: response.tags || ["local-python-inference", "vlm"],
        entities: response.entities || [],
        textDetected: response.text_detected || [],
        scene: response.scene || "detected_scene",
        mood: response.mood || "unknown",
        confidence: response.confidence || 0.95,
        metadata: {
          model: "HuggingFaceTB/SmolVLM2-2.2B-Instruct",
          timestamp: Date.now(),
          device: "gpu",
        },
      };
    } catch (error) {
      console.error("❌ [SmolVLM2] Lokale Analyse fehlgeschlagen:", error);
      throw error;
    } finally {
      this.worker.cleanupTempFile(tempFile);
    }
  }

  private mapRemoteResponse(data: any): ImageAnalysisResult {
    return {
      description: data.description || "",
      tags: data.tags || [],
      entities: data.entities || [],
      textDetected: data.text_detected || [],
      scene: data.scene || "unknown",
      mood: data.mood,
      confidence: data.confidence || 0.8,
      metadata: {
        model: "smolvlm2-2.2b",
        source: "remote_api",
        timestamp: Date.now(),
      },
    };
  }

  private getAnalysisPrompt(): string {
    return `Analysiere dieses Video-Frame. Beschreibe:
1. Die Hauptszene und visuelle Elemente
2. Erkannte Personen, Objekte und Text
3. Stimmung und visuelle Qualität
4. Relevante Details für die Film-Analyse`;
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
      keyObjects: analysis.entities.map((e) => e.label).slice(0, 5),
      textContent: analysis.textDetected,
      summarization: this.createSummarization(analysis, timestamp),
    };

    return context;
  }

  private createSummarization(
    analysis: ImageAnalysisResult,
    timestamp: number,
  ): string {
    const timeStr = this.formatTimestamp(timestamp);
    const tags = analysis.tags.join(", ");

    return `[${timeStr}] ${analysis.scene} - ${analysis.description.substring(0, 100)}... (Tags: ${tags})`;
  }

  private formatTimestamp(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
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
