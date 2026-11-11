import os
import time
import json
import uuid
import torch
import numpy as np
from PIL import Image
import io
import base64
from datetime import datetime
import folder_paths
from server import PromptServer
from aiohttp import web

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(CURRENT_DIR, "data", "prompts")
CONFIG_FILE = os.path.join(CURRENT_DIR, "master_config.json")
os.makedirs(DATA_DIR, exist_ok=True)


def get_master_dir():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                cfg = json.load(f)
                p = cfg.get("master_dir")
                if p and os.path.isdir(p):
                    return p
        except Exception:
            pass
    return DATA_DIR


def set_master_dir(path):
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump({"master_dir": path}, f, indent=2)


def get_active_data_dir():
    master = get_master_dir()
    if master:
        os.makedirs(master, exist_ok=True)
        return master
    os.makedirs(DATA_DIR, exist_ok=True)
    return DATA_DIR


def get_target_data_dir(source):
    master_root = None
    if isinstance(source, dict):
        master_root = source.get("master_root")
    elif hasattr(source, "query"):
        master_root = source.query.get("master_root")
    elif hasattr(source, "get"):
        master_root = source.get("master_root")

    if master_root and os.path.isdir(master_root):
        os.makedirs(master_root, exist_ok=True)
        return master_root
    return get_active_data_dir()


def get_images_dir(active_dir=None):
    base = (
        active_dir
        if (active_dir and os.path.isdir(active_dir))
        else get_active_data_dir()
    )
    img_dir = os.path.join(base, "images")
    os.makedirs(img_dir, exist_ok=True)
    return img_dir


def get_db_path(db_name, active_dir=None):
    base = (
        active_dir
        if (active_dir and os.path.isdir(active_dir))
        else get_active_data_dir()
    )
    safe_name = (
        "".join(c for c in db_name if c.isalnum() or c in ("_", "-")) or "prompts_db"
    )
    return os.path.join(base, f"{safe_name}.json")


def load_db_file(db_name, active_dir=None):
    path = get_db_path(db_name, active_dir)
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                for item in data:
                    if not item.get("id"):
                        item["id"] = str(uuid.uuid4())
                return data
        except Exception:
            return []
    return []


def save_db_file(db_name, data, active_dir=None):
    path = get_db_path(db_name, active_dir)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def broadcast_database_refresh(
    db_name, master_root, action, item_id=None, instance_uuid=None
):
    try:
        PromptServer.instance.send_sync(
            "rsl-database-refreshed",
            {
                "db": db_name,
                "master_root": master_root or "",
                "action": action,
                "item_id": item_id,
                "instance_uuid": str(instance_uuid) if instance_uuid else "",
            },
        )
    except Exception as e:
        print(f"[PromptTracker] Failed to broadcast WebSocket event: {e}")


def extract_image_bytes(img_val, active_dir=None, source_master_root=None):
    try:
        if not img_val:
            return None
        if img_val.startswith("data:image"):
            header, encoded = img_val.split(",", 1)
            return base64.b64decode(encoded)
        elif "/view?filename=" in img_val:
            from urllib.parse import parse_qs, urlparse

            parsed = urlparse(img_val)
            qs = parse_qs(parsed.query)
            fname = qs.get("filename", [""])[0]
            ftype = qs.get("type", ["temp"])[0]
            subfolder = qs.get("subfolder", [""])[0]

            target_dir = (
                folder_paths.get_temp_directory()
                if ftype == "temp"
                else folder_paths.get_output_directory()
            )
            full_p = os.path.join(target_dir, subfolder, fname)
            if os.path.exists(full_p):
                with open(full_p, "rb") as f:
                    return f.read()
        elif "/prompt_tracker/view_image?filename=" in img_val:
            from urllib.parse import parse_qs, urlparse

            parsed = urlparse(img_val)
            qs = parse_qs(parsed.query)
            fname = qs.get("filename", [""])[0]

            img_dir = get_images_dir(active_dir)
            full_p = os.path.join(img_dir, fname)

            if not os.path.exists(full_p) and source_master_root:
                source_img_dir = get_images_dir(source_master_root)
                full_p = os.path.join(source_img_dir, fname)

            if os.path.exists(full_p):
                with open(full_p, "rb") as f:
                    return f.read()
    except Exception:
        pass
    return None


def file_to_data_uri(file_path):
    if os.path.exists(file_path):
        try:
            with open(file_path, "rb") as f:
                encoded = base64.b64encode(f.read()).decode("utf-8")
                return f"data:image/png;base64,{encoded}"
        except Exception:
            pass
    return ""


