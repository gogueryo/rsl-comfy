class AlwaysEqualProxy(str):

    def __eq__(self, _):
        return True

    def __ne__(self, _):
        return False


any_type = AlwaysEqualProxy("*")


class SwitchAnyNode:
    DESCRIPTION = (
        "Dynamically switches between multiple inputs of any type based on a string selector.\n\n"
        "• Accepts any ComfyUI data type across all dynamic inputs and outputs.\n"
        "• Accepts external STRING connections on 'select' or dropdown selection.\n"
        "• Outputs the selected data, selected input name, and comma-separated list of items."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "select": (
                    "STRING",
                    {
                        "default": "input_1",
                        "tooltip": "Dropdown selection or incoming STRING wire from outside.",
                    },
                ),
            },
            "optional": {},
        }

    @classmethod
    def VALIDATE_INPUTS(cls, select, **kwargs):
        return True

    RETURN_TYPES = (any_type, "STRING", "STRING")
    RETURN_NAMES = ("output", "selected", "items")
    FUNCTION = "switch_any"
    CATEGORY = "rsl/utils"

    def switch_any(self, select="input_1", **kwargs):
        selected_output = kwargs.get(select, None)

        input_keys = [k for k in kwargs.keys() if k != "select"]
        if not input_keys:
            input_keys = [select] if select else []

        items_str = ", ".join(input_keys)

        return (selected_output, select, items_str)


NODE_CLASS_MAPPINGS = {"SwitchAny": SwitchAnyNode}
NODE_DISPLAY_NAME_MAPPINGS = {"SwitchAny": "rsl Switch Any"}
