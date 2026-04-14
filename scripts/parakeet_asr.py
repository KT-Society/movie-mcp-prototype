import sys
import json
import os
import torch
import logging

# NeMo Log-Level reduzieren um Stabilität nicht zu gefährden
logging.getLogger("nemo").setLevel(logging.ERROR)

try:
    import nemo.collections.asr as nemo_asr
except ImportError:
    print(json.dumps({"error": "nemo_toolkit not installed. Please run 'pip install nemo_toolkit[asr]'"}))
    sys.exit(1)

def main():
    # Modell-Initialisierung (NVIDIA NeMo Parakeet)
    model_name = "nvidia/parakeet-tdt-0.6b-v3"
    
    try:
        # Prüfen ob GPU verfügbar ist
        device = "cuda" if torch.cuda.is_available() else "cpu"
        
        # Modell laden (einmalig beim Start)
        asr_model = nemo_asr.models.ASRModel.from_pretrained(model_name)
        asr_model = asr_model.to(device)
        asr_model.eval()
        
        # Ready Signal an Node.js senden
        print(json.dumps({"status": "ready", "model": model_name, "device": device}), flush=True)
    except Exception as e:
        print(json.dumps({"error": f"Failed to load model: {str(e)}"}), flush=True)
        sys.exit(1)

    # Hauptschleife für Befehle von stdin
    for line in sys.stdin:
        try:
            command = json.loads(line)
            method = command.get("method")
            
            if method == "transcribe":
                audio_path = command.get("path")
                if not audio_path or not os.path.exists(audio_path):
                    print(json.dumps({"error": "Invalid audio path"}), flush=True)
                    continue

                # Transkription durchführen
                with torch.no_grad():
                    # NeMo transcribe erwartet eine Liste von Pfaden
                    transcriptions = asr_model.transcribe([audio_path])
                    
                # Ergebnis senden (NeMo gibt je nach Modell Typen zurück, wir brauchen den Text)
                text = transcriptions[0] if isinstance(transcriptions[0], str) else transcriptions[0][0]
                
                print(json.dumps({
                    "status": "success",
                    "text": text,
                    "path": audio_path
                }), flush=True)
            
            elif method == "ping":
                print(json.dumps({"status": "pong"}), flush=True)
                
            elif method == "exit":
                break
                
        except Exception as e:
            print(json.dumps({"error": str(e)}), flush=True)

if __name__ == "__main__":
    main()