def delete_offloaded_file(image_info, active_dir=None):
    try:
        img_url = image_info.get("image", "") if isinstance(image_info, dict) else ""
        if "/prompt_tracker/view_image?filename=" in img_url:
            fname = img_url.split("filename=")[1].split("&")[0]
            paths_to_check = []
            if active_dir:
                paths_to_check.append(os.path.join(get_images_dir(active_dir), fname))
            paths_to_check.append(os.path.join(get_images_dir(), fname))

            for p in paths_to_check:
                if os.path.exists(p):
                    try:
                        os.remove(p)
                    except Exception:
                        pass
    except Exception:
        pass


def process_image_storage(
    image_info,
    is_embedded,
    existing_image_info=None,
    active_dir=None,
    source_master_root=None,
):
    if not image_info:
        image_info = {"image": ""}

    current_img = image_info.get("image", "")

    if not current_img and existing_image_info and existing_image_info.get("image"):
        current_img = existing_image_info.get("image")
        image_info["image"] = current_img

    if not current_img:
        return image_info

    if not is_embedded:
        target_filename = None
        if existing_image_info and isinstance(existing_image_info, dict):
            ext_url = existing_image_info.get("image", "")
            if "/prompt_tracker/view_image?filename=" in ext_url:
                try:
                    target_filename = ext_url.split("filename=")[1].split("&")[0]
                except Exception:
                    pass

        if not target_filename:
            target_filename = f"{uuid.uuid4()}.png"

        img_bytes = extract_image_bytes(current_img, active_dir, source_master_root)
        if img_bytes:
            dest_path = os.path.join(get_images_dir(active_dir), target_filename)
            with open(dest_path, "wb") as f:
                f.write(img_bytes)
            image_info["image"] = (
                f"/prompt_tracker/view_image?filename={target_filename}"
            )
    else:
        file_to_purge = None
        for info in [image_info, existing_image_info]:
            if info and isinstance(info, dict):
                img_url = info.get("image", "")
                if "/prompt_tracker/view_image?filename=" in img_url:
                    try:
                        file_to_purge = img_url.split("filename=")[1].split("&")[0]
                        break
                    except Exception:
                        pass

        if "/prompt_tracker/view_image?filename=" in current_img:
            try:
                fname = current_img.split("filename=")[1].split("&")[0]
                src_path = os.path.join(get_images_dir(active_dir), fname)
                if not os.path.exists(src_path) and source_master_root:
                    src_path = os.path.join(get_images_dir(source_master_root), fname)
                if not os.path.exists(src_path):
                    src_path = os.path.join(get_images_dir(), fname)

                data_uri = file_to_data_uri(src_path)
                if data_uri:
                    image_info["image"] = data_uri
            except Exception:
                pass
        elif current_img.startswith("data:image"):
            image_info["image"] = current_img

        if file_to_purge:
            delete_offloaded_file(
                {"image": f"/prompt_tracker/view_image?filename={file_to_purge}"},
                active_dir,
            )

    return image_info


def get_all_referenced_images(data_dir):
    referenced_files = set()
    json_dir = data_dir
    if not os.path.exists(json_dir):
        return referenced_files

    for file_name in os.listdir(json_dir):
        if file_name.endswith(".json"):
            db_path = os.path.join(json_dir, file_name)
            try:
                with open(db_path, "r", encoding="utf-8") as f:
                    entries = json.load(f)
                    for entry in entries:
                        img_info = entry.get("image_info") or {}
                        img_path = img_info.get("image", "")
                        if "/prompt_tracker/view_image?filename=" in img_path:
                            try:
                                fname = img_path.split("filename=")[1].split("&")[0]
                                if fname:
                                    referenced_files.add(fname)
                            except Exception:
                                pass
            except Exception:
                pass
    return referenced_files


