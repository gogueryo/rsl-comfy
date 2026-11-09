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
                "loras_json": (
                    "STRING",
                    {
                        "default": "[]",
                        "multiline": False,
                    },
                ),
            },
            "optional": {
                "clip": ("CLIP",),
            },
        }

    RETURN_TYPES = ("MODEL", "CLIP", "STRING")
    RETURN_NAMES = ("MODEL", "CLIP", "LORA_INFO")
    FUNCTION = "stack_loras"
    CATEGORY = "rsl/utils"

    def stack_loras(self, model, clip=None, loras_json="[]"):
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
                # If clip is None, some standard loaders require a clip or fail if passed None.
                # LoraLoader handles clip if it's provided, but if clip is optional and not connected,
                # we can either pass None or skip clip application. Let's handle it cleanly:
                if current_clip is not None:
                    current_model, current_clip = loader.load_lora(
                        current_model,
                        current_clip,
                        lora_name,
                        strength_model,
                        strength_clip,
                    )
                else:
                    # If no clip is connected, we only patch the model using a dummy clip or separate calls if supported,
                    # or pass None depending on how LoraLoader handles it. Standard LoraLoader expects clip.
                    # Safest fallback for model-only patching:
                    current_model, _ = loader.load_lora(
                        current_model,
                        None,
                        lora_name,
                        strength_model,
                        0.0,  # zero clip strength if clip is absent
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
