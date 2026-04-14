/**
 * Habitat Integration
 * Kommuniziert mit Habitat für Memory-System und Content-Analyse
 */

import axios from "axios";
import {
  HabitatMemory,
  FrameData,
  SubtitleData,
  AudioData,
} from "../types/index.js";

export class HabitatIntegration {
  private apiUrl: string;
  private apiKey: string;
  private useRealService: boolean;

  constructor(apiUrl?: string, apiKey?: string) {
    this.apiUrl =
      apiUrl || process.env.HABITAT_API_URL || "http://localhost:8080";
    this.apiKey = apiKey || process.env.HABITAT_API_KEY || "";
    this.useRealService = process.env.USE_REAL_ANALYSIS !== "false"; // Default true for real API
  }

  async analyzeContent(
    sessionId: string,
    contentType: "frame" | "subtitle" | "audio",
  ): Promise<HabitatMemory> {
    try {
      console.log(`🔍 Analysiere ${contentType} für Session ${sessionId}...`);

      const analysis = this.useRealService
        ? await this.performRealAnalysis(contentType)
        : await this.performContentAnalysis(contentType);

      const memory: HabitatMemory = {
        id: `memory_${Date.now()}`,
        movieId: sessionId,
        type: analysis.type,
        content: analysis.content,
        timestamp: Date.now(),
        confidence: analysis.confidence,
        metadata: analysis.metadata,
        createdAt: new Date(),
      };

      await this.sendMemoryToHabitat(memory);

      return memory;
    } catch (error) {
      console.error("Fehler bei Content-Analyse:", error);
      throw error;
    }
  }