class PromptTrackerNode:

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "AutoCaptureOn": ("BOOLEAN", {"default": True}),
            },
            "optional": {
                "enable_auto_capture": ("BOOLEAN", {"forceInput": True}),
                "auto_prompt": ("STRING", {"forceInput": True}),
                "auto_negative": ("STRING", {"forceInput": True}),
                "auto_render_model": ("STRING", {"forceInput": True}),
                "auto_lora_info": ("STRING", {"forceInput": True}),
                "auto_image": ("IMAGE", {"forceInput": True}),
                "auto_steps": ("INT", {"forceInput": True}),
                "auto_cfg": ("FLOAT", {"forceInput": True}),
                "auto_denoise": ("FLOAT", {"forceInput": True}),
                "auto_seed": ("INT", {"forceInput": True}),
                "prompt_value": ("STRING", {"default": ""}),
                "negative_value": ("STRING", {"default": ""}),
                "category_value": ("STRING", {"default": "General"}),
                "model_value": ("STRING", {"default": "undefined"}),
                "loras_value": ("STRING", {"default": ""}),
                "config_value": ("STRING", {"default": ""}),
                "source_value": ("STRING", {"default": ""}),
                "tag_value": ("STRING", {"default": ""}),
                "image_value": ("STRING", {"default": ""}),
                "steps": ("INT", {"default": 20}),
                "cfg": ("FLOAT", {"default": 8.0}),
                "denoise": ("FLOAT", {"default": 1.0}),
                "seed": ("INT", {"default": 0}),
                "active_db": ("STRING", {"default": "prompts_db"}),
                "master_root": ("STRING", {"default": ""}),
            },
            "hidden": {"node_id": "UNIQUE_ID", "prompt": "PROMPT"},
        }

    RETURN_TYPES = (
        "STRING",
        "STRING",
        "STRING",
        "STRING",
        "STRING",
        "STRING",
        "INT",
        "FLOAT",
        "FLOAT",
        "INT",
        "STRING",
        "STRING",
        "IMAGE",
    )
    RETURN_NAMES = (
        "prompt",
        "negative",
        "category",
        "render_model",
        "lora_info",
        "config",
        "steps",
        "cfg",
        "denoise",
        "seed",
        "source",
        "tag",
        "image",
    )
    FUNCTION = "track_prompt"
    CATEGORY = "rsl/tools"

    def is_auto_prompt(self, AutoCaptureOn, enable_auto_capture=None):
        val = enable_auto_capture if enable_auto_capture is not None else AutoCaptureOn
        if isinstance(val, (list, tuple)):
            val = val[0] if len(val) > 0 else True
        return bool(val)

    def track_prompt(
        self,
        AutoCaptureOn=True,
        enable_auto_capture=None,
        auto_prompt="",
        auto_negative="",
        auto_render_model="",
        auto_lora_info="",
        auto_image=None,
        auto_steps=None,
        auto_cfg=None,
        auto_denoise=None,
        auto_seed=None,
        prompt_value="",
        negative_value="",
        category_value="General",
        model_value="undefined",
        loras_value="",
        config_value="",
        source_value="",
        tag_value="",
        image_value="",
        steps=20,
        cfg=8.0,
        denoise=1.0,
        seed=0,
        active_db="prompts_db",
        master_root="",
        instance_uuid="",
        node_id=None,
        prompt=None,
    ):

        def unwrap(val, default=""):
            v = val
            while isinstance(v, (list, tuple)):
                if len(v) > 0:
                    v = v[0]
                else:
                    v = default
                    break
            return str(v) if v is not None else default

        raw_auto = unwrap(auto_prompt)
        raw_auto_neg = unwrap(auto_negative)
        raw_auto_model = unwrap(auto_render_model)
        raw_auto_lora = unwrap(auto_lora_info)
        final_instance_uuid = unwrap(instance_uuid)

        final_prompt = raw_auto if raw_auto.strip() else str(prompt_value or "")
        final_negative = (
            raw_auto_neg if raw_auto_neg.strip() else str(negative_value or "")
        )
        final_model = (
            raw_auto_model
            if raw_auto_model.strip()
            else str(model_value or "undefined")
        )
        final_lora_info = (
            raw_auto_lora if raw_auto_lora.strip() else str(loras_value or "")
        )

        final_steps = (
            int(auto_steps[0])
            if isinstance(auto_steps, (list, tuple)) and len(auto_steps) > 0
            else (int(auto_steps) if auto_steps is not None else steps)
        )
        final_cfg = (
            float(auto_cfg[0])
            if isinstance(auto_cfg, (list, tuple)) and len(auto_cfg) > 0
            else (float(auto_cfg) if auto_cfg is not None else cfg)
        )
        final_denoise = (
            float(auto_denoise[0])
            if isinstance(auto_denoise, (list, tuple)) and len(auto_denoise) > 0
            else (float(auto_denoise) if auto_denoise is not None else denoise)
        )
        final_seed = (
            int(auto_seed[0])
            if isinstance(auto_seed, (list, tuple)) and len(auto_seed) > 0
            else (int(auto_seed) if auto_seed is not None else seed)
        )

        output_image_tensor = None
        should_capture = self.is_auto_prompt(AutoCaptureOn, enable_auto_capture)
        # One JSON payload per image. ComfyUI's "executed" event delivers the
        # list once per run; the frontend adds each entry.
        auto_capture_list = []

        if raw_auto.strip() and auto_image is not None:
            output_image_tensor = auto_image
            if should_capture and node_id is not None:
                try:
                    output_dir = folder_paths.get_temp_directory()
                    os.makedirs(output_dir, exist_ok=True)

                    if isinstance(auto_image, torch.Tensor) and auto_image.ndim == 4:
                        frames = [auto_image[i] for i in range(auto_image.shape[0])]
                    else:
                        frames = [auto_image]

                    for tensor_to_save in frames:
                        image_np = 255.0 * tensor_to_save.detach().cpu().numpy()
                        image_np = np.clip(image_np, 0, 255).astype(np.uint8)
                        image_pil = Image.fromarray(image_np)

                        filename = f"rsl_auto_capture_{uuid.uuid4().hex}.png"
                        image_pil.save(os.path.join(output_dir, filename))

                        auto_capture_list.append(json.dumps({
                            "prompt": raw_auto,
                            "negative": final_negative,
                            "category": category_value,
                            "render_model": final_model,
                            "lora_info": raw_auto_lora,
                            "config": f"Steps: {final_steps}, CFG: {final_cfg}, Denoise: {final_denoise}, Seed: {final_seed}",
                            "source": source_value or "Auto-Prompt",
                            "tags": tag_value,
                            "steps": final_steps,
                            "cfg": final_cfg,
                            "denoise": final_denoise,
                            "seed": final_seed,
                            "active_db": active_db,
                            "image_info": {
                                "image": f"/view?filename={filename}&type=temp&subfolder=",
                                "steps": final_steps,
                                "cfg": final_cfg,
                                "denoise": final_denoise,
                                "seed": final_seed,
                                "render_model": final_model,
                                "lora_info": final_lora_info,
                            },
                        }))
                except Exception as e:
                    print(f"[PromptTracker] Error saving auto image: {e}")

        elif image_value:
            try:
                target_dir = get_target_data_dir({"master_root": master_root})
                img_bytes = extract_image_bytes(image_value, target_dir)
                if img_bytes:
                    img_pil = Image.open(io.BytesIO(img_bytes)).convert("RGB")
                    img_np = np.array(img_pil).astype(np.float32) / 255.0
                    output_image_tensor = torch.from_numpy(img_np)[None, ...]
            except Exception:
                pass

        elif auto_image is not None:
            output_image_tensor = auto_image

        if output_image_tensor is None:
            output_image_tensor = torch.zeros((1, 64, 64, 3))

        return {
            "ui": {
                "prompt": [final_prompt],
                "negative_prompt": [final_negative],
                "render_model": [final_model],
                "lora_info": [final_lora_info],
                "auto_capture": auto_capture_list,
            },
            "result": (
                str(final_prompt),
                str(final_negative),
                category_value,
                final_model,
                final_lora_info,
                config_value,
                final_steps,
                final_cfg,
                final_denoise,
                final_seed,
                source_value,
                tag_value,
                output_image_tensor,
            ),
        }


