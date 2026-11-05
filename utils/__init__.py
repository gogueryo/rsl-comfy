from .lora_description_editor import LoraDescriptionEditor

NODE_CLASS_MAPPINGS = {
    "LoraDescriptionEditor": LoraDescriptionEditor,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "LoraDescriptionEditor": "rsl Lora Description Editor"
}

# Tells ComfyUI where to find your frontend JavaScript file
WEB_DIRECTORY = "./js"

# __all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']
