import os
import yaml
import glob
import json
from server import PromptServer
from aiohttp import web

# Force all strings to be double-quoted in PyYAML to prevent ai-toolkit parsing/import errors
def quoted_presenter(dumper, data):
    return dumper.represent_scalar('tag:yaml.org,2002:str', data, style='"')

yaml.SafeDumper.add_representer(str, quoted_presenter)
yaml.Dumper.add_representer(str, quoted_presenter)

PRESETS_FILE = os.path.join(os.path.dirname(__file__), "ai_toolkit_presets.json")

# Complete model mapping definition for ai-toolkit schema compliance
MODEL_MAPPINGS = {
    "Flux.1 Dev": {
        "name_or_path": "black-forest-labs/FLUX.1-dev",
        "is_flux": True,
        "arch": "flux"
    },
    "Flux.1 Schnell": {
        "name_or_path": "black-forest-labs/FLUX.1-schnell",
        "is_flux": True,
        "arch": "flux"
    },
    "Krea-2-Raw": {
        "name_or_path": "krea/Krea-2-Raw",
        "is_flux": True,
        "arch": "flux"
    },
    "Krea-2-Turbo": {
        "name_or_path": "krea/Krea-2-Turbo",
        "is_flux": True,
        "arch": "flux"
    },
    "SDXL Base": {
        "name_or_path": "stabilityai/stable-diffusion-xl-base-1.0",
        "is_flux": False,
        "arch": "sdxl"
    }
}

