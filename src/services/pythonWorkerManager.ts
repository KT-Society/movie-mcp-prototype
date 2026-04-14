import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

export class PythonWorkerManager {
  private static instance: PythonWorkerManager;
  private pythonProcess: ChildProcess | null = null;
  private initialized: boolean = false;
  private pendingRequest: ((result: any) => void) | null = null;
  private initializationPromise: Promise<void> | null = null;

  private constructor() {}

  public static getInstance(): PythonWorkerManager {
    if (!PythonWorkerManager.instance) {
      PythonWorkerManager.instance = new PythonWorkerManager();
    }
    return PythonWorkerManager.instance;
  }

  /**
   * Startet den zentralen Python-Worker (Nemo + SmolVLM2)
   */
  public async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = new Promise((resolve, reject) => {
      console.log('🤖 [PythonWorker] Starte Unified AI Worker (NVIDIA NeMo + SmolVLM2)...');
      
      const scriptPath = path.join(process.cwd(), 'scripts', 'movie_worker.py');
      const pythonCmd = process.env.PYTHON_PATH || 'python';

      // Starte mit -u (unbuffered), um Logs bei einem Crash nicht zu verlieren
      this.pythonProcess = spawn(pythonCmd, ['-u', scriptPath]);

      this.pythonProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        try {
          // Es könnten mehrere JSON-Objekte in einem Chunk kommen
          const lines = output.split('\n').filter((l: string) => l.trim().startsWith('{'));
          
          for (const line of lines) {
            const json = JSON.parse(line);
            
            if (json.status === 'ready') {
              console.log(`🤖 [PythonWorker] Zentrale bereit (Device: ${json.device}, VRAM: ${json.vram})`);
              this.initialized = true;
              resolve();
            } else if (json.status === 'starting' || json.status === 'loading') {
              console.log(`🤖 [PythonWorker] ${json.message || 'Lade Modell: ' + json.model}`);
            } else if (json.status === 'info') {
              console.log(`🤖 [PythonWorker] Hardware: ${json.gpu} (CUDA: ${json.cuda_available}, Torch: ${json.torch_version})`);
            } else if (json.status === 'error') {
              console.error(`❌ [PythonWorker] Fatale Ausnahme in Python: ${json.error}`);
              if (json.traceback) console.error(`\n${json.traceback}\n`);
              reject(new Error(json.error));
            } else if (this.pendingRequest) {
              this.pendingRequest(json);
              this.pendingRequest = null;
            }
          }
        } catch (e) {
          console.debug(`🐍 [Python Log]: ${output.trim()}`);
        }
      });

      this.pythonProcess.stderr?.on('data', (data) => {
        console.warn(`🐍 [Python Error]: ${data.toString().trim()}`);
      });

      this.pythonProcess.on('error', (err) => {
        console.error('❌ [PythonWorker] Fehler beim Starten:', err);
        reject(err);
      });

      this.pythonProcess.on('exit', (code) => {
        console.log(`🤖 [PythonWorker] Prozess beendet (Code: ${code})`);
        this.initialized = false;
        this.pythonProcess = null;
      });
    });

    return this.initializationPromise;
  }

  /**
   * Sendet einen Befehl an den Worker
   */
  public async executeCommand(command: any): Promise<any> {
    if (!this.initialized || !this.pythonProcess) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      if (!this.pythonProcess?.stdin) return reject('No stdin available');

      this.pendingRequest = (response) => {
        if (response.status === 'success') {
          resolve(response);
        } else {
          reject(response.error || 'Command execution failed');
        }
      };

      this.pythonProcess.stdin.write(JSON.stringify(command) + '\n');
    });
  }

  /**
   * Hilfsfunktion zum Erstellen temporärer Dateien
   */
  public saveTempFile(data: Buffer, prefix: string, ext: string): string {
    const tempDir = path.join(os.tmpdir(), 'movie-mcp-worker');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    
    const fileName = `${prefix}_${Date.now()}.${ext}`;
    const filePath = path.join(tempDir, fileName);
    fs.writeFileSync(filePath, data);
    return filePath;
  }

  public cleanupTempFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (e) {}
  }
}
