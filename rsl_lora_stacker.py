import json

try:
    from nodes import LoraLoader
except ImportError:
    LoraLoader = None


class RSLLoraStackerNode:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "model": ("MODEL",),
                "clip": ("CLIP",),
                "loras_json": (
                    "STRING",
                    {
                        "default": "[]",
                        "multiline": False,
                    },
                ),
            },
        }

    RETURN_TYPES = ("MODEL", "CLIP", "STRING")
    RETURN_NAMES = ("MODEL", "CLIP", "LORA_INFO")
    FUNCTION = "stack_loras"
    CATEGORY = "rsl/utils"

    def stack_loras(self, model, clip, loras_json="[]"):
        try:
            lora_list = json.loads(loras_json)
        except Exception:
            lora_list = []

        current_model = model
        current_clip = clip
        active_lora_meta = []

        loader = LoraLoader() if LoraLoader else None

        for item in lora_list:
            if not item.get("enabled", True):
                continue

            lora_name = item.get("name")
            strength_model = float(item.get("strength_model", 1.0))
            strength_clip = float(item.get("strength_clip", strength_model))

            if not lora_name or not loader:
                continue

            try:
                current_model, current_clip = loader.load_lora(
                    current_model,
                    current_clip,
                    lora_name,
                    strength_model,
                    strength_clip,
                )
                active_lora_meta.append(
                    f"{lora_name} (M:{strength_model}, C:{strength_clip})"
                )
            except Exception as e:
                print(f"[RSL Stacker Error] Failed to load LoRA {lora_name}: {e}")

        lora_info_str = (
            ", ".join(active_lora_meta) if active_lora_meta else "No LoRAs active"
        )
        return (current_model, current_clip, lora_info_str)


NODE_CLASS_MAPPINGS = {"RSLLoraStackerNode": RSLLoraStackerNode}

NODE_DISPLAY_NAME_MAPPINGS = {"RSLLoraStackerNode": "RSL Multi-LoRA Stacker"}
