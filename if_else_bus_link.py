class IfElseBusLinkNode:
    """
    A dedicated conditional router node for RSL_BUS_LINK bundles based on boolean flags and connection status.
    """

    DESCRIPTION = (
        "IfElseBusLinkNode conditionally routes RSL_BUS_LINK bundles based on a boolean toggle and connection status:\n\n"
        "• If 'as_is' is True: Directly outputs the selected bus_link ('source-true' or 'source-false').\n"
        "• If 'as_is' is False: Outputs the selected bus_link if connected, or falls back to disconnect inputs / empty bundle ({}) otherwise."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "boolean": (
                    "BOOLEAN",
                    {
                        "default": True,
                        "tooltip": "Boolean flag to choose between source-true (True) or source-false (False).",
                    },
                ),
                "as_is": (
                    "BOOLEAN",
                    {
                        "default": False,
                        "tooltip": "If True, passes the selected bus_link directly as-is. If False, falls back when disconnected.",
                    },
                ),
            },
            "optional": {
                "source-true": (
                    "RSL_BUS_LINK",
                    {"tooltip": "The RSL_BUS_LINK bundle to pass if boolean is True."},
                ),
                "source-false": (
                    "RSL_BUS_LINK",
                    {"tooltip": "The RSL_BUS_LINK bundle to pass if boolean is False."},
                ),
                "disconnect-true": (
                    "RSL_BUS_LINK",
                    {
                        "tooltip": "Fallback RSL_BUS_LINK if boolean is True and source-true is disconnected."
                    },
                ),
                "disconnect-false": (
                    "RSL_BUS_LINK",
                    {
                        "tooltip": "Fallback RSL_BUS_LINK if boolean is False and source-false is disconnected."
                    },
                ),
            },
        }

    RETURN_TYPES = ("RSL_BUS_LINK", "BOOLEAN", "BOOLEAN")
    RETURN_NAMES = ("bus_output", "boolean", "connected")
    OUTPUT_TOOLTIPS = (
        "The resulting RSL_BUS_LINK dictionary bundle.",
        "Pass-through of the current boolean flag.",
        "True if the selected input port was actively connected, False otherwise.",
    )
    FUNCTION = "evaluate_bus"
    CATEGORY = "rsl/utils"

    def evaluate_bus(self, boolean, as_is=False, **kwargs):
        source_true = kwargs.get("source-true", None)
        source_false = kwargs.get("source-false", None)
        disconnect_true = kwargs.get("disconnect-true", None)
        disconnect_false = kwargs.get("disconnect-false", None)

        selected_input = source_true if boolean else source_false
        selected_disconnect = disconnect_true if boolean else disconnect_false

        is_connected = selected_input is not None
        is_disconnect_connected = selected_disconnect is not None

        if as_is:
            output_val = selected_input if selected_input is not None else {}
        else:
            if is_connected:
                output_val = selected_input
            elif is_disconnect_connected:
                output_val = selected_disconnect
            else:
                output_val = {}

        return (output_val, boolean, is_connected)


NODE_CLASS_MAPPINGS = {"IfElseBusLink": IfElseBusLinkNode}

NODE_DISPLAY_NAME_MAPPINGS = {"IfElseBusLink": "rsl If Else Bus Link"}