routes = PromptServer.instance.routes


@routes.get("/prompt_tracker/view_image")
async def view_offloaded_image(request):
    filename = request.rel_url.query.get("filename")
    if not filename:
        return web.Response(status=404)
    safe_filename = os.path.basename(filename)
    active_dir = get_target_data_dir(request.rel_url.query)
    img_path = os.path.join(get_images_dir(active_dir), safe_filename)
    if os.path.exists(img_path):
        return web.FileResponse(img_path)
    return web.Response(status=404)


@routes.get("/prompt_tracker/get_master_dir")
async def get_master_directory(request):
    return web.json_response({"master_dir": get_master_dir()})


@routes.post("/prompt_tracker/set_master_dir")
async def set_master_directory(request):
    try:
        json_data = await request.json()
        path = json_data.get("path")
        if path and os.path.isdir(path):
            set_master_dir(path)
            return web.json_response({"status": "success", "master_dir": path})
        return web.json_response(
            {"status": "error", "message": "Invalid directory path"}, status=400
        )
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=400)


@routes.post("/prompt_tracker/browse_dirs")
async def browse_dirs(request):
    try:
        data = await request.json()
        path = data.get("path", "")
        if not path or not os.path.exists(path):
            if os.name == "nt":
                drives = [
                    f"{d}:\\"
                    for d in "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
                    if os.path.exists(f"{d}:\\")
                ]
                return web.json_response(
                    {"current": "", "dirs": drives, "is_drive_list": True}
                )
            else:
                path = "/"

        if os.path.isdir(path):
            items = os.listdir(path)
            dirs = [
                i
                for i in items
                if os.path.isdir(os.path.join(path, i)) and not i.startswith(".")
            ]
            dirs.sort()
            return web.json_response(
                {"current": path, "dirs": dirs, "is_drive_list": False}
            )
        return web.json_response({"error": "Invalid path"}, status=400)
    except Exception as e:
        if os.name == "nt":
            drives = [
                f"{d}:\\"
                for d in "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
                if os.path.exists(f"{d}:\\")
            ]
            return web.json_response(
                {"current": "", "dirs": drives, "is_drive_list": True}
            )
        return web.json_response({"error": str(e)}, status=400)


