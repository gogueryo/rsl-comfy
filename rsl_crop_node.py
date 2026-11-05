import torch

class RSLCropNode:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "images": ("IMAGE", {"tooltip": "Input image or video tensor stream."}),
                "frame_rate": ("FLOAT", {"default": 29.97, "min": 0.0, "max": 120.0, "step": 0.001, "tooltip": "Source video frame rate (FPS). Wire this into your video saver node to fix slow-motion playback."}),
                "crop_mode": (["Uniform Aspect Inset", "Edges (Top/Bottom/Left/Right)", "Origin (X/Y + Size)"], {"default": "Uniform Aspect Inset", "tooltip": "Select the cropping method."}),
                "uniform_inset": ("INT", {"default": 0, "min": 0, "max": 4096, "step": 2, "tooltip": "Equal pixel inset applied to all 4 sides simultaneously."}),
                "anchor_x": ("INT", {"default": 0, "min": 0, "max": 8192, "step": 2, "tooltip": "Starting X origin coordinate (left offset) for Origin mode."}),
                "anchor_y": ("INT", {"default": 0, "min": 0, "max": 8192, "step": 2, "tooltip": "Starting Y origin coordinate (top offset) for Origin mode."}),
                "crop_top": ("INT", {"default": 0, "min": 0, "max": 4096, "step": 2, "tooltip": "Pixels to trim from the top edge."}),
                "crop_bottom": ("INT", {"default": 16, "min": 0, "max": 4096, "step": 2, "tooltip": "Pixels to trim from the bottom edge (VHS tracking garbage)."}),
                "crop_left": ("INT", {"default": 0, "min": 0, "max": 4096, "step": 2, "tooltip": "Pixels to trim from the left edge."}),
                "crop_right": ("INT", {"default": 0, "min": 0, "max": 4096, "step": 2, "tooltip": "Pixels to trim from the right edge."}),
                "width": ("INT", {"default": 720, "min": 16, "max": 8192, "step": 2, "tooltip": "Target crop box width for Origin mode."}),
                "height": ("INT", {"default": 464, "min": 16, "max": 8192, "step": 2, "tooltip": "Target crop box height for Origin mode."}),
                "keep_aspect_ratio": ("BOOLEAN", {"default": True, "tooltip": "Automatically adjust dimensions to preserve the original video aspect ratio."}),
            }
        }

    RETURN_TYPES = ("IMAGE", "FLOAT", "STRING")
    RETURN_NAMES = ("cropped_images", "frame_rate", "crop_summary")
    FUNCTION = "crop_images"
    CATEGORY = "rsl/video"
    
    DESCRIPTION = (
        "Advanced VHS crop node featuring three precise cropping modes:\n"
        "• Uniform Aspect Inset: Shaves an equal number of pixels from all 4 sides simultaneously.\n"
        "• Edges (Top/Bottom/Left/Right): Independently trims garbage lines from outer borders.\n"
        "• Origin (X/Y + Size): Isolates a specific sub-window via top-left corner coordinates and explicit sizing.\n"
        "Includes automatic Mod-2 even-number snapping for encoders, aspect ratio locking, and frame rate pass-through."
    )

    def crop_images(self, images, frame_rate, crop_mode, uniform_inset, anchor_x, anchor_y, crop_top, crop_bottom, crop_left, crop_right, width, height, keep_aspect_ratio):
        b, h, w, c = images.shape
        orig_w, orig_h = w, h
        orig_aspect = w / h if h > 0 else 1.0

        if crop_mode == "Uniform Aspect Inset":
            inset = uniform_inset & ~1
            target_w = max(16, w - (inset * 2))
            target_h = max(16, h - (inset * 2))
            if keep_aspect_ratio:
                target_h = int(target_w / orig_aspect) & ~1
            x = inset
            y = inset
            target_w = target_w & ~1
            target_h = target_h & ~1
            x2 = min(x + target_w, w)
            y2 = min(y + target_h, h)

        elif crop_mode == "Origin (X/Y + Size)":
            target_w = width & ~1
            target_h = height & ~1
            if keep_aspect_ratio:
                target_h = int(target_w / orig_aspect) & ~1
            
            x = max(0, min(anchor_x, w - 16))
            y = max(0, min(anchor_y, h - 16))
            target_w = max(16, min(target_w, w - x))
            target_h = max(16, min(target_h, h - y))
            target_w = target_w & ~1
            target_h = target_h & ~1
            
            x2 = x + target_w
            y2 = y + target_h

        else:  # Edges (Top/Bottom/Left/Right)
            ct = crop_top & ~1
            cb = crop_bottom & ~1
            cl = crop_left & ~1
            cr = crop_right & ~1

            target_w = w - cl - cr
            target_h = h - ct - cb

            if keep_aspect_ratio:
                target_h = max(16, target_h & ~1)
                target_w = int(target_h * orig_aspect) & ~1
                diff = (w - cl - cr) - target_w
                cl += diff // 2
                cr += diff // 2

            target_w = max(16, target_w & ~1)
            target_h = max(16, target_h & ~1)

            x = max(0, cl)
            y = max(0, ct)
            x2 = min(x + target_w, w)
            y2 = min(y + target_h, h)

        cropped = images[:, y:y2, x:x2, :]
        final_w = x2 - x
        final_h = y2 - y
        
        summary = f"Crop Summary: {orig_w}x{orig_h} -> {final_w}x{final_h} | Mode: {crop_mode} | FPS: {frame_rate}"
        print(f"[RSLCropNode] {summary}")

        return (cropped, frame_rate, summary)

NODE_CLASS_MAPPINGS = {
    "RSLCropNode": RSLCropNode
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "RSLCropNode": "rsl Crop Image & Video Info"
}

WEB_DIRECTORY = "js"