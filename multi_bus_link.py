import json

from .config import MAX_SLOTS
# MAX_SLOTS = 50  # Set your maximum slot count here

class MultiBusLinkReroute:
    DESCRIPTION = f"""rsl Multi-Bus Link Reroute:
    - Index 0 (bus_link) carries execution dependency and dynamic dictionary bundles across nodes using the 'RSL_BUS_LINK' type.[cite: 3]
    - Slots 1-{MAX_SLOTS} route data dynamically via user-defined labels using a slot mapping JSON.[cite: 3]
    - Merges local slot inputs as overrides onto incoming bus bundles while passing untouched values forward."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "slot_map_json": ("STRING", {"default": "{}", "multiline": False}),
            },
            "optional": {
                "bus_link": ("RSL_BUS_LINK", {"tooltip": "Direct bus bundle wire carrying label-matched slot data."}),
                **{f"bus_{i}": ("*",) for i in range(1, MAX_SLOTS + 1)}
            }
        }

    RETURN_TYPES = tuple(["RSL_BUS_LINK"] + ["*" for _ in range(MAX_SLOTS)])
    RETURN_NAMES = tuple(["bus_link"] + [f"bus_{i}" for i in range(1, MAX_SLOTS + 1)])
    
    FUNCTION = "route_bus"
    CATEGORY = "rsl/utils"

    def route_bus(self, slot_map_json="{}", bus_link=None, **kwargs):
        try:
            slot_map = json.loads(slot_map_json)
        except:
            slot_map = {}

        # 1. Start with a copy of the incoming bus dictionary if available, or a fresh dict[cite: 3]
        active_data = dict(bus_link) if isinstance(bus_link, dict) else {}

        # 2. Overlay any local non-None inputs as overrides on top of the active bundle[cite: 3]
        for i in range(1, MAX_SLOTS + 1):
            key = f"bus_{i}"
            label = slot_map.get(key, key)
            val = kwargs.get(key, None)
            if val is not None:
                active_data[label] = val

        # 3. Match and output slot values by label name. Unmatched slots gracefully skip (None).[cite: 3]
        output_values = []
        for i in range(1, MAX_SLOTS + 1):
            key = f"bus_{i}"
            label = slot_map.get(key, key)
            val = active_data.get(label, None)
            output_values.append(val)

        while len(output_values) < MAX_SLOTS:
            output_values.append(None)

        return tuple([active_data] + output_values)


NODE_CLASS_MAPPINGS = {
    "MultiBusLinkReroute": MultiBusLinkReroute
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "MultiBusLinkReroute": "rsl Multi-Bus Link Reroute"
}