@routes.get("/prompt_tracker/list_dbs")
async def list_dbs(request):
    try:
        active_dir = get_target_data_dir(request.query)
        files = [f[:-5] for f in os.listdir(active_dir) if f.endswith(".json")]
        if "prompts_db" not in files:
            files.insert(0, "prompts_db")
        return web.json_response(files)
    except Exception:
        return web.json_response(["prompts_db"])


@routes.get("/prompt_tracker/get")
async def get_db(request):
    db_name = request.rel_url.query.get("db", "prompts_db")
    active_dir = get_target_data_dir(request.rel_url.query)
    return web.json_response(load_db_file(db_name, active_dir))


@routes.post("/prompt_tracker/add")
async def add_prompt(request):
    try:
        json_data = await request.json()
        if not json_data:
            return web.json_response(
                {"status": "error", "message": "Invalid or empty JSON body"}, status=400
            )

        db_name = json_data.get("db", "prompts_db")
        active_dir = get_target_data_dir(json_data)
        source_master_root = json_data.get("source_master_root")
        instance_uuid = json_data.get("instance_uuid")
        db_data = load_db_file(db_name, active_dir)

        is_embedded = json_data.get("is_embedded", False)
        image_info = json_data.get(
            "image_info",
            {
                "image": "",
                "steps": 20,
                "cfg": 8.0,
                "denoise": 1.0,
                "seed": 0,
                "render_model": "undefined",
            },
        )

        processed_image_info = process_image_storage(
            image_info, is_embedded, None, active_dir, source_master_root
        )

        entry = {
            "id": str(uuid.uuid4()),
            "created_at": datetime.utcnow().isoformat(),
            "prompt": json_data.get("prompt", ""),
            "negative": json_data.get("negative", ""),
            "category": json_data.get("category", "General"),
            "render_model": json_data.get("render_model", "undefined"),
            "lora_info": json_data.get("lora_info", "") or json_data.get("loras", ""),
            "config": json_data.get("config", ""),
            "source": json_data.get("source", ""),
            "tags": json_data.get("tags", ""),
            "image_info": processed_image_info,
            "is_embedded": is_embedded,
            "starred": json_data.get("starred", False),
        }

        db_data.append(entry)
        save_db_file(db_name, db_data, active_dir)

        broadcast_database_refresh(
            db_name=db_name,
            master_root=json_data.get("master_root"),
            action="add",
            item_id=entry.get("id"),
            instance_uuid=instance_uuid,
        )

        return web.json_response({"status": "success", "entry": entry, "db": db_data})
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=400)


@routes.post("/prompt_tracker/update")
async def update_prompt(request):
    try:
        json_data = await request.json()
        if not json_data:
            return web.json_response(
                {"status": "error", "message": "Invalid or empty JSON body"}, status=400
            )

        db_name = json_data.get("db", "prompts_db")
        active_dir = get_target_data_dir(json_data)
        source_master_root = json_data.get("source_master_root")
        instance_uuid = json_data.get("instance_uuid")
        db_data = load_db_file(db_name, active_dir)

        prompt_id = json_data.get("id")
        index = json_data.get("index")

        entry_index = None
        if prompt_id:
            entry_index = next(
                (i for i, item in enumerate(db_data) if item.get("id") == prompt_id),
                None,
            )
        if entry_index is None and index is not None and 0 <= index < len(db_data):
            entry_index = index

        if entry_index is not None and 0 <= entry_index < len(db_data):
            existing = db_data[entry_index]
            is_embedded = json_data.get(
                "is_embedded", existing.get("is_embedded", True)
            )

            existing["prompt"] = json_data.get("prompt", existing.get("prompt", ""))
            existing["negative"] = json_data.get(
                "negative", existing.get("negative", "")
            )
            existing["category"] = json_data.get(
                "category", existing.get("category", "General")
            )
            existing["render_model"] = json_data.get(
                "render_model", existing.get("render_model", "undefined")
            )
            existing["lora_info"] = json_data.get(
                "lora_info", existing.get("lora_info", "")
            ) or json_data.get("loras", "")
            existing["config"] = json_data.get("config", existing.get("config", ""))
            existing["source"] = json_data.get("source", existing.get("source", ""))
            existing["tags"] = json_data.get("tags", existing.get("tags", ""))
            existing["is_embedded"] = is_embedded
            existing["updated_at"] = datetime.utcnow().isoformat()

            img_info_input = json_data.get("image_info")
            if not img_info_input or not img_info_input.get("image"):
                img_info_input = existing.get("image_info")

            existing["image_info"] = process_image_storage(
                img_info_input,
                is_embedded,
                existing.get("image_info"),
                active_dir,
                source_master_root,
            )

            if json_data.get("starred") is not None:
                existing["starred"] = json_data.get("starred")

            save_db_file(db_name, db_data, active_dir)

            broadcast_database_refresh(
                db_name=db_name,
                master_root=json_data.get("master_root"),
                action="update",
                item_id=existing.get("id"),
                instance_uuid=instance_uuid,
            )

            return web.json_response(
                {"status": "success", "entry": existing, "db": db_data}
            )

        return web.json_response(
            {"status": "error", "message": "Prompt not found"}, status=404
        )
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=400)


