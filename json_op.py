import json
import re
from typing import Any, Tuple

# Try importing jsonpath_ng for advanced JSONPath queries
try:
    from jsonpath_ng import parse as parse_jsonpath
    HAS_JSONPATH = True
except ImportError:
    HAS_JSONPATH = False


class JSONOpNode:
    """
    JSONOpNode (rsl JSON Operations)
    
    A versatile node for parsing, querying, mutating, formatting, and inspecting 
    JSON strings in ComfyUI. Supports dot-notation path navigation, JSONPath syntax,
    type auto-casting, and flexible action aliasing.
    """

    ACTION_ALIASES = {
        # Extract
        "extract": "extract",
        "read": "extract",
        "get": "extract",
        "select": "extract",
        "fetch": "extract",
        
        # JSONPath
        "jsonpath_query": "jsonpath_query",
        "jsonpath": "jsonpath_query",
        "query": "jsonpath_query",
        "find": "jsonpath_query",
        "search": "jsonpath_query",
        
        # Insert / Update
        "insert/update": "insert/update",
        "insert": "insert/update",
        "update": "insert/update",
        "set": "insert/update",
        "add": "insert/update",
        "put": "insert/update",
        "write": "insert/update",
        
        # Delete
        "delete": "delete",
        "remove": "delete",
        "del": "delete",
        "drop": "delete",
        "pop": "delete",
        
        # Merge
        "merge": "merge",
        "combine": "merge",
        "join": "merge",
        "extend": "merge",
        
        # Get Keys
        "get_keys": "get_keys",
        "keys": "get_keys",
        "list_keys": "get_keys",
        
        # Prettify
        "prettify": "prettify",
        "format": "prettify",
        "pretty": "prettify",
        "indent": "prettify",
        
        # Minify
        "minify": "minify",
        "compress": "minify",
        "compact": "minify",
    }

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "json": ("STRING", {
                    "multiline": True, 
                    "default": "{\n  \"example\": \"value\"\n}",
                    "tooltip": "The source JSON string to operate on."
                }),
                "action": ("STRING", {
                    "default": "extract",
                    "multiline": False,
                    "tooltip": "Action name or alias (e.g., 'extract', 'insert', 'delete', 'merge', 'prettify', 'minify', 'query')."
                }),
            },
            "optional": {
                "path": ("STRING", {
                    "default": "", 
                    "multiline": False,
                    "tooltip": "Dot-notation path (e.g., 'user.address.city' or 'items.0.id') or JSONPath expression (e.g., '$.store.book[*].author')."
                }),
                "value": ("STRING", {
                    "default": "", 
                    "multiline": True,
                    "tooltip": "Value to insert, update, or merge. Can be raw text, primitive values, or valid JSON."
                }),
                "auto_cast_types": ("BOOLEAN", {
                    "default": True,
                    "tooltip": "Automatically converts text values like 'true', '123', '45.6', or 'null' to native types during insert/update."
                }),
            },
        }

    RETURN_TYPES = ("STRING", "STRING", "BOOLEAN", "STRING")
    RETURN_NAMES = ("result json", "org json", "success", "help")
    FUNCTION = "process_json"
    CATEGORY = "rsl/JSON"
    DESCRIPTION = (
        "Manipulates, queries, and formats JSON strings using dot-notation, JSONPath, "
        "or structural operations like insert, delete, merge, and prettify."
    )

    HELP_TEXT = """=== rsl JSON Operations Info & Documentation ===

OVERVIEW:
Performs structural manipulations, queries, and re-formatting on JSON strings.

INPUTS:
• json (STRING, Required): The target JSON string to process.
• action (STRING, Required): Operation to run. Connect wire directly or type name/alias:
    --------------------------------------------------------------------------------
    PRIMARY ACTION          | RECOGNIZED ALIASES
    --------------------------------------------------------------------------------
    extract                 | extract, read, get, select, fetch
    jsonpath_query          | jsonpath_query, jsonpath, query, find, search
    insert/update           | insert/update, insert, update, set, add, put, write
    delete                  | delete, remove, del, drop, pop
    merge                   | merge, combine, join, extend
    get_keys                | get_keys, keys, list_keys
    prettify                | prettify, format, pretty, indent
    minify                  | minify, compress, compact
    --------------------------------------------------------------------------------

• path (STRING, Optional): Target location using dot-notation ('user.name', 'items.0') or JSONPath.
• value (STRING, Optional): Payload for insert/update/merge operations.
• auto_cast_types (BOOLEAN, Optional): Automatically casts string inputs like "123", "true", "45.6", or "null" into proper Python/JSON types.

OUTPUTS:
• result json (STRING): The resulting JSON string or extracted content (blank on failure).
• org json (STRING): Unmodified copy of the input 'json' (useful for pass-through routing).
• success (BOOLEAN): Returns True if the operation succeeded, False on parse/key errors.
• help (STRING): Detailed usage guidelines, action aliases, and runtime diagnostics.
"""

    def process_json(
        self,
        json: str,
        action: str,
        path: str = "",
        value: str = "",
        auto_cast_types: bool = True,
    ) -> Tuple[str, str, bool, str]:
        org_json = json

        # Resolve action string
        normalized_action = self.ACTION_ALIASES.get(str(action).strip().lower(), str(action).strip().lower())

        # 1. Parse Input JSON
        try:
            data = json_lib.loads(json) if json.strip() else {}
        except Exception as e:
            return ("", org_json, False, f"Error: Invalid input JSON -> {str(e)}\n\n{self.HELP_TEXT}")

        # 2. Parse incoming 'value' widget/slot
        parsed_value = self._parse_value(value, auto_cast_types)

        try:
            # --- EXTRACT ---
            if normalized_action == "extract":
                if not path.strip():
                    return (json_lib.dumps(data, indent=2), org_json, True, self.HELP_TEXT)
                res = self._get_path(data, path)
                output = json_lib.dumps(res, indent=2) if isinstance(res, (dict, list)) else str(res)
                return (output, org_json, True, self.HELP_TEXT)

            # --- JSONPATH QUERY ---
            elif normalized_action == "jsonpath_query":
                if not path.strip():
                    return (json_lib.dumps(data, indent=2), org_json, True, self.HELP_TEXT)
                if not HAS_JSONPATH:
                    return (
                        "",
                        org_json,
                        False,
                        "Error: 'jsonpath-ng' library is not installed in your Python environment.\n"
                        "Run: pip install jsonpath-ng\n\n" + self.HELP_TEXT,
                    )
                jsonpath_expr = parse_jsonpath(path)
                matches = [match.value for match in jsonpath_expr.find(data)]
                output = json_lib.dumps(matches, indent=2)
                return (output, org_json, True, self.HELP_TEXT)

            # --- INSERT / UPDATE ---
            elif normalized_action == "insert/update":
                if not path.strip():
                    return ("", org_json, False, f"Error: 'path' is required for insert/update.\n\n{self.HELP_TEXT}")
                self._set_path(data, path, parsed_value)
                return (json_lib.dumps(data, indent=2), org_json, True, self.HELP_TEXT)

            # --- DELETE ---
            elif normalized_action == "delete":
                if not path.strip():
                    return ("", org_json, False, f"Error: 'path' is required for delete.\n\n{self.HELP_TEXT}")
                success = self._delete_path(data, path)
                output = json_lib.dumps(data, indent=2) if success else ""
                return (output, org_json, success, self.HELP_TEXT)

            # --- MERGE ---
            elif normalized_action == "merge":
                if isinstance(parsed_value, dict) and isinstance(data, dict):
                    data.update(parsed_value)
                    return (json_lib.dumps(data, indent=2), org_json, True, self.HELP_TEXT)
                return (
                    "",
                    org_json,
                    False,
                    f"Error: Both input JSON and value must be valid JSON objects (dicts) to merge.\n\n{self.HELP_TEXT}",
                )

            # --- GET KEYS ---
            elif normalized_action == "get_keys":
                target = self._get_path(data, path) if path.strip() else data
                if isinstance(target, dict):
                    keys = list(target.keys())
                    return (json_lib.dumps(keys, indent=2), org_json, True, self.HELP_TEXT)
                elif isinstance(target, list):
                    indices = list(range(len(target)))
                    return (json_lib.dumps(indices, indent=2), org_json, True, self.HELP_TEXT)
                return ("", org_json, False, f"Error: Target at path is not an object or array.\n\n{self.HELP_TEXT}")

            # --- PRETTIFY ---
            elif normalized_action == "prettify":
                return (json_lib.dumps(data, indent=2), org_json, True, self.HELP_TEXT)

            # --- MINIFY ---
            elif normalized_action == "minify":
                return (json_lib.dumps(data, separators=(",", ":")), org_json, True, self.HELP_TEXT)

        except Exception as err:
            return ("", org_json, False, f"Operation Error ({normalized_action}): {str(err)}\n\n{self.HELP_TEXT}")

        return ("", org_json, False, self.HELP_TEXT)

    # --- HELPER METHODS ---

    def _parse_value(self, raw_val: str, auto_cast: bool) -> Any:
        if not isinstance(raw_val, str) or not raw_val.strip():
            return raw_val

        val_str = raw_val.strip()

        try:
            return json_lib.loads(val_str)
        except Exception:
            pass

        if auto_cast:
            if val_str.lower() == "true":
                return True
            if val_str.lower() == "false":
                return False
            if val_str.lower() == "null":
                return None
            if re.match(r"^-?\d+$", val_str):
                return int(val_str)
            if re.match(r"^-?\d+\.\d+$", val_str):
                return float(val_str)

        return raw_val

    def _parse_keys(self, path: str):
        keys = []
        for part in path.split("."):
            part = part.strip()
            if part.isdigit():
                keys.append(int(part))
            else:
                keys.append(part)
        return keys

    def _get_path(self, data: Any, path: str) -> Any:
        keys = self._parse_keys(path)
        curr = data
        for k in keys:
            if isinstance(curr, dict) and k in curr:
                curr = curr[k]
            elif isinstance(curr, list) and isinstance(k, int) and 0 <= k < len(curr):
                curr = curr[k]
            else:
                raise KeyError(f"Path step '{k}' not found.")
        return curr

    def _set_path(self, data: Any, path: str, val: Any) -> None:
        keys = self._parse_keys(path)
        curr = data
        for k in keys[:-1]:
            if isinstance(curr, dict):
                if k not in curr or not isinstance(curr[k], (dict, list)):
                    curr[k] = {}
                curr = curr[k]
            elif isinstance(curr, list) and isinstance(k, int):
                curr = curr[k]

        last_k = keys[-1]
        if isinstance(curr, dict):
            curr[last_k] = val
        elif isinstance(curr, list) and isinstance(last_k, int):
            if 0 <= last_k < len(curr):
                curr[last_k] = val
            elif last_k == len(curr):
                curr.append(val)

    def _delete_path(self, data: Any, path: str) -> bool:
        keys = self._parse_keys(path)
        curr = data
        for k in keys[:-1]:
            if isinstance(curr, dict) and k in curr:
                curr = curr[k]
            elif isinstance(curr, list) and isinstance(k, int) and 0 <= k < len(curr):
                curr = curr[k]
            else:
                return False

        last_k = keys[-1]
        if isinstance(curr, dict) and last_k in curr:
            del curr[last_k]
            return True
        elif isinstance(curr, list) and isinstance(last_k, int) and 0 <= last_k < len(curr):
            curr.pop(last_k)
            return True
        return False


# Alias Python's built-in json module internally to avoid conflict with method parameter 'json'
import json as json_lib