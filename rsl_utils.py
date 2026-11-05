import os
import json
import string
import shutil
import torch
import numpy as np
from PIL import Image

def pad_image_to_target(img, target_w, target_h):
    """Applies proportional in-memory letterbox padding to a fixed target canvas without modifying files on disk."""
    orig_w, orig_h = img.size
    if (orig_w, orig_h) == (target_w, target_h):
        return img
    
    scale = min(target_w / orig_w, target_h / orig_h)
    new_w = int(orig_w * scale)
    new_h = int(orig_h * scale)
    
    resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    new_img = Image.new("RGB", (target_w, target_h), (0, 0, 0))
    paste_x = (target_w - new_w) // 2
    paste_y = (target_h - new_h) // 2
    new_img.paste(resized, (paste_x, paste_y))
    return new_img

def load_dataset_folder(dataset_path, max_resolution=1024):
    """Scans a directory for valid images, loads matching captions, and scales/letterboxes to max_resolution canvas."""
    valid_exts = (".png", ".jpg", ".jpeg", ".webp")
    images_list = []
    texts_list = []
    json_entries = []
    
    target_size = (max_resolution, max_resolution)

    selection_path = os.path.join(dataset_path, "dataset_selection.json")
    selection_data = {}
    if os.path.exists(selection_path):
        try:
            with open(selection_path, "r", encoding="utf-8") as sf:
                selection_data = json.load(sf)
        except Exception:
            pass

    if dataset_path and os.path.exists(dataset_path):
        try:
            files = sorted(os.listdir(dataset_path))
            
            for f in files:
                if f.lower().endswith(valid_exts):
                    is_enabled = selection_data.get(f, True)
                    if not is_enabled:
                        continue

                    base_name = os.path.splitext(f)[0]
                    img_path = os.path.join(dataset_path, f)
                    txt_path = os.path.join(dataset_path, f"{base_name}.txt")
                    
                    try:
                        img = Image.open(img_path).convert("RGB")
                        processed_img = pad_image_to_target(img, target_size[0], target_size[1])
                        img_np = np.array(processed_img).astype(np.float32) / 255.0
                        
                        caption = ""
                        if os.path.exists(txt_path):
                            try:
                                with open(txt_path, "r", encoding="utf-8") as tf:
                                    caption = tf.read().strip()
                            except Exception:
                                pass
                        
                        images_list.append(torch.from_numpy(img_np))
                        texts_list.append(caption)
                        
                        json_entries.append({
                            "filename": f,
                            "description": caption
                        })
                    except Exception as e:
                        print(f"[RSL-Utils] Skipping file {f} due to load error: {e}")
                        continue
        except Exception as e:
            print(f"[RSL-Utils] Error scanning dataset directory: {e}")

    if images_list:
        image_tensor = torch.stack(images_list, dim=0)
    else:
        image_tensor = torch.zeros((1, target_size[0], target_size[1], 3), dtype=torch.float32)
        texts_list = [""]

    combined_texts = "\n".join(texts_list)
    formatted_json = json.dumps({"dataset": json_entries}, indent=2)

    return dataset_path, image_tensor, combined_texts, formatted_json