@routes.post("/prompt_tracker/delete")
async def delete_prompt(request):
    try:
        json_data = await request.json()
        db_name = json_data.get("db", "prompts_db")
        active_dir = get_target_data_dir(json_data)
        instance_uuid = json_data.get("instance_uuid")
        db_data = load_db_file(db_name, active_dir)

        prompt_id = json_data.get("id")
        index = json_data.get("index")

        entry_index = None
        if prompt_id:
            entry_index = next(
                (i for i, item in enumerate(db_data) if item.get("id") == prompt_id),
                None,
            )
        if entry_index is None and index is not None and 0 <= index < len(db_data):
            entry_index = index

        if entry_index is not None and 0 <= entry_index < len(db_data):
            removed = db_data.pop(entry_index)
            delete_offloaded_file(removed.get("image_info"), active_dir)
            save_db_file(db_name, db_data, active_dir)

            broadcast_database_refresh(
                db_name=db_name,
                master_root=json_data.get("master_root"),
                action="delete",
                item_id=removed.get("id"),
                instance_uuid=instance_uuid,
            )

            return web.json_response({"status": "success", "db": db_data})

        return web.json_response(
            {"status": "error", "message": "Prompt not found"}, status=404
        )
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=400)


@routes.post("/prompt_tracker/move_prompt")
async def move_prompt(request):
    try:
        json_data = await request.json()
        source_db = json_data.get("source_db", "prompts_db")
        target_db = json_data.get("target_db")
        prompt_id = json_data.get("id")
        index = json_data.get("index")
        instance_uuid = json_data.get("instance_uuid")
        active_dir = get_target_data_dir(json_data)

        if not target_db or source_db == target_db:
            return web.json_response(
                {"status": "error", "message": "Invalid target database"}, status=400
            )

        source_data = load_db_file(source_db, active_dir)

        entry_index = None
        if prompt_id:
            entry_index = next(
                (
                    i
                    for i, item in enumerate(source_data)
                    if item.get("id") == prompt_id
                ),
                None,
            )
        if entry_index is None and index is not None and 0 <= index < len(source_data):
            entry_index = index

        if entry_index is not None and 0 <= entry_index < len(source_data):
            prompt_to_move = source_data.pop(entry_index)
            save_db_file(source_db, source_data, active_dir)

            target_data = load_db_file(target_db, active_dir)
            target_data.append(prompt_to_move)
            save_db_file(target_db, target_data, active_dir)

            broadcast_database_refresh(
                db_name=source_db,
                master_root=json_data.get("master_root"),
                action="delete",
                item_id=prompt_to_move.get("id"),
                instance_uuid=instance_uuid,
            )
            broadcast_database_refresh(
                db_name=target_db,
                master_root=json_data.get("master_root"),
                action="add",
                item_id=prompt_to_move.get("id"),
                instance_uuid=instance_uuid,
            )

            return web.json_response({"status": "success", "db": source_data})
        return web.json_response(
            {"status": "error", "message": "Prompt not found"}, status=404
        )
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=400)


