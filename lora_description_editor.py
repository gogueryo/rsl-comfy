from .rsl_utils import load_dataset_folder

class LoraDescriptionEditorNode:
    """
    rsl Lora Description Editor Node
    Manages dataset images, captions, and training selections with in-memory aspect-ratio padding for LoRA training.
    """
    
    DESCRIPTION = (
        "Specialized dataset manager for Flux / Krea 2 RAW LoRA training. "
        "Loads images and text captions, applies in-memory letterbox padding to handle mixed resolutions "
        "without distortion, and filters out unselected images based on per-item checkboxes."
    )

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "dataset_path": (
                    "STRING", 
                    {
                        "default": "", 
                        "multiline": False,
                        "tooltip": "Absolute path to the folder containing dataset images and .txt caption files."
                    }
                ),
                "max_resolution": (
                    "INT",
                    {
                        "default": 1024,
                        "min": 256,
                        "max": 4096,
                        "step": 64,
                        "tooltip": "Maximum resolution canvas cap. Images are proportionally scaled and letterboxed to fit this square canvas."
                    }
                ),
            }
        }

    RETURN_TYPES = ("STRING", "IMAGE", "STRING", "STRING",)
    RETURN_NAMES = ("dataset_path", "images", "texts", "json",)
    
    OUTPUT_IS_LIST = (False, False, False, False)

    OUTPUT_TOOLTIPS = (
        "Passes through the validated dataset directory path.",
        "Batched tensor of processed images with aspect-ratio padding applied.",
        "Combined string of text captions corresponding to the active training images.",
        "Formatted JSON string containing an array of active files and their corresponding descriptions."
    )

    FUNCTION = "load_editor_interface"
    OUTPUT_NODE = True
    CATEGORY = "rsl/utils"

    def load_editor_interface(self, dataset_path, max_resolution):
        return load_dataset_folder(dataset_path, max_resolution)

NODE_CLASS_MAPPINGS = {
    "LoraDescriptionEditor": LoraDescriptionEditorNode
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "LoraDescriptionEditor": "rsl Lora Description Editor"
}