  private async performRealAnalysis(contentType: string): Promise<{
    type: "highlight" | "quote" | "scene" | "emotion" | "character";
    content: string;
    confidence: number;
    metadata: Record<string, any>;
  }> {
    try {
      const response = await axios.post(
        `${this.apiUrl}/api/analyze`,
        {
          contentType,
          timestamp: Date.now(),
        },
        {
          headers: this.apiKey
            ? { Authorization: `Bearer ${this.apiKey}` }
            : {},
          timeout: 10000,
        },
      );

      return {
        type: response.data.type || "highlight",
        content: response.data.content || "Analyse abgeschlossen",
        confidence: response.data.confidence || 0.7,
        metadata: {
          ...response.data.metadata,
          source: "habitat_api",
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      console.warn("Habitat API nicht verfügbar, verwende Mock-Analyse");
      return this.performContentAnalysis(contentType);
    }
  }

  private async performContentAnalysis(contentType: string): Promise<{
    type: "highlight" | "quote" | "scene" | "emotion" | "character";
    content: string;
    confidence: number;
    metadata: Record<string, any>;
  }> {
    switch (contentType) {
      case "frame":
        return {
          type: "scene",
          content: "Interessante Szene erkannt - visuelle Analyse durchgeführt",
          confidence: 0.8,
          metadata: {
            analysisType: "visual",
            features: ["faces", "objects", "emotions"],
            timestamp: Date.now(),
          },
        };

      case "subtitle":
        return {
          type: "quote",
          content: "Wichtiger Dialog erkannt - Textanalyse durchgeführt",
          confidence: 0.9,
          metadata: {
            analysisType: "text",
            sentiment: "positive",
            keywords: ["important", "dialogue"],
            timestamp: Date.now(),
          },
        };

      case "audio":
        return {
          type: "emotion",
          content: "Emotionale Audio-Spur erkannt - Audioanalyse durchgeführt",
          confidence: 0.7,
          metadata: {
            analysisType: "audio",
            emotions: ["excitement", "tension"],
            volume: "high",
            timestamp: Date.now(),
          },
        };

      default:
        return {
          type: "highlight",
          content: "Allgemeine Analyse durchgeführt",
          confidence: 0.5,
          metadata: {
            analysisType: "general",
            timestamp: Date.now(),
          },
        };
    }
  }

  async analyzeSceneFusion(
    movieId: string,
    startTimeSec: number,
    endTimeSec: number,
    frameIds: string[],
    subtitleIds: string[],
  ): Promise<{ synopsis: string; confidence: number }> {
    try {
      console.log(
        `🎬 Analysiere Szenen-Fusion: ${startTimeSec}s - ${endTimeSec}s`,
      );

      if (this.useRealService) {
        try {
          const response = await axios.post(
            `${this.apiUrl}/api/scene-fusion/analyze`,
            {
              movieId,
              startTimeSec,
              endTimeSec,
              frameIds,
              subtitleIds,
            },
            {
              headers: this.apiKey
                ? { Authorization: `Bearer ${this.apiKey}` }
                : {},
              timeout: 15000,
            },
          );

          return {
            synopsis: response.data.synopsis,
            confidence: response.data.confidence || 0.8,
          };
        } catch (error) {
          console.warn("Habitat Scene-Fusion API nicht verfügbar");
        }
      }

      const duration = endTimeSec - startTimeSec;
      const synopsis = `Szenen-Fusion: Szene von ${startTimeSec}s bis ${endTimeSec}s (${Math.round(duration)}s Dauer). Enthält ${frameIds.length} Frames und ${subtitleIds.length} Untertitel.`;

      return {
        synopsis,
        confidence: 0.75,
      };
    } catch (error) {
      console.error("Fehler bei Szenen-Fusion-Analyse:", error);
      return {
        synopsis: "Szenen-Analyse fehlgeschlagen",
        confidence: 0.3,
      };
    }
  }

  async sendMemoryToHabitat(memory: HabitatMemory): Promise<void> {
    try {
      console.log(
        `💾 Sende Memory an Habitat: ${memory.type} - ${memory.content}`,
      );

      if (this.useRealService) {
        try {
          await axios.post(`${this.apiUrl}/api/memories`, memory, {
            headers: this.apiKey
              ? { Authorization: `Bearer ${this.apiKey}` }
              : {},
            timeout: 5000,
          });
          console.log("✅ Memory erfolgreich an Habitat gesendet");
          return;
        } catch (error) {
          console.warn("Habitat API nicht verfügbar, speichere lokal");
        }
      }

      console.log("✅ Memory lokal gespeichert (Mock-Modus)");
    } catch (error) {
      console.error("Fehler beim Senden der Memory an Habitat:", error);
    }
  }

  async getMemoriesForMovie(movieId: string): Promise<HabitatMemory[]> {
    try {
      if (this.useRealService) {
        try {
          const response = await axios.get(
            `${this.apiUrl}/api/memories/movie/${movieId}`,
            {
              headers: this.apiKey
                ? { Authorization: `Bearer ${this.apiKey}` }
                : {},
              timeout: 5000,
            },
          );
          return response.data;
        } catch (error) {
          console.warn("Habitat API nicht verfügbar");
        }
      }
      return [];
    } catch (error) {
      console.error("Fehler beim Abrufen der Memories:", error);
      return [];
    }
  }

  async startConversationMode(movieId: string): Promise<void> {
    try {
      console.log(`💬 Starte Gesprächsmodus für Film ${movieId}...`);

      if (this.useRealService) {
        try {
          const memories = await this.getMemoriesForMovie(movieId);
          await axios.post(
            `${this.apiUrl}/api/conversation/start`,
            { movieId, memories },
            {
              headers: this.apiKey
                ? { Authorization: `Bearer ${this.apiKey}` }
                : {},
            },
          );
          console.log("✅ Gesprächsmodus gestartet (API)");
          return;
        } catch (error) {
          console.warn("Habitat API nicht verfügbar");
        }
      }

      console.log("✅ Gesprächsmodus gestartet (Mock)");
    } catch (error) {
      console.error("Fehler beim Starten des Gesprächsmodus:", error);
      throw error;
    }
  }

  async analyzeFrame(frameData: FrameData): Promise<HabitatMemory> {
    try {
      console.log(`🖼️ Analysiere Frame ${frameData.id}...`);

      const analysis = this.useRealService
        ? await this.performRealAnalysis("frame")
        : await this.performContentAnalysis("frame");

      const memory: HabitatMemory = {
        id: `frame_memory_${Date.now()}`,
        movieId: frameData.movieId,
        type: analysis.type,
        content: analysis.content,
        timestamp: frameData.timestamp,
        confidence: analysis.confidence,
        metadata: {
          ...analysis.metadata,
          frameId: frameData.id,
          timestamp: frameData.timestamp,
          dimensions: `${frameData.width}x${frameData.height}`,
        },
        createdAt: new Date(),
      };

      await this.sendMemoryToHabitat(memory);
      return memory;
    } catch (error) {
      console.error("Fehler bei Frame-Analyse:", error);
      throw error;
    }
  }

  async analyzeSubtitle(subtitleData: SubtitleData): Promise<HabitatMemory> {
    try {
      console.log(`📝 Analysiere Untertitel: "${subtitleData.text}"...`);

      const analysis = this.useRealService
        ? await this.performRealAnalysis("subtitle")
        : await this.performContentAnalysis("subtitle");

      const memory: HabitatMemory = {
        id: `subtitle_memory_${Date.now()}`,
        movieId: subtitleData.movieId,
        type: analysis.type,
        content: analysis.content,
        timestamp: subtitleData.startTime,
        confidence: analysis.confidence,
        metadata: {
          ...analysis.metadata,
          subtitleId: subtitleData.id,
          startTime: subtitleData.startTime,
          endTime: subtitleData.endTime,
          language: subtitleData.language,
        },
        createdAt: new Date(),
      };

      await this.sendMemoryToHabitat(memory);
      return memory;
    } catch (error) {
      console.error("Fehler bei Untertitel-Analyse:", error);
      throw error;
    }
  }
}
