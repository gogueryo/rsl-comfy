import re

class RegexExtractAllNode:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "string": ("STRING", {"multiline": True}),
                "regex_pattern": ("STRING", {"multiline": True}),
                "mode": (["All Matches", "First Match"],),
            }
        }

    RETURN_TYPES = ("STRING",)
    FUNCTION = "extract_text"
    CATEGORY = "rsl/utils"

    def extract_text(self, string, regex_pattern, mode):
        patterns = [p.strip() for p in regex_pattern.splitlines() if p.strip()]
        if not patterns:
            return ("",)

        flags = re.DOTALL | re.MULTILINE
        all_cleaned = []

        if mode == "First Match":
            for pat in patterns:
                match = re.search(pat, string, flags)
                if match:
                    if match.groups():
                        all_cleaned.append(str(match.group(1) if match.group(1) is not None else match.group(0)))
                    else:
                        all_cleaned.append(str(match.group(0)))
                    break
            return ("\n".join(all_cleaned),)

        for pat in patterns:
            matches = re.findall(pat, string, flags)
            for m in matches:
                if isinstance(m, tuple):
                    all_cleaned.append(str(m[0]) if m else "")
                else:
                    all_cleaned.append(str(m))

        return ("\n".join(all_cleaned),)


class RegexReplaceAllNode:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "string": ("STRING", {"multiline": True}),
                "regex_pattern": ("STRING", {"multiline": True}),
                "replacement": ("STRING", {"multiline": True, "default": ""}),
            }
        }

    RETURN_TYPES = ("STRING",)
    FUNCTION = "replace_text"
    CATEGORY = "rsl/utils"

    def replace_text(self, string, regex_pattern, replacement):
        patterns = [p.strip() for p in regex_pattern.splitlines() if p.strip()]
        if not patterns:
            return (string,)

        flags = re.DOTALL | re.MULTILINE
        result_string = string

        for pat in patterns:
            # Custom replacement function to prevent zero-length/empty string matching loops
            def safe_replace(match):
                matched_text = match.group(0)
                if not matched_text:
                    return matched_text
                # If using capture groups like \1, expand them safely against the match
                return match.expand(replacement)

            result_string = re.sub(pat, safe_replace, result_string, flags=flags)

        return (result_string,)