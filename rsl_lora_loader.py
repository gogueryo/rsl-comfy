import folder_paths
import comfy.sd

class RSLLoraLoader:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "model": ("MODEL",),
                "clip": ("CLIP",),
                "lora_name": (folder_paths.get_filename_list("loras"),),
                "strength_model": ("FLOAT", {"default": 1.0, "min": -20.0, "max": 20.0, "step": 0.01}),
                "strength_clip": ("FLOAT", {"default": 1.0, "min": -20.0, "max": 20.0, "step": 0.01}),
            },
            "optional": {
                "prev_lora_info": ("STRING", {"forceInput": True}),
            }
        }
    
    RETURN_TYPES = ("MODEL", "CLIP", "STRING")
    RETURN_NAMES = ("MODEL", "CLIP", "LORA_INFO")
    FUNCTION = "load_lora"
    CATEGORY = "rsl_nodes"

    def load_lora(self, model, clip, lora_name, strength_model, strength_clip, prev_lora_info=""):
        # 1. Load LoRA weights into Model and CLIP streams
        lora_path = folder_paths.get_full_path("loras", lora_name)
        model_lora, clip_lora = comfy.sd.load_lora_for_weights(model, clip, lora_path, strength_model, strength_clip)
        
        # 2. Format current LoRA info string
        current_info = f"{lora_name} (M:{strength_model}, C:{strength_clip})"
        
        # 3. Accumulate if chained with previous LoRA loaders
        if prev_lora_info and prev_lora_info.strip():
            combined_lora_info = f"{prev_lora_info.strip()}, {current_info}"
        else:
            combined_lora_info = current_info
        
        return (model_lora, clip_lora, combined_lora_info)

# ComfyUI Node Mappings
NODE_CLASS_MAPPINGS = {
    "RSLLoraLoader": RSLLoraLoader
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "RSLLoraLoader": "RSL LoRA Loader (with Meta Output)"
}