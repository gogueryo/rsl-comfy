import os
import time
import torch
import numpy as np
from PIL import Image
import folder_paths
from server import PromptServer
from aiohttp import web

class RSLDraggablePreviewNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
            },
            "optional": {
                "render_model": ("STRING", {"default": "undefined", "multiline": False}),
                "steps": ("INT", {"default": 20}),
                "cfg": ("FLOAT", {"default": 8.0}),
                "denoise": ("FLOAT", {"default": 1.0}),
                "seed": ("INT", {"default": 0}),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("IMAGE",)
    FUNCTION = "preview_and_expose"
    OUTPUT_NODE = True
    CATEGORY = "rsl/tools"

    def preview_and_expose(self, images, render_model="undefined", steps=20, cfg=8.0, denoise=1.0, seed=0):
        output_dir = folder_paths.get_temp_directory()
        
        # Use a unique timestamp suffix so the filename is never stale or cached
        unique_id = int(time.time() * 1000)
        filename = f"rsl_draggable_preview_{os.getpid()}_{unique_id}.png"
        full_path = os.path.join(output_dir, filename)
        
        image_np = 255.0 * images[0].cpu().numpy()
        image_pil = Image.fromarray(np.clip(image_np, 0, 255).astype(np.uint8))
        image_pil.save(full_path)
        
        return {
            "ui": {
                "images": [{
                    "filename": filename,
                    "subfolder": "",
                    "type": "temp",
                    "render_model": render_model,
                    "image_info": {
                        "steps": steps,
                        "cfg": cfg,
                        "denoise": denoise,
                        "seed": seed
                    }
                }]
            },
            "result": (images,)
        }

NODE_CLASS_MAPPINGS = {
    "RSLDraggablePreviewNode": RSLDraggablePreviewNode
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "RSLDraggablePreviewNode": "rsl Draggable Preview Image"
}