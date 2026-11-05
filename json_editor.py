import os
import json
import time
from server import PromptServer
from aiohttp import web

DATA_DIR = os.path.join(os.path.dirname(__file__), "data", "json")
os.makedirs(DATA_DIR, exist_ok=True)

class JSONEditorNode:
    """
    JSONEditorNode (rsl JSON Interactive Editor & Studio)
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "json_input": ("STRING", {
                    "forceInput": True, 
                    "default": "",
                    "tooltip": "Incoming JSON string wire connection."
                }),
            },
            "hidden": {
                "json_value": ("STRING", {"default": "{}"}),
                "active_filename": ("STRING", {"default": "payload.json"}),
                "auto_capture": ("BOOLEAN", {"default": False}),
            }
        }

    RETURN_TYPES = ("STRING", "STRING", "BOOLEAN")
    RETURN_NAMES = ("json", "org json", "success")
    OUTPUT_NODE = True
    FUNCTION = "process_json"
    CATEGORY = "rsl/tools"
    DESCRIPTION = "Interactive collapsible JSON Editor with search, replace, auto-capture, status bar, and file management."

    def process_json(self, json_input="", json_value="{}", active_filename="payload.json", auto_capture=False):
        org_json = json_input if json_input and json_input.strip() else json_value
        
        # Auto-capture ALWAYS generates a new unique timestamped file
        if auto_capture and json_input and json_input.strip():
            final_json = json_input
            final_filename = f"capture_{int(time.time() * 1000)}.json"

            try:
                parsed = json.loads(json_input)
                path = os.path.join(DATA_DIR, os.path.basename(final_filename))
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(parsed, f, indent=2, ensure_ascii=False)
            except Exception:
                pass
        else:
            final_json = json_value if json_value and json_value.strip() else org_json
            final_filename = active_filename if active_filename else "payload.json"

        success = True
        try:
            json.loads(final_json)
        except Exception:
            success = False

        PromptServer.instance.send_sync("rsl_json_editor_captured", {
            "json_data": final_json,
            "filename": final_filename,
            "auto_capture": auto_capture
        })

        return {"ui": {"captured_json": [final_json], "filename": [final_filename]}, "result": (final_json, org_json, success)}


# --- WEB API ROUTES ---
routes = PromptServer.instance.routes

@routes.get("/rsl_json_editor/list_files")
async def list_files(request):
    os.makedirs(DATA_DIR, exist_ok=True)
    files = [f for f in os.listdir(DATA_DIR) if f.endswith(".json")]
    if not files:
        files = ["payload.json"]
        default_path = os.path.join(DATA_DIR, "payload.json")
        if not os.path.exists(default_path):
            with open(default_path, "w", encoding="utf-8") as f:
                json.dump({"example": "Welcome to JSON Editor", "items": [1, 2, 3]}, f, indent=2)
    return web.json_response(sorted(files))

@routes.get("/rsl_json_editor/load_file")
async def load_file(request):
    filename = request.query.get("filename", "payload.json")
    clean_name = os.path.basename(filename)
    path = os.path.join(DATA_DIR, clean_name)
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
                return web.json_response({"status": "success", "data": content, "filename": clean_name})
        except Exception as e:
            return web.json_response({"status": "error", "message": str(e)})
    return web.json_response({"status": "error", "message": "File not found"})

@routes.post("/rsl_json_editor/save_file")
async def save_file(request):
    data = await request.json()
    filename = os.path.basename(data.get("filename", "payload.json"))
    if not filename.endswith(".json"):
        filename += ".json"
    content = data.get("content", "{}")
    
    path = os.path.join(DATA_DIR, filename)
    try:
        parsed = json.loads(content)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(parsed, f, indent=2, ensure_ascii=False)
        return web.json_response({"status": "success", "filename": filename})
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)})

@routes.post("/rsl_json_editor/rename_file")
async def rename_file(request):
    data = await request.json()
    old_filename = os.path.basename(data.get("old_filename", ""))
    new_filename = os.path.basename(data.get("new_filename", ""))
    if not new_filename.endswith(".json"):
        new_filename += ".json"
        
    if not old_filename or not new_filename:
        return web.json_response({"status": "error", "message": "Missing file names"})
        
    old_path = os.path.join(DATA_DIR, old_filename)
    new_path = os.path.join(DATA_DIR, new_filename)
    
    if os.path.exists(old_path):
        try:
            os.rename(old_path, new_path)
            return web.json_response({"status": "success", "filename": new_filename})
        except Exception as e:
            return web.json_response({"status": "error", "message": str(e)})
    return web.json_response({"status": "error", "message": "Source file not found"})

@routes.post("/rsl_json_editor/delete_file")
async def delete_file(request):
    data = await request.json()
    filename = os.path.basename(data.get("filename", ""))
    if not filename:
        return web.json_response({"status": "error", "message": "No filename provided"})
    
    path = os.path.join(DATA_DIR, filename)
    if os.path.exists(path):
        try:
            os.remove(path)
            return web.json_response({"status": "success", "filename": filename})
        except Exception as e:
            return web.json_response({"status": "error", "message": str(e)})
    return web.json_response({"status": "error", "message": "File not found"})

NODE_CLASS_MAPPINGS = {
    "JSONEditorNode": JSONEditorNode
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "JSONEditorNode": "rsl JSON Interactive Editor & Studio"
}