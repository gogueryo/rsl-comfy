import os
import json
import torch
from server import PromptServer
from aiohttp import web

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(CURRENT_DIR, "data", "prompts")

def load_db_file(base_dir, db_name):
    active_dir = base_dir if base_dir and os.path.isdir(base_dir) else DATA_DIR
    safe_name = db_name.replace("\\", "/")
    path = os.path.join(active_dir, f"{safe_name}.json")
    
    if not os.path.exists(path):
        path = os.path.join(active_dir, f"{os.path.basename(db_name)}.json")

    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []

def get_all_json_dbs(base_dir):
    target_dir = base_dir if base_dir and os.path.isdir(base_dir) else DATA_DIR
    dbs = []
    if not os.path.exists(target_dir):
        return ["prompts_db"]
    for root, dirs, files in os.walk(target_dir):
        for file in files:
            if file.endswith(".json"):
                rel_path = os.path.relpath(os.path.join(root, file), target_dir)
                db_name = rel_path[:-5].replace("\\", "/")
                dbs.append(db_name)
    if "prompts_db" not in dbs:
        dbs.insert(0, "prompts_db")
    return sorted(dbs)

class PromptDriverNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "active_db": ("STRING", {"default": "prompts_db"}),
                "entry_index": ("INT", {"default": 0, "min": 0, "max": 9999, "step": 1}),
                "master_root": ("STRING", {"default": ""}),
            },
            "optional": {},
            "hidden": {
                "node_id": "UNIQUE_ID"
            }
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING", "STRING", "STRING", "INT", "FLOAT", "FLOAT", "INT")
    RETURN_NAMES = ("prompt", "negative", "model", "loras", "config", "steps", "cfg", "denoise", "seed")
    FUNCTION = "drive_prompt"
    CATEGORY = "rsl/tools"

    def drive_prompt(self, active_db="prompts_db", entry_index=0, master_root="", node_id=None):
        db_data = load_db_file(master_root, active_db)
        total = len(db_data)

        if total > 0 and entry_index >= total:
            raise ValueError(f"🟢 [PromptDriver] Batch complete! Successfully processed all {total} items in '{active_db}'. Queue halted.")

        p_text = ""
        n_text = ""
        model = "undefined"
        loras = ""
        config = ""
        steps = 20
        cfg = 8.0
        denoise = 1.0
        seed = 0

        if total > 0:
            idx = max(0, min(int(entry_index), total - 1))
            entry = db_data[idx]
            p_text = entry.get("prompt", "")
            n_text = entry.get("negative", "")
            model = entry.get("model", "undefined")
            loras = entry.get("loras", "")
            config = entry.get("config", "")
            
            img_info = entry.get("image_info", {})
            steps = int(img_info.get("steps", 20))
            cfg = float(img_info.get("cfg", 8.0))
            denoise = float(img_info.get("denoise", 1.0))
            seed = int(img_info.get("seed", 0))

        return {
            "ui": {
                "active_db": [active_db],
                "entry_index": [entry_index],
                "master_root": [master_root],
                "loaded_prompt": [p_text]
            },
            "result": (p_text, n_text, model, loras, config, steps, cfg, denoise, seed)
        }


# --- WEB API ROUTES FOR DRIVER ---

routes = PromptServer.instance.routes

@routes.post("/prompt_driver/list_dbs")
async def driver_list_dbs(request):
    try:
        data = await request.json()
        master_root = data.get("master_root", "")
        dbs = get_all_json_dbs(master_root)
        return web.json_response(dbs)
    except Exception:
        return web.json_response(["prompts_db"])


NODE_CLASS_MAPPINGS = {
    "PromptDriverNode": PromptDriverNode
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PromptDriverNode": "rsl Prompt Driver"
}