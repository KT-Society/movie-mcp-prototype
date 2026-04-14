import sys
import json
import os
import io
import base64
import traceback

# Pfad-Setup für lokale Modelle
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODELS_DIR = os.path.join(BASE_DIR, "models")

os.environ['HF_HOME'] = MODELS_DIR
os.environ['NEMO_CACHE_DIR'] = MODELS_DIR

def main():
    # ERSTE MELDUNG: Bevor irgendwas geladen wird!
    print(json.dumps({"status": "starting", "message": "Prozess gestartet, lade AI-Bibliotheken..."}), flush=True)

    try:
        import torch
        import logging
        from PIL import Image
        
        # Hardware Check
        cuda_available = torch.cuda.is_available()
        diag = {
            "status": "info",
            "torch_version": torch.__version__,
            "cuda_available": cuda_available,
            "gpu": torch.cuda.get_device_name(0) if cuda_available else "N/A"
        }
        print(json.dumps(diag), flush=True)

        print(json.dumps({"status": "loading", "model": "nemo_asr"}), flush=True)
        import nemo.collections.asr as nemo_asr
        
        print(json.dumps({"status": "loading", "model": "transformers"}), flush=True)
        from transformers import AutoProcessor, AutoModelForVision2Seq

        device = "cuda" if cuda_available else "cpu"
        dtype = torch.float16 if device == "cuda" else torch.float32

        # --- Modelle laden ---
        print(json.dumps({"status": "loading", "model": "parakeet-tdt", "on": device}), flush=True)
        asr_model = nemo_asr.models.ASRModel.from_pretrained("nvidia/parakeet-tdt-0.6b-v3")
        asr_model = asr_model.to(device)
        asr_model.eval()

        print(json.dumps({"status": "loading", "model": "smolvlm2", "on": device}), flush=True)
        vlm_model_id = "HuggingFaceTB/SmolVLM2-2.2B-Instruct"
        vlm_processor = AutoProcessor.from_pretrained(vlm_model_id)
        
        try:
            vlm_model = AutoModelForVision2Seq.from_pretrained(
                vlm_model_id, 
                torch_dtype=dtype,
                trust_remote_code=True
            ).to(device)
        except ValueError as e:
            if "Unrecognized configuration class" in str(e):
                import transformers
                if hasattr(transformers, "SmolVLMForConditionalGeneration"):
                    print(json.dumps({"status": "info", "message": "Bypassing AutoModel mapper bug for SmolVLM..."}), flush=True)
                    vlm_model = transformers.SmolVLMForConditionalGeneration.from_pretrained(
                        vlm_model_id,
                        torch_dtype=dtype,
                        trust_remote_code=True
                    ).to(device)
                else:
                    raise
            else:
                raise
        
        vlm_model.eval()

        print(json.dumps({"status": "ready", "device": device}), flush=True)

    except BaseException as e:
        print(json.dumps({
            "status": "error", 
            "error": f"[{type(e).__name__}] {str(e)}", 
            "traceback": traceback.format_exc()
        }), flush=True)
        sys.exit(1)

    # Hauptschleife
    for line in sys.stdin:
        try:
            command = json.loads(line)
            method = command.get("method")
            
            if method == "transcribe":
                audio_path = command.get("path")
                with torch.no_grad():
                    transcriptions = asr_model.transcribe([audio_path])
                    text = transcriptions[0] if isinstance(transcriptions[0], str) else transcriptions[0][0]
                print(json.dumps({"status": "success", "type": "asr", "text": text}), flush=True)

            elif method == "analyze_image":
                image_path = command.get("path")
                prompt = command.get("prompt", "Analyze this frame.")
                image = Image.open(image_path).convert("RGB")
                
                messages = [{"role": "user", "content": [{"type": "image"}, {"type": "text", "text": prompt}]}]
                inputs = vlm_processor(text=[vlm_processor.apply_chat_template(messages, add_generation_prompt=True)], images=[image], return_tensors="pt").to(device)
                
                with torch.no_grad():
                    generated_ids = vlm_model.generate(**inputs, max_new_tokens=512)
                    generated_texts = vlm_processor.batch_decode(generated_ids, skip_special_tokens=True)
                
                response = generated_texts[0].split("assistant\n")[-1]
                print(json.dumps({"status": "success", "type": "vlm", "description": response}), flush=True)

            elif method == "exit":
                break
        except Exception as e:
            print(json.dumps({"error": str(e)}), flush=True)

if __name__ == "__main__":
    main()
