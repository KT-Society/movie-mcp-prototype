import fs from 'fs';
import path from 'path';

export interface HistoryEntry {
  timestamp: number;
  relativeTime: string;
  soulName: string;
  vision: string;
  audio: string;
  narration: string;
  importance: number;
  metadata?: Record<string, any>;
}

export class HistoryLogger {
  private historyPath: string;
  private currentFile: string | null = null;

  constructor(basePath: string = './data/history') {
    this.historyPath = path.resolve(basePath);
    this.ensureDirectoryExists();
  }

  private ensureDirectoryExists(): void {
    if (!fs.existsSync(this.historyPath)) {
      fs.mkdirSync(this.historyPath, { recursive: true });
    }
  }

  /**
   * Startet eine neue History-Datei für eine Session
   */
  public startSession(sessionId: string): void {
    this.currentFile = path.join(this.historyPath, `${sessionId}.json`);
    
    // Initialisiere Datei wenn sie nicht existiert
    if (!fs.existsSync(this.currentFile)) {
      const initialData = {
        sessionId,
        startTime: new Date().toISOString(),
        timeline: []
      };
      fs.writeFileSync(this.currentFile, JSON.stringify(initialData, null, 2));
    }
    
    console.error(`🎬 History-Logging gestartet: ${this.currentFile}`);
  }

  /**
   * Fügt einen neuen Eintrag zur Timeline hinzu
   */
  public async logEntry(entry: HistoryEntry): Promise<void> {
    if (!this.currentFile) {
      console.warn("⚠️ Kein aktiver History-File. Logge übersprungen.");
      return;
    }

    try {
      const content = fs.readFileSync(this.currentFile, 'utf-8');
      const data = JSON.parse(content);
      
      data.timeline.push(entry);
      
      // Behalte die Datei kompakt aber lesbar
      fs.writeFileSync(this.currentFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error("❌ Fehler beim Schreiben der History:", error);
    }
  }

  /**
   * Holt die gesamte Timeline für eine Session
   */
  public getHistory(sessionId: string): any {
    const filePath = path.join(this.historyPath, `${sessionId}.json`);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    return null;
  }
}
