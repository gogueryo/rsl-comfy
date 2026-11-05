class IfElseFloatNode:
    """
    A float routing node for ComfyUI subgraphs with built-in float controls.
    """

    DESCRIPTION = (
        "IfElseFloat dynamically selects and outputs a float based on a boolean toggle:\n\n"
        "• If 'boolean' is True: Outputs 'true_val'.\n"
        "• If 'boolean' is False: Outputs 'false_val'."
    )

    ALLOW_RENAME = True

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "true_val": ("FLOAT", {
                    "default": 0.0,
                    "min": -0xffffffffffffffff,
                    "max": 0xffffffffffffffff,
                    "step": 0.01,
                    "round": 0.001,
                    "tooltip": "Float value returned when boolean is True."
                }),
                "false_val": ("FLOAT", {
                    "default": 0.0,
                    "min": -0xffffffffffffffff,
                    "max": 0xffffffffffffffff,
                    "step": 0.01,
                    "round": 0.001,
                    "tooltip": "Float value returned when boolean is False."
                }),
                "boolean": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "Boolean flag to choose between true_val (True) or false_val (False)."
                }),
            },
        }

    RETURN_TYPES = ("FLOAT", "BOOLEAN")
    RETURN_NAMES = ("float", "boolean")
    OUTPUT_TOOLTIPS = (
        "The selected float output based on the boolean state.",
        "Pass-through of the incoming boolean flag."
    )
    FUNCTION = "evaluate"
    CATEGORY = "rsl/utils"

    def evaluate(self, true_val, false_val, boolean):
        selected_float = true_val if boolean else false_val
        return (float(selected_float), boolean)


NODE_CLASS_MAPPINGS = {
    "IfElseFloat": IfElseFloatNode
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "IfElseFloat": "rsl If Else Float"
}