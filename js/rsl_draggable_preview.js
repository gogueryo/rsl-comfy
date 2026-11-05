import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "RSL.DraggablePreviewUI",
    async nodeCreated(node) {
        if (node.comfyClass !== "RSLDraggablePreviewNode") return;

        const container = document.createElement("div");
        container.style.display = "flex";
        container.style.flexDirection = "column";
        container.style.alignItems = "center";
        container.style.justifyContent = "center";
        container.style.width = "100%";
        container.style.height = "100%";
        container.style.backgroundColor = "#18181b";
        container.style.borderRadius = "6px";
        container.style.padding = "4px";
        container.style.boxSizing = "border-box";

        const previewImg = document.createElement("img");
        previewImg.style.maxWidth = "100%";
        previewImg.style.maxHeight = "220px";
        previewImg.style.objectFit = "contain";
        previewImg.style.borderRadius = "4px";
        previewImg.style.display = "none";
        previewImg.draggable = true;

        const infoLabel = document.createElement("div");
        infoLabel.style.fontSize = "9px";
        infoLabel.style.color = "#a1a1aa";
        infoLabel.style.marginTop = "4px";
        infoLabel.innerText = "Drag image to Prompt Tracker";

        const placeholder = document.createElement("div");
        placeholder.innerText = "No Image Generated Yet";
        placeholder.style.fontSize = "11px";
        placeholder.style.color = "#a1a1aa";
        placeholder.style.padding = "20px";

        container.appendChild(previewImg);
        container.appendChild(infoLabel);
        container.appendChild(placeholder);

        let currentImageInfo = { steps: 20, cfg: 8.0, denoise: 1.0, seed: 0, render_model: "undefined", image: "" };

        // Configure drag transfer to bundle permanent base64 image and metadata JSON including render_model
        previewImg.addEventListener("dragstart", (e) => {
            if (!currentImageInfo.image) return;
            
            const payload = JSON.stringify({
                image: currentImageInfo.image,
                render_model: currentImageInfo.render_model,
                image_info: {
                    steps: currentImageInfo.steps,
                    cfg: currentImageInfo.cfg,
                    denoise: currentImageInfo.denoise,
                    seed: currentImageInfo.seed
                }
            });
            
            e.dataTransfer.setData("application/rsl-preview-bundle", payload);
            e.dataTransfer.setData("DownloadURL", `image/png:rsl_preview.png:${currentImageInfo.image}`);
        });

        const origOnExecuted = node.onExecuted;
        node.onExecuted = async function(message) {
            if (origOnExecuted) origOnExecuted.apply(this, arguments);
            
            if (message && message.images && message.images.length > 0) {
                const imgData = message.images[0];
                
                const subfolder = imgData.subfolder || "";
                const imageUrl = api.apiURL(`/view?filename=${encodeURIComponent(imgData.filename)}&type=${imgData.type || "temp"}&subfolder=${encodeURIComponent(subfolder)}&t=${Date.now()}`);
                
                if (imgData.image_info) {
                    currentImageInfo.steps = imgData.image_info.steps ?? 20;
                    currentImageInfo.cfg = imgData.image_info.cfg ?? 8.0;
                    currentImageInfo.denoise = imgData.image_info.denoise ?? 1.0;
                    currentImageInfo.seed = imgData.image_info.seed ?? 0;
                }

                if (imgData.render_model) {
                    currentImageInfo.render_model = imgData.render_model;
                }

                infoLabel.innerText = `Model: ${currentImageInfo.render_model} | Steps: ${currentImageInfo.steps} | CFG: ${currentImageInfo.cfg} | Seed: ${currentImageInfo.seed}`;

                try {
                    const response = await fetch(imageUrl);
                    const blob = await response.blob();
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        currentImageInfo.image = reader.result;
                        previewImg.src = currentImageInfo.image;
                        previewImg.style.display = "block";
                        placeholder.style.display = "none";
                        node.setDirtyCanvas(true, true);
                    };
                    reader.readAsDataURL(blob);
                } catch (err) {
                    console.error("Failed to convert preview image to base64", err);
                    previewImg.src = imageUrl;
                    previewImg.style.display = "block";
                    placeholder.style.display = "none";
                }
            }
        };

        node.addDOMWidget("draggable_preview_panel", "container", container);
        node.setSize([320, 380]);
    }
});
