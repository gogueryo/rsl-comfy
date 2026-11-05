import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "RSL.FastImageVideoStitchTheme",
    nodeCreated(node) {
        if (node.comfyClass === "FastImageVideoStitch") {
            // Apply custom theme colors
            node.color = "#2d1b4e";
            node.bgcolor = "#1a1128";
            
            // Button to target the root output directory (leaves path blank)
            node.addWidget("button", "📁 Use Root Output", "", () => {
                const pathWidget = node.widgets.find(w => w.name === "file_path");
                if (pathWidget) {
                    pathWidget.value = "";
                    node.setDirtyCanvas(true, true);
                }
            });

            if (node.widgets) {
                node.widgets.forEach(w => {
                    if (w.type === "text" || w.type === "custom") {
                        w.inputEl.style.backgroundColor = "#241738";
                        w.inputEl.style.color = "#ffd700";
                    }
                });
            }
        }
    }
});