@routes.post("/prompt_tracker/toggle_star")
async def toggle_star(request):
    try:
        json_data = await request.json()
        db_name = json_data.get("db", "prompts_db")
        prompt_id = json_data.get("id")
        index = json_data.get("index")
        instance_uuid = json_data.get("instance_uuid")
        active_dir = get_target_data_dir(json_data)
        db_data = load_db_file(db_name, active_dir)

        entry_index = None
        if prompt_id:
            entry_index = next(
                (i for i, item in enumerate(db_data) if item.get("id") == prompt_id),
                None,
            )
        if entry_index is None and index is not None and 0 <= index < len(db_data):
            entry_index = index

        if entry_index is not None and 0 <= entry_index < len(db_data):
            current_star = db_data[entry_index].get("starred", False)
            db_data[entry_index]["starred"] = not current_star
            save_db_file(db_name, db_data, active_dir)

            broadcast_database_refresh(
                db_name=db_name,
                master_root=json_data.get("master_root"),
                action="update",
                item_id=db_data[entry_index].get("id"),
                instance_uuid=instance_uuid,
            )

            return web.json_response(
                {"status": "success", "starred": db_data[entry_index]["starred"]}
            )
        return web.json_response(
            {"status": "error", "message": "Prompt not found"}, status=404
        )
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=400)


@routes.post("/prompt_tracker/new_db")
async def new_db(request):
    try:
        json_data = await request.json()
        db_name = json_data.get("db")
        active_dir = get_target_data_dir(json_data)
        if not db_name:
            return web.json_response(
                {"status": "error", "message": "Empty name"}, status=400
            )

        path = get_db_path(db_name, active_dir)
        if not os.path.exists(path):
            save_db_file(db_name, [], active_dir)
        return web.json_response({"status": "success"})
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=400)


@routes.post("/prompt_tracker/rename_db")
async def rename_db(request):
    try:
        json_data = await request.json()
        old_name = json_data.get("old_db")
        new_name = json_data.get("new_db")
        active_dir = get_target_data_dir(json_data)
        if old_name == "prompts_db":
            return web.json_response(
                {"status": "error", "message": "Cannot rename default DB"}, status=400
            )

        old_path = get_db_path(old_name, active_dir)
        new_path = get_db_path(new_name, active_dir)
        if os.path.exists(old_path):
            os.rename(old_path, new_path)
            return web.json_response({"status": "success"})
        return web.json_response(
            {"status": "error", "message": "DB not found"}, status=404
        )
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=400)


@routes.post("/prompt_tracker/delete_db")
async def delete_db(request):
    try:
        json_data = await request.json()
        db_name = json_data.get("db")
        active_dir = get_target_data_dir(json_data)
        if db_name == "prompts_db":
            return web.json_response(
                {"status": "error", "message": "Cannot delete default DB"}, status=400
            )

        path = get_db_path(db_name, active_dir)
        if os.path.exists(path):
            os.remove(path)
            return web.json_response({"status": "success"})
        return web.json_response(
            {"status": "error", "message": "DB not found"}, status=404
        )
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=400)


@routes.post("/prompt_tracker/delete_category")
async def delete_category(request):
    try:
        json_data = await request.json()
        db_name = json_data.get("db", "prompts_db")
        category_to_del = json_data.get("category")
        instance_uuid = json_data.get("instance_uuid")
        active_dir = get_target_data_dir(json_data)
        db_data = load_db_file(db_name, active_dir)

        for item in db_data:
            if item.get("category") == category_to_del:
                item["category"] = "General"
        save_db_file(db_name, db_data, active_dir)
        broadcast_database_refresh(
            db_name=db_name,
            master_root=json_data.get("master_root"),
            action="update",
            instance_uuid=instance_uuid,
        )
        return web.json_response({"status": "success", "db": db_data})
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=400)


@routes.post("/prompt_tracker/delete_model")
async def delete_model(request):
    try:
        json_data = await request.json()
        db_name = json_data.get("db", "prompts_db")
        model_to_del = json_data.get("model")
        instance_uuid = json_data.get("instance_uuid")
        active_dir = get_target_data_dir(json_data)
        db_data = load_db_file(db_name, active_dir)

        for item in db_data:
            if item.get("render_model") == model_to_del:
                item["render_model"] = "undefined"
        save_db_file(db_name, db_data, active_dir)
        broadcast_database_refresh(
            db_name=db_name,
            master_root=json_data.get("master_root"),
            action="update",
            instance_uuid=instance_uuid,
        )
        return web.json_response({"status": "success", "db": db_data})
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=400)


@routes.post("/prompt_tracker/clean_orphans")
async def clean_orphaned_images_handler(request):
    try:
        json_data = await request.json() if request.can_read_body else {}
        active_dir = get_target_data_dir(json_data)
        images_dir = get_images_dir(active_dir)

        if not os.path.exists(images_dir):
            return web.json_response(
                {
                    "status": "success",
                    "deleted_count": 0,
                    "message": "No images folder found.",
                }
            )

        referenced_files = get_all_referenced_images(active_dir)
        disk_files_list = os.listdir(images_dir)
        directory_files = set(
            f for f in disk_files_list if os.path.isfile(os.path.join(images_dir, f))
        )

        orphan_files = directory_files - referenced_files

        deleted_count = 0
        for orphan in orphan_files:
            file_path = os.path.join(images_dir, orphan)
            try:
                os.remove(file_path)
                deleted_count += 1
            except Exception:
                pass

        return web.json_response(
            {
                "status": "success",
                "deleted_count": deleted_count,
                "message": f"Cleaned {deleted_count} true orphaned file(s) from disk.",
            }
        )
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)


