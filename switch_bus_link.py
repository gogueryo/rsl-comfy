class SwitchBusLinkNode:
    DESCRIPTION = (
        "Dynamically switches between multiple RSL_BUS_LINK inputs based on a dropdown selector.\n\n"
        "• Automatically adds new input slots when all existing inputs are connected.\n"
        "• Outputs the selected bus bundle, selected input name, and comma-separated list of items."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                # Defining select as a dynamic tuple or string list that accepts runtime values
                "select": (
                    ["bus_0"],
                    {
                        "default": "bus_0",
                        "tooltip": "Dropdown to select which bus input to output.",
                    },
                ),
            },
            "optional": {},
        }

    @classmethod
    def VALIDATE_INPUTS(cls, select, **kwargs):
        # Bypass strict backend static validation against INPUT_TYPES to allow dynamic/renamed slots
        return True

    RETURN_TYPES = ("RSL_BUS_LINK", "STRING", "STRING")
    RETURN_NAMES = ("bus_output", "selected", "items")
    OUTPUT_TOOLTIPS = (
        "The RSL_BUS_LINK bundle from the currently selected input.",
        "The name of the currently selected input.",
        "Comma-separated list of all active input names in order.",
    )
    FUNCTION = "switch_bus"
    CATEGORY = "rsl/utils"

    def switch_bus(self, select="bus_0", **kwargs):
        # Gracefully fetch whichever input key matches the dropdown selection
        selected_bus = kwargs.get(select, None)
        selected_output = selected_bus if selected_bus is not None else {}

        # Collect all active input slot keys passed from the frontend (excluding select)
        bus_keys = [k for k in kwargs.keys() if k != "select"]
        items_str = ", ".join(bus_keys) if bus_keys else select

        return (selected_output, select, items_str)


NODE_CLASS_MAPPINGS = {"SwitchBusLink": SwitchBusLinkNode}
NODE_DISPLAY_NAME_MAPPINGS = {"SwitchBusLink": "rsl Switch Bus Link"}
