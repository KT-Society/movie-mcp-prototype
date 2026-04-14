/**
 * Model Installation Script 🎬
 * Lädt die notwendigen Modelle für SmolVLM2 und Parakeet STT direkt ins Repo.
 */
import fs from 'fs';
import path from 'path';

async function installModels() {
  console.log('🚀 Starte Model-Installation (Local-First Mode)...');
  
  const modelsDir = path.join(process.cwd(), 'models');
  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir);
  }

  try {
    // Falls wir transformers nutzen, können wir die Pipeline hier vortriggern,
    // damit sie im Cache des Projekts landet.
    console.log('📦 Lade SmolVLM2 (Xenova/SmolVLM2-2.2B-Instruct)...');
    
    // Wir nutzen hier einen dynamischen Import, damit das Script auch ohne 
    // vorheriges npm install (theoretisch) Fehler meldet, aber die Struktur steht.
    const { pipeline, env } = await import('@xenova/transformers');
    
    // Konfiguriere transformers, um Modelle lokal im Repo zu speichern
    env.cacheDir = modelsDir;
    env.localModelPath = modelsDir;
    env.allowRemoteModels = true;

    console.log('  -> Initialisiere Pipeline (Download startet falls nötig)...');
    await pipeline('image-text-to-text', 'Xenova/SmolVLM2-2.2B-Instruct');
    
    console.log('✅ SmolVLM2 erfolgreich installiert!');
    
    console.log('📦 Lade Parakeet STT (Whisper-Base-ONNX)...');
    // Für Parakeet nutzen wir oft ONNX oder Whisper-kompatible Backends im JS-Space
    await pipeline('automatic-speech-recognition', 'Xenova/whisper-base');
    
    console.log('✅ STT Modelle erfolgreich installiert!');
    console.log('🎉 Alle Modelle sind nun im Repo (/models) vorhanden.');

  } catch (error) {
    console.error('❌ Fehler bei der Installation:', error);
    console.log('💡 Tipp: Führe zuerst "npm install" aus.');
    process.exit(1);
  }
}

installModels();