@routes.post("/prompt_tracker/audit_images")
async def audit_broken_images_handler(request):
    try:
        json_data = await request.json()
        target_db = json_data.get("db", "prompts_db")
        is_global = json_data.get("global", False)
        instance_uuid = json_data.get("instance_uuid")
        active_dir = get_target_data_dir(json_data)
        images_dir = get_images_dir(active_dir)

        dbs_to_audit = []
        if is_global:
            if os.path.exists(active_dir):
                dbs_to_audit = [
                    f[:-5] for f in os.listdir(active_dir) if f.endswith(".json")
                ]
        else:
            dbs_to_audit = [target_db]

        disk_files = set()
        if os.path.exists(images_dir):
            disk_files = set(
                f
                for f in os.listdir(images_dir)
                if os.path.isfile(os.path.join(images_dir, f))
            )

        total_broken_cleared = 0
        dbs_modified = 0

        for db_name in dbs_to_audit:
            db_path = get_db_path(db_name, active_dir)
            if not os.path.exists(db_path):
                continue

            with open(db_path, "r", encoding="utf-8") as f:
                entries = json.load(f)

            db_modified_flag = False
            broken_count = 0

            for entry in entries:
                img_info = entry.get("image_info") or {}
                img_path = img_info.get("image", "")

                if "/prompt_tracker/view_image?filename=" in img_path:
                    try:
                        filename = img_path.split("filename=")[1].split("&")[0]
                        if filename and filename not in disk_files:
                            entry["image_info"]["image"] = ""
                            entry["is_embedded"] = False
                            broken_count += 1
                            db_modified_flag = True
                    except Exception:
                        pass

            if db_modified_flag:
                save_db_file(db_name, entries, active_dir)
                total_broken_cleared += broken_count
                dbs_modified += 1
                broadcast_database_refresh(
                    db_name=db_name,
                    master_root=json_data.get("master_root"),
                    action="update",
                    instance_uuid=instance_uuid,
                )

        msg = (
            f"Global Audit: Cleared {total_broken_cleared} missing link(s) across {dbs_modified} database(s)."
            if is_global
            else f"Audited DB '{target_db}': Cleared {total_broken_cleared} missing link(s)."
        )

        return web.json_response(
            {
                "status": "success",
                "broken_cleared": total_broken_cleared,
                "message": msg,
            }
        )
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)


@routes.post("/prompt_tracker/export_images")
async def export_images_handler(request):
    try:
        json_data = await request.json()
        db_name = json_data.get("db", "prompts_db")
        active_dir = get_target_data_dir(json_data)
        export_base_path = json_data.get("export_path")
        source_master_root = json_data.get("master_root")
        favorites_only = json_data.get("favorites_only", False)

        if not export_base_path or not os.path.isdir(export_base_path):
            return web.json_response(
                {"status": "error", "message": "Invalid export base directory"},
                status=400,
            )

        target_export_dir = os.path.join(export_base_path, db_name)
        os.makedirs(target_export_dir, exist_ok=True)

        db_data = load_db_file(db_name, active_dir)
        exported_count = 0

        for idx, item in enumerate(db_data):
            if favorites_only and not item.get("starred", False):
                continue

            img_info = item.get("image_info") or {}
            img_val = img_info.get("image", "")
            if not img_val:
                continue

            img_bytes = extract_image_bytes(img_val, active_dir, source_master_root)
            if img_bytes:
                filename = f"{db_name}-{idx + 1:03d}.png"
                file_path = os.path.join(target_export_dir, filename)
                with open(file_path, "wb") as f:
                    f.write(img_bytes)
                exported_count += 1

        return web.json_response(
            {
                "status": "success",
                "exported_count": exported_count,
                "target_dir": target_export_dir,
                "message": f"Successfully exported {exported_count} image(s) to '{target_export_dir}'",
            }
        )
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)


NODE_CLASS_MAPPINGS = {"PromptTrackerNode": PromptTrackerNode}

NODE_DISPLAY_NAME_MAPPINGS = {"PromptTrackerNode": "rsl Prompt Tracker & Library"}
