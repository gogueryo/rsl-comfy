import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "RSL.CropNodeCustomUI",
    async nodeCreated(node) {
        if (node.comfyClass === "RSLCropNode") {
            // Match the deeper, richer purple theme from the stitcher node
            node.color = "#351c4d";
            node.bgcolor = "#1a0f24";
            
            // Custom canvas rendering to group related inputs with bordered cards
            const origDrawForeground = node.onDrawForeground;
            node.onDrawForeground = function(ctx) {
                if (origDrawForeground) {
                    origDrawForeground.apply(this, arguments);
                }
                
                if (!this.widgets || this.widgets.length === 0) return;
                
                // Helper to find widget bounding box by name
                const getWidgetY = (name) => {
                    const w = this.widgets.find(item => item.name === name);
                    return w ? w.y : null;
                };

                ctx.save();
                ctx.lineWidth = 1;
                ctx.strokeStyle = "#4d2d6e"; // Border color for groups
                ctx.fillStyle = "rgba(0, 0, 0, 0.15)"; // Subtle container background fill

                // Group 1: Uniform Inset (if uniform_inset exists)
                const yUniform = getWidgetY("uniform_inset");
                if (yUniform) {
                    const boxTop = yUniform - 6;
                    const boxHeight = 28;
                    ctx.fillStyle = "rgba(77, 45, 110, 0.15)";
                    ctx.fillRect(10, boxTop, this.size[0] - 20, boxHeight);
                    ctx.strokeRect(10, boxTop, this.size[0] - 20, boxHeight);
                }

                // Group 2: Origin Box (anchor_x, anchor_y, width, height)
                const yAnchorX = getWidgetY("anchor_x");
                const yHeight = getWidgetY("height");
                if (yAnchorX && yHeight) {
                    const boxTop = yAnchorX - 6;
                    const boxHeight = (yHeight - yAnchorX) + 26;
                    ctx.fillStyle = "rgba(77, 45, 110, 0.15)";
                    ctx.fillRect(10, boxTop, this.size[0] - 20, boxHeight);
                    ctx.strokeRect(10, boxTop, this.size[0] - 20, boxHeight);
                }

                // Group 3: Edge Trims (crop_top, crop_bottom, crop_left, crop_right)
                const yTop = getWidgetY("crop_top");
                const yRight = getWidgetY("crop_right");
                if (yTop && yRight) {
                    const boxTop = yTop - 6;
                    const boxHeight = (yRight - yTop) + 26;
                    ctx.fillStyle = "rgba(77, 45, 110, 0.15)";
                    ctx.fillRect(10, boxTop, this.size[0] - 20, boxHeight);
                    ctx.strokeRect(10, boxTop, this.size[0] - 20, boxHeight);
                }

                ctx.restore();
            };
        }
    }
});