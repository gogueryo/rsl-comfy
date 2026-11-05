import { api } from "../../scripts/api.js";

/**
 * Reusable Folder Picker Modal
 * Can be called from any custom node frontend script.
 */
export function openFolderPickerModal(initialPath, onSelectCallback) {
    let currentPath = initialPath || "";

    const overlay = document.createElement("div");
    overlay.tabIndex = 0;
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100vw";
    overlay.style.height = "100vh";
    overlay.style.background = "rgba(10, 5, 18, 0.85)";
    overlay.style.display = "flex";
    overlay.style.justifyContent = "center";
    overlay.style.alignItems = "center";
    overlay.style.zIndex = "999999";
    overlay.style.padding = "20px";
    overlay.style.boxSizing = "border-box";
    overlay.style.outline = "none";

    const modal = document.createElement("div");
    modal.style.background = "#1b1128";
    modal.style.border = "2px solid #9b59b6";
    modal.style.borderRadius = "8px";
    modal.style.padding = "16px";
    modal.style.display = "flex";
    modal.style.flexDirection = "column";
    modal.style.gap = "10px";
    modal.style.width = "480px";
    modal.style.maxWidth = "90vw";
    modal.style.height = "420px";
    modal.style.boxSizing = "border-box";
    modal.style.color = "#f1c40f";
    modal.style.fontFamily = "sans-serif";
    modal.onclick = (e) => e.stopPropagation();

    const titleRow = document.createElement("div");
    titleRow.style.display = "flex";
    titleRow.style.justifyContent = "space-between";
    titleRow.style.alignItems = "center";

    const title = document.createElement("h3");
    title.innerText = "Select Directory";
    title.style.margin = "0";
    title.style.color = "#f1c40f";
    title.style.fontSize = "15px";

    const drivesBtn = document.createElement("button");
    drivesBtn.innerText = "🖥️ Drives";
    drivesBtn.style.background = "#2a1b3d";
    drivesBtn.style.color = "#f1c40f";
    drivesBtn.style.border = "1px solid #9b59b6";
    drivesBtn.style.padding = "3px 8px";
    drivesBtn.style.borderRadius = "4px";
    drivesBtn.style.cursor = "pointer";
    drivesBtn.style.fontSize = "11px";
    drivesBtn.style.fontWeight = "bold";

    titleRow.appendChild(title);
    titleRow.appendChild(drivesBtn);

    const pathDisplay = document.createElement("input");
    pathDisplay.type = "text";
    pathDisplay.style.width = "100%";
    pathDisplay.style.padding = "6px";
    pathDisplay.style.boxSizing = "border-box";
    pathDisplay.style.background = "#0f0718";
    pathDisplay.style.border = "1px solid #9b59b6";
    pathDisplay.style.color = "#fff";
    pathDisplay.style.borderRadius = "4px";
    pathDisplay.style.fontSize = "11px";

    const listContainer = document.createElement("div");
    listContainer.style.flex = "1";
    listContainer.style.background = "#0f0718";
    listContainer.style.border = "1px solid #9b59b6";
    listContainer.style.borderRadius = "4px";
    listContainer.style.overflowY = "auto";
    listContainer.style.padding = "4px";
    listContainer.style.display = "flex";
    listContainer.style.flexDirection = "column";
    listContainer.style.gap = "2px";

    const btnRow = document.createElement("div");
    btnRow.style.display = "flex";
    btnRow.style.justifyContent = "flex-end";
    btnRow.style.gap = "8px";
    btnRow.style.marginTop = "4px";

    const cancelBtn = document.createElement("button");
    cancelBtn.innerText = "Cancel";
    cancelBtn.style.background = "#2a1b3d";
    cancelBtn.style.color = "#fff";
    cancelBtn.style.border = "1px solid #9b59b6";
    cancelBtn.style.padding = "6px 12px";
    cancelBtn.style.borderRadius = "4px";
    cancelBtn.style.cursor = "pointer";

    const selectBtn = document.createElement("button");
    selectBtn.innerText = "Select This Folder";
    selectBtn.style.background = "#2ecc71";
    selectBtn.style.color = "#150b22";
    selectBtn.style.border = "none";
    selectBtn.style.padding = "6px 14px";
    selectBtn.style.borderRadius = "4px";
    selectBtn.style.cursor = "pointer";
    selectBtn.style.fontWeight = "bold";

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(selectBtn);

    modal.appendChild(titleRow);
    modal.appendChild(pathDisplay);
    modal.appendChild(listContainer);
    modal.appendChild(btnRow);
    overlay.appendChild(modal);

    const closeModal = () => {
        if (document.body.contains(overlay)) {
            document.body.removeChild(overlay);
        }
    };

    cancelBtn.onclick = closeModal;
    overlay.onclick = closeModal;
    drivesBtn.onclick = () => loadFolder("DRIVES");

    async function loadFolder(targetPath) {
        try {
            listContainer.innerHTML = "<div style='padding: 10px; color: #9b59b6; text-align: center;'>Loading folders...</div>";
            const endpoint = targetPath === "DRIVES" ? "/rsl/utils/list_directory?dir=DRIVES" : `/rsl/utils/list_directory?dir=${encodeURIComponent(targetPath)}`;
            const res = await api.fetchApi(endpoint);
            const data = await res.json();
            
            if (data.error) {
                listContainer.innerHTML = `<div style='padding: 10px; color: #e74c3c;'>Error: ${data.error}</div>`;
                return;
            }

            currentPath = data.current;
            pathDisplay.value = currentPath;
            listContainer.innerHTML = "";

            if (data.parent) {
                const parentItem = document.createElement("div");
                parentItem.innerHTML = "📁 <b>.. (Parent Directory)</b>";
                parentItem.style.padding = "6px 8px";
                parentItem.style.cursor = "pointer";
                parentItem.style.borderRadius = "3px";
                parentItem.style.color = "#f1c40f";
                parentItem.onclick = () => loadFolder(data.parent);
                listContainer.appendChild(parentItem);
            }

            data.subdirs.forEach(sub => {
                const item = document.createElement("div");
                item.innerText = targetPath === "DRIVES" ? `💽 ${sub.name}` : `📁 ${sub.name}`;
                item.style.padding = "6px 8px";
                item.style.cursor = "pointer";
                item.style.borderRadius = "3px";
                item.style.color = "#fff";
                item.onmouseover = () => item.style.background = "#2a1b3d";
                item.onmouseout = () => item.style.background = "transparent";
                item.onclick = () => loadFolder(sub.path);
                listContainer.appendChild(item);
            });
        } catch (err) {
            console.error(err);
            listContainer.innerHTML = "<div style='padding: 10px; color: #e74c3c;'>Failed to load directory list.</div>";
        }
    }

    selectBtn.onclick = () => {
        const finalPath = pathDisplay.value.trim();
        closeModal();
        if (onSelectCallback) {
            onSelectCallback(finalPath);
        }
    };

    document.body.appendChild(overlay);
    loadFolder(currentPath);
}