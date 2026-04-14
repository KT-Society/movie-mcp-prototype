import sys
import json
import os
import torch
import logging
from PIL import Image
import io
import base64

# Logging unterdrücken für Sauberkeit
logging.getLogger("nemo").setLevel(logging.ERROR)
logging.getLogger("transformers").setLevel(logging.ERROR)

try:
    import nemo.collections.asr as nemo_asr
    from transformers import AutoProcessor, AutoModelForVision2Seq
except ImportError:
    print(json.dumps({"error": "Missing dependencies. Run: pip install nemo_toolkit[asr] transformers pillow torch"}))
    sys.exit(1)

def main():
    print(json.dumps({"status": "starting", "message": "Initialisiere Unified AI Worker..."}), flush=True)
    
    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.bfloat16 if device == "cuda" else torch.float32

    try:
        # --- 1. Load Parakeet STT ---
        print(json.dumps({"status": "loading", "model": "parakeet-tdt"}), flush=True)
        asr_model = nemo_asr.models.ASRModel.from_pretrained("nvidia/parakeet-tdt-0.6b-v3")
        asr_model = asr_model.to(device)
        asr_model.eval()

        # --- 2. Load SmolVLM2 ---
        print(json.dumps({"status": "loading", "model": "smolvlm2"}), flush=True)
        vlm_model_id = "HuggingFaceTB/SmolVLM2-2.2B-Instruct"
        vlm_processor = AutoProcessor.from_pretrained(vlm_model_id)
        vlm_model = AutoModelForVision2Seq.from_pretrained(
            vlm_model_id, 
            torch_dtype=dtype,
            low_cpu_mem_usage=True
        ).to(device)
        vlm_model.eval()

        print(json.dumps({"status": "ready", "device": device, "vram": f"{torch.cuda.get_device_properties(0).total_memory / 1e9:.1f}GB" if device == "cuda" else "N/A"}), flush=True)
    except Exception as e:
        print(json.dumps({"error": f"Initialization failed: {str(e)}"}), flush=True)
        sys.exit(1)

    # Hauptschleife
    for line in sys.stdin:
        try:
            command = json.loads(line)
            method = command.get("method")
            
            # --- METHOD: TRANSCRIBE ---
            if method == "transcribe":
                audio_path = command.get("path")
                with torch.no_grad():
                    transcriptions = asr_model.transcribe([audio_path])
                    text = transcriptions[0] if isinstance(transcriptions[0], str) else transcriptions[0][0]
                print(json.dumps({"status": "success", "type": "asr", "text": text, "path": audio_path}), flush=True)

            # --- METHOD: ANALYZE_IMAGE ---
            elif method == "analyze_image":
                image_path = command.get("path")
                prompt = command.get("prompt", "Analyze this frame. Describe the scene, mood and entities.")
                
                image = Image.open(image_path).convert("RGB")
                
                # SmolVLM2 Prompt-Format
                messages = [
                    {
                        "role": "user",
                        "content": [
                            {"type": "image"},
                            {"type": "text", "text": prompt}
                        ]
                    }
                ]
                
                inputs = vlm_processor(text=[vlm_processor.apply_chat_template(messages, add_generation_prompt=True)], images=[image], return_tensors="pt").to(device)
                
                with torch.no_grad():
                    generated_ids = vlm_model.generate(**inputs, max_new_tokens=command.get("max_tokens", 512))
                    generated_texts = vlm_processor.batch_decode(generated_ids, skip_special_tokens=True)
                
                # Extrahiere Antwort (Transformers Chat Template gibt oft den gesamten Verlauf zurück)
                response = generated_texts[0].split("assistant\n")[-1] if "assistant\n" in generated_texts[0] else generated_texts[0]
                
                print(json.dumps({"status": "success", "type": "vlm", "description": response, "path": image_path}), flush=True)

            elif method == "exit":
                break
                
        except Exception as e:
            print(json.dumps({"error": str(e)}), flush=True)

if __name__ == "__main__":
    main()