# --- Shared Server API Route Registration ---
try:
    from aiohttp import web
    from server import PromptServer

    if PromptServer.instance and hasattr(PromptServer.instance, "routes"):
        routes = PromptServer.instance.routes

        @routes.get("/rsl/utils/list_directory")
        async def list_directory(request):
            dir_path = request.query.get("dir", "")
            if dir_path == "DRIVES":
                subdirs = []
                if os.name == 'nt':
                    for d in string.ascii_uppercase:
                        drive_path = f"{d}:\\"
                        if os.path.exists(drive_path):
                            subdirs.append({"name": f"Drive {d}:", "path": drive_path})
                else:
                    subdirs.append({"name": "Root (/)", "path": "/"})
                return web.json_response({"current": "System Drives", "parent": None, "subdirs": subdirs})

            if not dir_path or not os.path.exists(dir_path):
                dir_path = os.getcwd()
            
            try:
                subdirs = []
                parent_dir = os.path.dirname(dir_path)
                is_root = (parent_dir == dir_path) or (len(dir_path) <= 3 and dir_path.endswith(":\\"))
                with os.scandir(dir_path) as entries:
                    for entry in entries:
                        if entry.is_dir() and not entry.name.startswith('.'):
                            subdirs.append({"name": entry.name, "path": entry.path})
                return web.json_response({
                    "current": dir_path,
                    "parent": None if is_root else parent_dir,
                    "subdirs": sorted(subdirs, key=lambda x: x["name"].lower())
                })
            except Exception as e:
                return web.json_response({"error": str(e)}, status=500)

        @routes.get("/rsl/utils/get_dataset")
        async def get_dataset(request):
            dir_path = request.query.get("dir", "")
            if not dir_path or not os.path.exists(dir_path):
                return web.json_response({"error": "Directory does not exist or was not provided."}, status=400)

            selection_path = os.path.join(dir_path, "dataset_selection.json")
            selection_data = {}
            if os.path.exists(selection_path):
                try:
                    with open(selection_path, "r", encoding="utf-8") as sf:
                        selection_data = json.load(sf)
                except Exception:
                    pass

            valid_exts = (".png", ".jpg", ".jpeg", ".webp")
            try:
                files = sorted(os.listdir(dir_path))
            except Exception as e:
                return web.json_response({"error": str(e)}, status=500)
            
            dataset_items = []
            for f in files:
                if f.lower().endswith(valid_exts):
                    base_name = os.path.splitext(f)[0]
                    img_path = os.path.join(dir_path, f)
                    txt_path = os.path.join(dir_path, f"{base_name}.txt")
                    caption = ""
                    if os.path.exists(txt_path):
                        try:
                            with open(txt_path, "r", encoding="utf-8") as tf:
                                caption = tf.read()
                        except Exception:
                            pass
                    enabled = selection_data.get(f, True)
                    dataset_items.append({"filename": f, "image_path": img_path, "caption": caption, "enabled": enabled})

            return web.json_response({"items": dataset_items})

        @routes.post("/rsl/utils/update_selection")
        async def update_selection(request):
            try:
                data = await request.json()
                dir_path = data.get("dir", "")
                filename = data.get("filename", "")
                enabled = data.get("enabled", True)
                if not dir_path or not filename:
                    return web.json_response({"success": False, "error": "Invalid path or filename."}, status=400)

                selection_path = os.path.join(dir_path, "dataset_selection.json")
                selection_data = {}
                if os.path.exists(selection_path):
                    try:
                        with open(selection_path, "r", encoding="utf-8") as sf:
                            selection_data = json.load(sf)
                    except Exception:
                        pass
                selection_data[filename] = enabled
                with open(selection_path, "w", encoding="utf-8") as sf:
                    json.dump(selection_data, sf, indent=2)
                return web.json_response({"success": True})
            except Exception as e:
                return web.json_response({"success": False, "error": str(e)}, status=500)

        @routes.post("/rsl/utils/update_all_selections")
        async def update_all_selections(request):
            try:
                data = await request.json()
                dir_path = data.get("dir", "")
                selections = data.get("selections", {})
                if not dir_path:
                    return web.json_response({"success": False, "error": "Invalid path provided."}, status=400)

                selection_path = os.path.join(dir_path, "dataset_selection.json")
                selection_data = {}
                if os.path.exists(selection_path):
                    try:
                        with open(selection_path, "r", encoding="utf-8") as sf:
                            selection_data = json.load(sf)
                    except Exception:
                        pass

                selection_data.update(selections)
                with open(selection_path, "w", encoding="utf-8") as sf:
                    json.dump(selection_data, sf, indent=2)
                return web.json_response({"success": True})
            except Exception as e:
                return web.json_response({"success": False, "error": str(e)}, status=500)

        @routes.get("/rsl/utils/get_image")
        async def get_image(request):
            img_path = request.query.get("path", "")
            if not img_path or not os.path.exists(img_path):
                return web.Response(status=404, text="Image not found")
            ext = os.path.splitext(img_path)[1].lower()
            content_types = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}
            content_type = content_types.get(ext, "application/octet-stream")
            try:
                with open(img_path, "rb") as f:
                    image_data = f.read()
                return web.Response(body=image_data, content_type=content_type)
            except Exception as e:
                return web.Response(status=500, text=str(e))

        @routes.post("/rsl/utils/rotate_image")
        async def rotate_image(request):
            try:
                data = await request.json()
                img_path = data.get("path", "")
                direction = data.get("direction", "right")
                if not img_path or not os.path.exists(img_path):
                    return web.json_response({"success": False, "error": "Image path not found."}, status=400)

                with Image.open(img_path) as img:
                    if direction == "right":
                        rotated = img.transpose(Image.ROTATE_270)
                    else:
                        rotated = img.transpose(Image.ROTATE_90)
                    
                    img_format = img.format if img.format else "JPEG"
                    if img_format.upper() == "JPEG" and rotated.mode in ("RGBA", "LA"):
                        rotated = rotated.convert("RGB")
                    
                    rotated.save(img_path, format=img_format)

                return web.json_response({"success": True})
            except Exception as e:
                return web.json_response({"success": False, "error": str(e)}, status=500)

        @routes.post("/rsl/utils/crop_image")
        async def crop_image(request):
            try:
                data = await request.json()
                img_path = data.get("path", "")
                box = data.get("box", {}) # {left, top, right, bottom}
                if not img_path or not os.path.exists(img_path):
                    return web.json_response({"success": False, "error": "Image path not found."}, status=400)

                left = int(box.get("left", 0))
                top = int(box.get("top", 0))
                right = int(box.get("right", 0))
                bottom = int(box.get("bottom", 0))

                if right <= left or bottom <= top:
                    return web.json_response({"success": False, "error": "Invalid crop dimensions."}, status=400)

                with Image.open(img_path) as img:
                    orig_w, orig_h = img.size
                    left = max(0, min(left, orig_w))
                    top = max(0, min(top, orig_h))
                    right = max(0, min(right, orig_w))
                    bottom = max(0, min(bottom, orig_h))

                    # Preserve embedded ICC profile to prevent color shift
                    icc_profile = img.info.get("icc_profile")

                    cropped = img.crop((left, top, right, bottom))
                    img_format = img.format if img.format else "JPEG"
                    if img_format.upper() == "JPEG" and cropped.mode in ("RGBA", "LA"):
                        cropped = cropped.convert("RGB")
                    
                    save_kwargs = {}
                    if icc_profile:
                        save_kwargs["icc_profile"] = icc_profile
                    if img_format.upper() == "JPEG":
                        save_kwargs["quality"] = 95

                    cropped.save(img_path, format=img_format, **save_kwargs)

                return web.json_response({"success": True})
            except Exception as e:
                return web.json_response({"success": False, "error": str(e)}, status=500)

        @routes.post("/rsl/utils/update_caption")
        async def update_caption(request):
            try:
                data = await request.json()
                dir_path = data.get("dir", "")
                filename = data.get("filename", "")
                new_caption = data.get("caption", "")
                if not dir_path or not filename:
                    return web.json_response({"success": False, "error": "Invalid path or filename."}, status=400)
                base_name = os.path.splitext(filename)[0]
                txt_path = os.path.join(dir_path, f"{base_name}.txt")
                with open(txt_path, "w", encoding="utf-8") as tf:
                    tf.write(new_caption)
                return web.json_response({"success": True})
            except Exception as e:
                return web.json_response({"success": False, "error": str(e)}, status=500)

        @routes.post("/rsl/utils/delete_item")
        async def delete_dataset_item(request):
            try:
                data = await request.json()
                dir_path = data.get("dir", "")
                filename = data.get("filename", "")
                if not dir_path or not filename:
                    return web.json_response({"success": False, "error": "Invalid path or filename."}, status=400)
                base_name = os.path.splitext(filename)[0]
                for ext in [".png", ".jpg", ".jpeg", ".webp"]:
                    img_path = os.path.join(dir_path, base_name + ext)
                    if os.path.exists(img_path):
                        os.remove(img_path)
                        break
                exact_img = os.path.join(dir_path, filename)
                if os.path.exists(exact_img):
                    os.remove(exact_img)
                txt_path = os.path.join(dir_path, f"{base_name}.txt")
                if os.path.exists(txt_path):
                    os.remove(txt_path)
                return web.json_response({"success": True})
            except Exception as e:
                return web.json_response({"success": False, "error": str(e)}, status=500)

        @routes.post("/rsl/utils/export_dataset")
        async def export_dataset(request):
            try:
                data = await request.json()
                base_dir = data.get("dir", "")
                max_resolution = int(data.get("max_resolution", 1024))
                image_paths = data.get("image_paths", [])

                if not base_dir or not image_paths:
                    return web.json_response({"success": False, "error": "Missing base directory or image paths."}, status=400)

                norm_base_dir = os.path.normpath(base_dir)
                dir_name = os.path.basename(norm_base_dir)

                export_dir = os.path.join(norm_base_dir, f"{dir_name}-{max_resolution}")
                os.makedirs(export_dir, exist_ok=True)

                success_count = 0
                for img_path in image_paths:
                    if not os.path.exists(img_path):
                        continue

                    try:
                        with Image.open(img_path) as img:
                            icc_profile = img.info.get("icc_profile")
                            if img.mode in ("RGBA", "P"):
                                img = img.convert("RGB")
                            
                            orig_w, orig_h = img.size
                            
                            if orig_w > max_resolution or orig_h > max_resolution:
                                if orig_w >= orig_h:
                                    new_w = max_resolution
                                    new_h = int(round((max_resolution / orig_w) * orig_h))
                                else:
                                    new_h = max_resolution
                                    new_w = int(round((max_resolution / orig_h) * orig_w))
                            else:
                                new_w, new_h = orig_w, orig_h

                            resized_img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
                            dest_img_path = os.path.join(export_dir, os.path.basename(img_path))
                            
                            save_kwargs = {}
                            if icc_profile:
                                save_kwargs["icc_profile"] = icc_profile
                            if dest_img_path.lower().endswith(('.jpg', '.jpeg')):
                                save_kwargs["quality"] = 95

                            resized_img.save(dest_img_path, **save_kwargs)
                    except Exception as img_err:
                        print(f"[RSL Export] Error resizing {img_path}: {img_err}")
                        continue

                    base_name = os.path.splitext(os.path.basename(img_path))[0]
                    txt_path = os.path.join(base_dir, f"{base_name}.txt")
                    if os.path.exists(txt_path):
                        shutil.copy(txt_path, os.path.join(export_dir, f"{base_name}.txt"))

                    success_count += 1

                return web.json_response({
                    "success": True,
                    "count": success_count,
                    "export_dir": export_dir
                })
            except Exception as e:
                return web.json_response({"success": False, "error": str(e)}, status=500)
except Exception as e:
    print(f"[RSL-Utils] Warning: Could not register shared API routes: {e}")