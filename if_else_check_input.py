class IfElseCheckInputNode:
    """
    A dynamic utility node for ComfyUI subgraphs that evaluates connection status 
    and boolean conditions to conditionally route values or fallback defaults.
    """

    DESCRIPTION = (
        "IfElseCheckInput dynamically routes values based on a boolean toggle, connection status, and mode settings:\n\n"
        "• If 'as_is' is True: Directly outputs the selected input ('source-true' or 'source-false') without modifying it.\n"
        "• If 'as_is' is False: Outputs the selected input if connected. If disconnected, falls back to the corresponding "
        "disconnect input ('disconnect-true' or 'disconnect-false') if provided, or empty text (\"\") otherwise."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "boolean": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "Boolean flag to choose between source-true (True) or source-false (False)."
                }),
                "as_is": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "If True, passes the selected input directly as-is. If False, falls back to disconnect inputs or empty text when disconnected."
                }),
            },
            "optional": {
                "source-true": ("*", {
                    "tooltip": "The value to pass if boolean is True."
                }),
                "source-false": ("*", {
                    "tooltip": "The value to pass if boolean is False."
                }),
                "disconnect-true": ("*", {
                    "tooltip": "The fallback value to pass if boolean is True and source-true is disconnected."
                }),
                "disconnect-false": ("*", {
                    "tooltip": "The fallback value to pass if boolean is False and source-false is disconnected."
                }),
            },
        }

    RETURN_TYPES = ("*", "BOOLEAN", "BOOLEAN")
    RETURN_NAMES = ("output", "boolean", "connected")
    OUTPUT_TOOLTIPS = (
        "The resulting value based on boolean, as_is, and connection status.",
        "Pass-through of the current boolean flag.",
        "True if the selected input port was actively connected, False otherwise."
    )
    FUNCTION = "evaluate"
    CATEGORY = "rsl/utils"

    def evaluate(self, boolean, as_is=False, **kwargs):
        source_true = kwargs.get("source-true", None)
        source_false = kwargs.get("source-false", None)
        disconnect_true = kwargs.get("disconnect-true", None)
        disconnect_false = kwargs.get("disconnect-false", None)

        selected_input = source_true if boolean else source_false
        selected_disconnect = disconnect_true if boolean else disconnect_false

        is_connected = selected_input is not None
        is_disconnect_connected = selected_disconnect is not None

        if as_is:
            output_val = selected_input
        else:
            if is_connected:
                output_val = selected_input
            elif is_disconnect_connected:
                output_val = selected_disconnect
            else:
                output_val = ""

        return (output_val, boolean, is_connected)


NODE_CLASS_MAPPINGS = {
    "IfElseCheckInput": IfElseCheckInputNode
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "IfElseCheckInput": "rsl If Else Check Input"
}