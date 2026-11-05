class ComboStringsNode:
    """
    A user-definable dropdown combo box node for ComfyUI that allows selecting items from a list,
    with built-in choice and index controls and optional external string search.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "choices": ("STRING", {
                    "default": "option1\noption2\noption3",
                    "multiline": True,
                    "tooltip": "List of options separated by newlines."
                }),
                "choice": ("STRING", {
                    "default": "option1",
                    "tooltip": "Currently selected choice from the dropdown."
                }),
                "index": ("INT", {
                    "default": 0,
                    "min": 0,
                    "max": 999999,
                    "tooltip": "Index corresponding to the choice."
                }),
            },
            "optional": {
                "string": ("*", {
                    "tooltip": "Optional external string input to search in the choices list."
                }),
            },
        }

    RETURN_TYPES = ("STRING", "INT", "BOOLEAN")
    RETURN_NAMES = ("string", "index", "success")
    OUTPUT_TOOLTIPS = (
        "The matched or selected string value.",
        "The index of the string value in the list (-1 if not found).",
        "True if the string was successfully found in the list, False otherwise."
    )
    FUNCTION = "evaluate"
    CATEGORY = "rsl/utils"

    def evaluate(self, choices, choice, index=0, **kwargs):
        # Parse choices list separated by newlines
        items = [item.strip() for item in choices.split("\n") if item.strip()]
        if not items:
            items = ["option1"]

        string_input = kwargs.get("string", None)
        has_string_input = string_input is not None and string_input != ""

        selected_string = choice
        selected_index = -1
        success = False

        if has_string_input:
            if string_input in items:
                selected_string = string_input
                selected_index = items.index(string_input)
                success = True
            else:
                selected_string = string_input
                selected_index = -1
                success = False
        else:
            # Evaluate using UI choice and index values
            if choice in items:
                selected_string = choice
                selected_index = items.index(choice)
                success = True
            elif 0 <= index < len(items):
                selected_string = items[index]
                selected_index = index
                success = True
            else:
                selected_string = choice
                selected_index = -1
                success = False

        return (selected_string, selected_index, success)


NODE_CLASS_MAPPINGS = {
    "ComboStrings": ComboStringsNode
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ComboStrings": "rsl Combo Strings"
}