def load_presets():
    default_presets = {
        "Flux.1 Dev - Standard": {
            "model_choice": "Flux.1 Dev",
            "lora_name": "flux_character_lora",
            "trigger_word": "ohwxperson",
            "resolution": "1024",
            "repeats": 10,
            "steps": 2000,
            "batch_size": 1,
            "gradient_accumulation_steps": 1,
            "network_rank": 16,
            "network_alpha": 16,
            "optimizer": "adamw8bit",
            "learning_rate": 0.0001,
            "save_dtype": "BF16",
            "save_every": 250
        }
    }
    if os.path.exists(PRESETS_FILE):
        try:
            with open(PRESETS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data if data else default_presets
        except Exception:
            return default_presets
    else:
        save_presets(default_presets)
        return default_presets

def save_presets(presets):
    with open(PRESETS_FILE, "w", encoding="utf-8") as f:
        json.dump(presets, f, indent=4)

if PromptServer.instance and hasattr(PromptServer.instance, "app"):
    app = PromptServer.instance.app

    async def get_presets_api(request):
        return web.json_response(load_presets())

    async def save_preset_api(request):
        data = await request.json()
        preset_name = data.get("name")
        preset_data = data.get("data")
        if preset_name and preset_data:
            presets = load_presets()
            presets[preset_name] = preset_data
            save_presets(presets)
            return web.json_response({"status": "success", "presets": presets})
        return web.json_response({"status": "error", "message": "Invalid data"}, status=400)

    async def delete_preset_api(request):
        data = await request.json()
        preset_name = data.get("name")
        presets = load_presets()
        if preset_name in presets:
            del presets[preset_name]
            save_presets(presets)
            return web.json_response({"status": "success", "presets": presets})
        return web.json_response({"status": "error", "message": "Preset not found"}, status=404)

    app.router.add_get("/rsl/get_presets", get_presets_api)
    app.router.add_post("/rsl/save_preset", save_preset_api)
    app.router.add_post("/rsl/delete_preset", delete_preset_api)

class DatasetYAMLViewer:
    @classmethod
    def INPUT_TYPES(s):
        presets = load_presets()
        preset_names = list(presets.keys())
        
        return {
            "required": {
                "dataset_path": ("STRING", {"default": "D:/datasets/input/may-face-01-768"}),
                "preset": (preset_names, {"default": preset_names[0] if preset_names else "Default"}),
                "filename": ("STRING", {"default": "config_character.yaml"}),
                "cache_buster": ("STRING", {"default": "0"}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("yaml_config_string",)
    OUTPUT_NODE = True
    FUNCTION = "generate_and_save_yaml"

    CATEGORY = "🧪AILab/📝JoyCaption"

    def generate_and_save_yaml(self, dataset_path, preset, filename, cache_buster="0"):
        clean_path = os.path.abspath(dataset_path).replace("\\", "/")
        
        if not filename or not filename.strip():
            filename = "config_character.yaml"
        elif not filename.lower().endswith(('.yaml', '.yml')):
            filename += ".yaml"

        presets = load_presets()
        p = presets.get(preset)
        if not p:
            matching_key = next((k for k in presets.keys() if k.lower() == preset.lower()), None)
            if matching_key:
                p = presets[matching_key]
            else:
                p = list(presets.values())[0] if presets else {}

        image_extensions = ("*.png", "*.jpg", "*.jpeg", "*.webp")
        image_files = []
        if os.path.exists(clean_path):
            for ext in image_extensions:
                image_files.extend(glob.glob(os.path.join(clean_path, ext)))
                image_files.extend(glob.glob(os.path.join(clean_path, ext.upper())))
            txt_files = glob.glob(os.path.join(clean_path, "*.txt"))
        else:
            txt_files = []

        img_count = len(image_files)
        txt_count = len(txt_files)
        res_int = int(p.get("resolution", 1024))
        
        # Pull model choice key safely with fallback
        model_choice_key = p.get("model_choice", "Flux.1 Dev")
        model_meta = MODEL_MAPPINGS.get(model_choice_key, MODEL_MAPPINGS["Flux.1 Dev"])

        config_data = {
            "job": "extension",
            "config": {
                "name": p.get("lora_name", "flux_character_lora"),
                "process": [
                    {
                        "type": "sd_trainer",
                        "training_folder": "output",
                        "device": "cuda:0",
                        "trigger_word": p.get("trigger_word", "ohwxperson"),
                        "model": {
                            "name_or_path": model_meta["name_or_path"],
                            "is_flux": model_meta["is_flux"],
                            "arch": model_meta["arch"],
                            "quantize": True
                        },
                        "network": {
                            "type": "lora",
                            "linear": int(p.get("network_rank", 16)),
                            "linear_alpha": int(p.get("network_alpha", 16))
                        },
                        "train": {
                            "batch_size": int(p.get("batch_size", 1)),
                            "steps": int(p.get("steps", 2000)),
                            "gradient_accumulation_steps": int(p.get("gradient_accumulation_steps", 1)),
                            "train_unet": True,
                            "train_text_encoder": False,
                            "gradient_checkpointing": True,
                            "lr": float(p.get("learning_rate", 0.0001)),
                            "optimizer": p.get("optimizer", "adamw8bit").lower()
                        },
                        "save": {
                            "dtype": p.get("save_dtype", "BF16"),
                            "save_every": int(p.get("save_every", 250)),
                            "max_step_saves_to_keep": 4
                        },
                        "datasets": [
                            {
                                "folder_path": clean_path,
                                "caption_ext": "txt",
                                "num_repeats": int(p.get("repeats", 1)),
                                "cache_latents_to_disk": True,
                                "resolution": [res_int]
                            }
                        ]
                    }
                ]
            }
        }

        yaml_output = yaml.dump(config_data, sort_keys=False, default_flow_style=False)
        
        saved_file_path = ""
        if os.path.exists(clean_path):
            saved_file_path = os.path.join(clean_path, filename).replace("\\", "/")
            with open(saved_file_path, "w", encoding="utf-8") as f:
                f.write(yaml_output)

        stats_header = f"# [Preset]: {preset} | Model: {model_meta['name_or_path']} | Steps: {p.get('steps')} | Bust: {cache_buster}\n# [Stats] Images: {img_count} | Captions: {txt_count}\n# [Saved] -> {saved_file_path}\n\n"
        final_output = stats_header + yaml_output

        return {"ui": {"text": (final_output,)}, "result": (final_output,)}