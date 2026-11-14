class SwitchBusLinkNode:
    DESCRIPTION = (
        "Dynamically switches between multiple RSL_BUS_LINK inputs based on a dropdown selector.\n\n"
        "• Strict RSL_BUS_LINK type enforcement across all inputs and outputs.\n"
        "• Outputs the selected bus bundle, selected input name, and comma-separated list of items."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "select": (
                    [],
                    {
                        "default": "",
                        "tooltip": "Dropdown to select which bus input to output.",
                    },
                ),
            },
            "optional": {},
        }

    @classmethod
    def VALIDATE_INPUTS(cls, select, **kwargs):
        return True

    RETURN_TYPES = ("RSL_BUS_LINK", "STRING", "STRING")
    RETURN_NAMES = ("bus_output", "selected", "items")
    FUNCTION = "switch_bus"
    CATEGORY = "rsl/utils"

    def switch_bus(self, select="", **kwargs):
        selected_bus = kwargs.get(select, None)
        selected_output = selected_bus if selected_bus is not None else {}

        bus_keys = [k for k in kwargs.keys() if k != "select"]
        if not bus_keys:
            bus_keys = [select] if select else []

        items_str = ", ".join(bus_keys)

        return (selected_output, select, items_str)


NODE_CLASS_MAPPINGS = {"SwitchBusLink": SwitchBusLinkNode}
NODE_DISPLAY_NAME_MAPPINGS = {"SwitchBusLink": "rsl Switch Bus Link"}
