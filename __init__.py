from .lora_description_editor import LoraDescriptionEditorNode
from .prompt_tracker import PromptTrackerNode
from .prompt_driver import PromptDriverNode
from .multi_bus import MultiBusReroute
from .multi_bus_link import MultiBusLinkReroute
from .text_regex import RegexExtractAllNode, RegexReplaceAllNode
from .if_else_check_input import IfElseCheckInputNode
from .if_else_bus_link import IfElseBusLinkNode
from .if_else_int import IfElseIntNode
from .if_else_float import IfElseFloatNode
from .if_else_text import IfElseTextNode
from .json_op import JSONOpNode
from .json_editor import JSONEditorNode
from .combo_strings import ComboStringsNode
from .fast_image_video_stitch import FastImageVideoStitch
from .rsl_queue_stopper import RSLQueueStopper
from .rsl_crop_node import RSLCropNode
from .yaml_viewer_node import DatasetYAMLViewer
from .directory_selector import RSLDirectorySelector
from .rsl_draggable_preview import RSLDraggablePreviewNode
from .rsl_lora_loader import RSLLoraLoader
from .rsl_lora_stacker import RSLLoraStackerNode
from .switch_bus_link import (
    SwitchBusLinkNode,
)  # <--- 1. Import new Switch Bus Link node

NODE_CLASS_MAPPINGS = {
    "LoraDescriptionEditor": LoraDescriptionEditorNode,
    "PromptTrackerNode": PromptTrackerNode,
    "PromptDriverNode": PromptDriverNode,
    "MultiBusReroute": MultiBusReroute,
    "MultiBusLinkReroute": MultiBusLinkReroute,
    "RegexExtractAllNode": RegexExtractAllNode,
    "RegexReplaceAllNode": RegexReplaceAllNode,
    "IfElseCheckInput": IfElseCheckInputNode,
    "IfElseBusLink": IfElseBusLinkNode,
    "IfElseInt": IfElseIntNode,
    "IfElseFloat": IfElseFloatNode,
    "IfElseText": IfElseTextNode,
    "JSONOpNode": JSONOpNode,
    "JSONEditorNode": JSONEditorNode,
    "ComboStrings": ComboStringsNode,
    "FastImageVideoStitch": FastImageVideoStitch,
    "RSLQueueStopper": RSLQueueStopper,
    "RSLCropNode": RSLCropNode,
    "DatasetYAMLViewer": DatasetYAMLViewer,
    "RSLDirectorySelector": RSLDirectorySelector,
    "RSLDraggablePreviewNode": RSLDraggablePreviewNode,
    "RSLLoraLoader": RSLLoraLoader,
    "RSLLoraStackerNode": RSLLoraStackerNode,
    "SwitchBusLink": SwitchBusLinkNode,  # <--- 2. Add class mapping
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "LoraDescriptionEditor": "rsl Lora Description Editor",
    "PromptTrackerNode": "rsl Prompt Tracker & Library",
    "PromptDriverNode": "rsl Prompt Driver",
    "MultiBusReroute": "rsl Multi-Bus Reroute",
    "MultiBusLinkReroute": "rsl Multi-Bus Link Reroute",
    "RegexExtractAllNode": "rsl Regex Extract All",
    "RegexReplaceAllNode": "rsl Regex Replace All",
    "IfElseCheckInput": "rsl If Else Check Input",
    "IfElseBusLink": "rsl If Else Bus Link",
    "IfElseInt": "rsl If Else Int",
    "IfElseFloat": "rsl If Else Float",
    "IfElseText": "rsl If Else Text",
    "JSONOpNode": "rsl JSON Operations",
    "JSONEditorNode": "rsl JSON Interactive Editor & Studio",
    "ComboStrings": "rsl Combo Strings",
    "FastImageVideoStitch": "rsl Fast Image/Video Stitcher",
    "RSLQueueStopper": "rsl Queue Stopper & Video Info",
    "RSLCropNode": "rsl Crop Image & Video Info",
    "DatasetYAMLViewer": "rsl Dataset YAML Config Viewer",
    "RSLDirectorySelector": "rsl Directory Selector",
    "RSLDraggablePreviewNode": "rsl Draggable Preview Image",
    "RSLLoraLoader": "rsl LoRA Loader (with Meta Output)",
    "RSLLoraStackerNode": "rsl LoRA Stacker",
    "SwitchBusLink": "rsl Switch Bus Link",  # <--- 3. Add clean display name
}

WEB_DIRECTORY = "js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
