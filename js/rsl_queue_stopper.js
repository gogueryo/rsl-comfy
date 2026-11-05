import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "RSL.RSLQueueStopperTheme",
    nodeCreated(node) {
        if (node.comfyClass === "RSLQueueStopper") {
            node.color = "#2d1b4e";
            node.bgcolor = "#1a1128";
            
            // Add a "Choose & Upload Video..." button that opens your file selector
            node.addWidget("button", "📁 Choose & Upload Video...", "", () => {
                const fileInput = document.createElement("input");
                fileInput.type = "file";
                fileInput.accept = "video/mp4,video/mkv,video/avi,video/mov,video/webm";
                
                fileInput.onchange = async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    
                    const formData = new FormData();
                    formData.append("image", file);
                    formData.append("type", "input");
                    formData.append("overwrite", "true");
                    
                    try {
                        const response = await fetch("/upload/image", {
                            method: "POST",
                            body: formData
                        });
                        const result = await response.json();
                        
                        if (result.name) {
                            const pathWidget = node.widgets.find(w => w.name === "source_video");
                            if (pathWidget) {
                                pathWidget.value = result.name;
                                node.setDirtyCanvas(true, true);
                            }
                        } else {
                            console.error("Upload failed:", result);
                        }
                    } catch (err) {
                        console.error("Error uploading video file:", err);
                    }
                };
                
                fileInput.click();
            });

            if (node.widgets) {
                node.widgets.forEach(w => {
                    if (w.type === "text" || w.type === "custom") {
                        if (w.inputEl) {
                            w.inputEl.style.backgroundColor = "#241738";
                            w.inputEl.style.color = "#ffd700";
                        }
                    }
                });
            }
        }
    }
});