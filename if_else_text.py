class IfElseTextNode:
    """
    A text routing node for ComfyUI subgraphs with built-in multi-line text controls.
    """

    DESCRIPTION = (
        "IfElseText dynamically selects and outputs text based on a boolean toggle:\n\n"
        "• If 'boolean' is True: Outputs 'true_val'.\n"
        "• If 'boolean' is False: Outputs 'false_val'."
    )

    ALLOW_RENAME = True

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "true_val": ("STRING", {
                    "default": "",
                    "multiline": True,
                    "dynamicPrompts": True,
                    "tooltip": "Text returned when boolean is True."
                }),
                "false_val": ("STRING", {
                    "default": "",
                    "multiline": True,
                    "dynamicPrompts": True,
                    "tooltip": "Text returned when boolean is False."
                }),
                "boolean": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "Boolean flag to choose between true_val (True) or false_val (False)."
                }),
            },
        }

    RETURN_TYPES = ("STRING", "BOOLEAN")
    RETURN_NAMES = ("string", "boolean")
    OUTPUT_TOOLTIPS = (
        "The selected text output based on the boolean state.",
        "Pass-through of the incoming boolean flag."
    )
    FUNCTION = "evaluate"
    CATEGORY = "rsl/utils"

    def evaluate(self, true_val, false_val, boolean):
        selected_text = true_val if boolean else false_val
        return (str(selected_text), boolean)


NODE_CLASS_MAPPINGS = {
    "IfElseText": IfElseTextNode
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "IfElseText": "rsl If Else Text"
}