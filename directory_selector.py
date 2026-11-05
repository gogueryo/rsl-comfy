import os

class RSLDirectorySelector:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "directory_path": ("STRING", {"default": "", "multiline": False}),
                "append_1": ("STRING", {"default": "", "multiline": False}),
                "append_2": ("STRING", {"default": "", "multiline": False}),
                "append_3": ("STRING", {"default": "", "multiline": False}),
                "append_4": ("STRING", {"default": "", "multiline": False}),
            }
        }
    
    RETURN_TYPES = ("STRING", "STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("directory_path", "path_1", "path_2", "path_3", "path_4")
    FUNCTION = "select_directory"
    CATEGORY = "rsl/utils"

    def select_directory(self, directory_path, append_1, append_2, append_3, append_4):
        base_dir = directory_path.strip()
        
        path_1 = os.path.join(base_dir, append_1.strip()) if append_1.strip() else base_dir
        path_2 = os.path.join(base_dir, append_2.strip()) if append_2.strip() else base_dir
        path_3 = os.path.join(base_dir, append_3.strip()) if append_3.strip() else base_dir
        path_4 = os.path.join(base_dir, append_4.strip()) if append_4.strip() else base_dir

        return (base_dir, path_1, path_2, path_3, path_4)

NODE_CLASS_MAPPINGS = {
    "RSLDirectorySelector": RSLDirectorySelector,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "RSLDirectorySelector": "RSL Directory Selector",
}