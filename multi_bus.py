from .config import MAX_SLOTS
# MAX_SLOTS = 50  # Set your maximum slot count here

class MultiBusReroute:
    DESCRIPTION = f"""rsl Multi-Bus Reroute:
    - Provides up to {MAX_SLOTS} dynamic wildcard slots (bus_1 through bus_{MAX_SLOTS}) for routing data bundles.
    - Passes inputs directly through to corresponding outputs cleanly."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {f"bus_{i}": ("*",) for i in range(1, MAX_SLOTS + 1)}
        }

    RETURN_TYPES = tuple("*" for _ in range(MAX_SLOTS))
    RETURN_NAMES = tuple(f"bus_{i}" for i in range(1, MAX_SLOTS + 1))
    FUNCTION = "passthrough"
    CATEGORY = "rsl/utils"

    def passthrough(self, **kwargs):
        values = []
        for i in range(1, MAX_SLOTS + 1):
            values.append(kwargs.get(f"bus_{i}", None))
        return tuple(values)