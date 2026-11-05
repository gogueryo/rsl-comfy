import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

app.registerExtension({
    name: "RSL.LoraDescriptionEditor",
    async nodeCreated(node) {
        if (node.comfyClass !== "LoraDescriptionEditor") return;

        // Apply custom Utils Theme Styling (Purple/Orange/Gold accents)
        node.color = "#2a1b3d";     // Deep Purple header
        node.bgcolor = "#150b22";   // Darker panel body

        // Create main container
        const container = document.createElement("div");
        container.style.display = "flex";
        container.style.flexDirection = "column";
        container.style.gap = "8px";
        container.style.padding = "10px";
        container.style.width = "420px";
        container.style.background = "#1b1128";
        container.style.border = "2px solid #e67e22"; // Orange accent
        container.style.borderRadius = "8px";
        container.style.color = "#f1c40f";          // Gold/Amber text
        container.style.fontFamily = "sans-serif";
        container.style.fontSize = "12px";

        // 1. Directory Input Row
        const topRow = document.createElement("div");
        topRow.style.display = "flex";
        topRow.style.gap = "6px";

        const dirInput = document.createElement("input");
        dirInput.type = "text";
        dirInput.placeholder = "Enter dataset directory path...";
        dirInput.style.flex = "1";
        dirInput.style.padding = "6px";
        dirInput.style.background = "#0f0718";
        dirInput.style.border = "1px solid #9b59b6";
        dirInput.style.color = "#fff";
        dirInput.style.borderRadius = "4px";

        const loadBtn = document.createElement("button");
        loadBtn.innerText = "Load Directory";
        loadBtn.style.background = "#e67e22";
        loadBtn.style.color = "#fff";
        loadBtn.style.border = "none";
        loadBtn.style.padding = "6px 12px";
        loadBtn.style.borderRadius = "4px";
        loadBtn.style.cursor = "pointer";
        loadBtn.style.fontWeight = "bold";

        topRow.appendChild(dirInput);
        topRow.appendChild(loadBtn);
        container.appendChild(topRow);

        // 2. Thumbnail Strip
        const thumbContainer = document.createElement("div");
        thumbContainer.style.display = "flex";
        thumbContainer.style.alignItems = "center";
        thumbContainer.style.gap = "6px";
        thumbContainer.style.overflowX = "auto";
        thumbContainer.style.padding = "6px";
        thumbContainer.style.background = "#12081d";
        thumbContainer.style.border = "1px solid #9b59b6";
        thumbContainer.style.borderRadius = "4px";
        thumbContainer.style.minHeight = "90px";

        container.appendChild(thumbContainer);

        // 3. Text Editor Area
        const textArea = document.createElement("textarea");
        textArea.placeholder = "Select an image thumbnail above to edit its description...";
        textArea.style.width = "100%";
        textArea.style.height = "120px";
        textArea.style.background = "#0f0718";
        textArea.style.border = "1px solid #9b59b6";
        textArea.style.color = "#f1c40f";
        textArea.style.padding = "8px";
        textArea.style.borderRadius = "4px";
        textArea.style.resize = "vertical";

        container.appendChild(textArea);

        // 4. Update Button
        const bottomRow = document.createElement("div");
        bottomRow.style.display = "flex";
        bottomRow.style.justifyContent = "flex-end";

        const updateBtn = document.createElement("button");
        updateBtn.innerText = "Update / Save to Disk";
        updateBtn.style.background = "#f1c40f";
        updateBtn.style.color = "#150b22";
        updateBtn.style.border = "none";
        updateBtn.style.padding = "8px 16px";
        updateBtn.style.borderRadius = "4px";
        updateBtn.style.cursor = "pointer";
        updateBtn.style.fontWeight = "bold";

        bottomRow.appendChild(updateBtn);
        container.appendChild(bottomRow);

        node.addDOMWidget("lora_editor", "editor", container);

        let currentDataset = [];
        let selectedIndex = null;

        loadBtn.onclick = async () => {
            const dir = dirInput.value.trim();
            if (!dir) return alert("Please enter a valid directory path.");
            
            try {
                const res = await api.fetchApi(`/rsl/utils/get_dataset?dir=${encodeURIComponent(dir)}`);
                const data = await res.json();
                if (data.items) {
                    currentDataset = data.items;
                    renderThumbnails();
                }
            } catch (err) {
                console.error(err);
                alert("Failed to load directory.");
            }
        };

        function renderThumbnails() {
            thumbContainer.innerHTML = "";
            currentDataset.forEach((item, index) => {
                const thumb = document.createElement("div");
                thumb.style.minWidth = "60px";
                thumb.style.height = "75px";
                thumb.style.background = "#000";
                thumb.style.border = index === selectedIndex ? "2px solid #f1c40f" : "1px solid #9b59b6";
                thumb.style.borderRadius = "4px";
                thumb.style.cursor = "pointer";
                thumb.style.backgroundImage = `url('/view?filename=${encodeURIComponent(item.filename)}&type=input&subfolder=')`;
                thumb.style.backgroundSize = "cover";
                thumb.style.backgroundPosition = "center";

                thumb.onclick = () => {
                    selectedIndex = index;
                    textArea.value = item.caption;
                    renderThumbnails();
                };
                thumbContainer.appendChild(thumb);
            });
        }

        updateBtn.onclick = async () => {
            if (selectedIndex === null || !currentDataset[selectedIndex]) {
                return alert("Please select an image thumbnail first.");
            }
            const item = currentDataset[selectedIndex];
            item.caption = textArea.value;

            try {
                const res = await api.fetchApi("/rsl/utils/update_caption", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        dir: dirInput.value.trim(),
                        filename: item.filename,
                        caption: item.caption
                    })
                });
                const result = await res.json();
                if (result.success) {
                    alert(`Updated caption for ${item.filename}!`);
                } else {
                    alert("Error saving: " + result.error);
                }
            } catch (err) {
                console.error(err);
                alert("Error updating caption.");
            }
        };
    }
});