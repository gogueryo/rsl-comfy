import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { openFolderPickerModal } from "./rsl_ui_utils.js";

app.registerExtension({
    name: "RSL.LoraDescriptionEditor",
    async nodeCreated(node) {
        if (node.comfyClass !== "LoraDescriptionEditor") return;

        node.color = "#2a1b3d";
        node.bgcolor = "#150b22";

        node.minSize = [520, 760];
        if (!node.size || node.size[0] < 520 || node.size[1] < 760) {
            node.setSize([520, 760]);
        }

        if (node.widgets) {
            const existingDomWidget = node.widgets.find(w => w.name === "editor");
            if (existingDomWidget && existingDomWidget.element) {
                existingDomWidget.element.remove();
                node.widgets = node.widgets.filter(w => w.name !== "editor");
            }
        }

        // Master container with standard 6px uniform padding
        const container = document.createElement("div");
        container.tabIndex = 0;
        container.style.width = "100%";
        // FIX: Use explicit pixel height on creation so it never collapses to 0px on new nodes
        container.style.height = `${(node.size ? node.size[1] : 760) - 60}px`;
        container.style.position = "relative";
        container.style.display = "flex";
        container.style.flexDirection = "column";
        container.style.boxSizing = "border-box";
        container.style.gap = "6px";
        container.style.padding = "6px";
        container.style.background = "#150b22";
        container.style.color = "#f1c40f";
        container.style.fontFamily = "sans-serif";
        container.style.fontSize = "12px";
        container.style.overflow = "hidden";
        container.style.outline = "none";
        container.style.borderRadius = "6px";


        function createRow(gap = "6px") {
            const row = document.createElement("div");
            row.style.display = "flex";
            row.style.gap = gap;
            row.style.width = "100%";
            row.style.boxSizing = "border-box";
            row.style.flexShrink = "0";
            row.style.alignItems = "center";
            return row;
        }

        const topRow = createRow();
        const dirInput = document.createElement("input");
        dirInput.type = "text";
        dirInput.placeholder = "Enter dataset directory path...";
        dirInput.style.flex = "1";
        dirInput.style.padding = "6px";
        dirInput.style.boxSizing = "border-box";
        dirInput.style.background = "#0f0718";
        dirInput.style.border = "1px solid #9b59b6";
        dirInput.style.color = "#fff";
        dirInput.style.borderRadius = "4px";

        const pathWidget = node.widgets?.find(w => w.name === "dataset_path" || w.name === "directory_path") || node.widgets?.[0];
        const savedDir = localStorage.getItem("RSL_LoraDescriptionEditor_lastDir");

        if (pathWidget && pathWidget.value) {
            dirInput.value = pathWidget.value;
        } else if (savedDir) {
            dirInput.value = savedDir;
            if (pathWidget) pathWidget.value = savedDir;
        }

        function syncPathToWidget() {
            if (pathWidget) {
                pathWidget.value = dirInput.value;
                if (pathWidget.callback) {
                    pathWidget.callback(pathWidget.value);
                }
            }
        }

        dirInput.oninput = () => {
            syncPathToWidget();
        };

        const browseBtn = document.createElement("button");
        browseBtn.innerText = "📁 Browse";
        browseBtn.style.background = "#9b59b6";
        browseBtn.style.color = "#fff";
        browseBtn.style.border = "none";
        browseBtn.style.padding = "6px 10px";
        browseBtn.style.borderRadius = "4px";
        browseBtn.style.cursor = "pointer";
        browseBtn.style.fontWeight = "bold";
        browseBtn.style.flexShrink = "0";

        const loadBtn = document.createElement("button");
        loadBtn.innerText = "Load Directory";
        loadBtn.style.background = "#e67e22";
        loadBtn.style.color = "#fff";
        loadBtn.style.border = "none";
        loadBtn.style.padding = "6px 12px";
        loadBtn.style.borderRadius = "4px";
        loadBtn.style.cursor = "pointer";
        loadBtn.style.fontWeight = "bold";
        loadBtn.style.flexShrink = "0";

        topRow.appendChild(dirInput);
        topRow.appendChild(browseBtn);
        topRow.appendChild(loadBtn);
        container.appendChild(topRow);

        browseBtn.onclick = () => {
            openFolderPickerModal(dirInput.value.trim(), (selectedPath) => {
                dirInput.value = selectedPath;
                syncPathToWidget();
                loadBtn.click();
            });
        };

        const toolbarRow = createRow();
        toolbarRow.style.justifyContent = "space-between";

        const countDisplay = document.createElement("span");
        countDisplay.innerText = "Training: 0 / 0 images";
        countDisplay.style.color = "#2ecc71";
        countDisplay.style.fontWeight = "bold";
        countDisplay.style.fontSize = "11px";

        const selectAllGroup = document.createElement("div");
        selectAllGroup.style.display = "flex";
        selectAllGroup.style.gap = "4px";
        selectAllGroup.style.alignItems = "center";

        const selectAllBtn = document.createElement("button");
        selectAllBtn.innerText = "Select All";
        selectAllBtn.style.background = "#2a1b3d";
        selectAllBtn.style.color = "#f1c40f";
        selectAllBtn.style.border = "1px solid #9b59b6";
        selectAllBtn.style.padding = "2px 6px";
        selectAllBtn.style.borderRadius = "3px";
        selectAllBtn.style.cursor = "pointer";
        selectAllBtn.style.fontSize = "10px";

        const deselectAllBtn = document.createElement("button");
        deselectAllBtn.innerText = "Deselect All";
        deselectAllBtn.style.background = "#2a1b3d";
        deselectAllBtn.style.color = "#f1c40f";
        deselectAllBtn.style.border = "1px solid #9b59b6";
        deselectAllBtn.style.padding = "2px 6px";
        deselectAllBtn.style.borderRadius = "3px";
        deselectAllBtn.style.cursor = "pointer";
        deselectAllBtn.style.fontSize = "10px";

        const filterSelectedLabel = document.createElement("label");
        filterSelectedLabel.style.display = "flex";
        filterSelectedLabel.style.alignItems = "center";
        filterSelectedLabel.style.gap = "3px";
        filterSelectedLabel.style.fontSize = "10px";
        filterSelectedLabel.style.color = "#f1c40f";
        filterSelectedLabel.style.cursor = "pointer";
        filterSelectedLabel.style.marginLeft = "4px";

        const filterSelectedCheckbox = document.createElement("input");
        filterSelectedCheckbox.type = "checkbox";
        filterSelectedCheckbox.style.cursor = "pointer";

        filterSelectedLabel.appendChild(filterSelectedCheckbox);
        filterSelectedLabel.appendChild(document.createTextNode("Selected Only"));

        selectAllGroup.appendChild(selectAllBtn);
        selectAllGroup.appendChild(deselectAllBtn);
        selectAllGroup.appendChild(filterSelectedLabel);

        const navZoomGroup = document.createElement("div");
        navZoomGroup.style.display = "flex";
        navZoomGroup.style.gap = "8px";
        navZoomGroup.style.alignItems = "center";

        const navGroup = document.createElement("div");
        navGroup.style.display = "flex";
        navGroup.style.gap = "4px";

        const prevBtn = document.createElement("button");
        prevBtn.innerText = "◀ Prev";
        prevBtn.style.background = "#2a1b3d";
        prevBtn.style.color = "#f1c40f";
        prevBtn.style.border = "1px solid #9b59b6";
        prevBtn.style.padding = "2px 6px";
        prevBtn.style.borderRadius = "3px";
        prevBtn.style.cursor = "pointer";

        const nextBtn = document.createElement("button");
        nextBtn.innerText = "Next ▶";
        nextBtn.style.background = "#2a1b3d";
        nextBtn.style.color = "#f1c40f";
        nextBtn.style.border = "1px solid #9b59b6";
        nextBtn.style.padding = "2px 6px";
        nextBtn.style.borderRadius = "3px";
        nextBtn.style.cursor = "pointer";

        navGroup.appendChild(prevBtn);
        navGroup.appendChild(nextBtn);

        const zoomBtnsGroup = document.createElement("div");
        zoomBtnsGroup.style.display = "flex";
        zoomBtnsGroup.style.gap = "3px";
        zoomBtnsGroup.style.alignItems = "center";

        const zoomOutBtn = document.createElement("button");
        zoomOutBtn.innerText = "-";
        zoomOutBtn.style.background = "#2a1b3d";
        zoomOutBtn.style.color = "#f1c40f";
        zoomOutBtn.style.border = "1px solid #9b59b6";
        zoomOutBtn.style.padding = "2px 6px";
        zoomOutBtn.style.borderRadius = "3px";
        zoomOutBtn.style.cursor = "pointer";

        const zoomResetBtn = document.createElement("button");
        zoomResetBtn.innerText = "Def";
        zoomResetBtn.style.background = "#2a1b3d";
        zoomResetBtn.style.color = "#f1c40f";
        zoomResetBtn.style.border = "1px solid #9b59b6";
        zoomResetBtn.style.padding = "2px 5px";
        zoomResetBtn.style.borderRadius = "3px";
        zoomResetBtn.style.cursor = "pointer";

        const zoomInBtn = document.createElement("button");
        zoomInBtn.innerText = "+";
        zoomInBtn.style.background = "#2a1b3d";
        zoomInBtn.style.color = "#f1c40f";
        zoomInBtn.style.border = "1px solid #9b59b6";
        zoomInBtn.style.padding = "2px 6px";
        zoomInBtn.style.borderRadius = "3px";
        zoomInBtn.style.cursor = "pointer";

        zoomBtnsGroup.appendChild(zoomOutBtn);
        zoomBtnsGroup.appendChild(zoomResetBtn);
        zoomBtnsGroup.appendChild(zoomInBtn);

        navZoomGroup.appendChild(navGroup);
        navZoomGroup.appendChild(zoomBtnsGroup);

        toolbarRow.appendChild(countDisplay);
        toolbarRow.appendChild(selectAllGroup);
        toolbarRow.appendChild(navZoomGroup);
        container.appendChild(toolbarRow);

        const thumbContainer = document.createElement("div");
        thumbContainer.style.display = "flex";
        thumbContainer.style.alignItems = "center";
        thumbContainer.style.gap = "6px";
        thumbContainer.style.overflowX = "auto";
        thumbContainer.style.overflowY = "hidden";
        thumbContainer.style.padding = "6px";
        thumbContainer.style.background = "#12081d";
        thumbContainer.style.border = "1px solid #9b59b6";
        thumbContainer.style.borderRadius = "4px";
        thumbContainer.style.height = "90px";
        thumbContainer.style.minHeight = "90px";
        thumbContainer.style.maxHeight = "90px";
        thumbContainer.style.width = "100%";
        thumbContainer.style.boxSizing = "border-box";
        thumbContainer.style.flexShrink = "0";

        container.appendChild(thumbContainer);

        const prependRow = createRow();
        const allLabel = document.createElement("label");
        allLabel.style.display = "flex";
        allLabel.style.alignItems = "center";
        allLabel.style.gap = "4px";
        allLabel.style.fontSize = "11px";
        allLabel.style.color = "#f1c40f";
        allLabel.style.cursor = "pointer";
        allLabel.style.flexShrink = "0";

        const allCheckbox = document.createElement("input");
        allCheckbox.type = "checkbox";
        allCheckbox.style.cursor = "pointer";

        allLabel.appendChild(allCheckbox);
        allLabel.appendChild(document.createTextNode("All"));

        const prependInput = document.createElement("input");
        prependInput.type = "text";
        prependInput.placeholder = "String to prepend...";
        prependInput.style.flex = "1";
        prependInput.style.padding = "6px";
        prependInput.style.boxSizing = "border-box";
        prependInput.style.background = "#0f0718";
        prependInput.style.border = "1px solid #9b59b6";
        prependInput.style.color = "#fff";
        prependInput.style.borderRadius = "4px";

        const prependBtn = document.createElement("button");
        prependBtn.innerText = "Prepend";
        prependBtn.style.background = "#9b59b6";
        prependBtn.style.color = "#fff";
        prependBtn.style.border = "none";
        prependBtn.style.padding = "6px 12px";
        prependBtn.style.borderRadius = "4px";
        prependBtn.style.cursor = "pointer";
        prependBtn.style.fontWeight = "bold";
        prependBtn.style.flexShrink = "0";

        prependRow.appendChild(allLabel);
        prependRow.appendChild(prependInput);
        prependRow.appendChild(prependBtn);
        container.appendChild(prependRow);

        const appendRow = createRow();
        const appendSpacer = document.createElement("div");
        appendSpacer.style.width = "32px";
        appendSpacer.style.flexShrink = "0";

        const appendInput = document.createElement("input");
        appendInput.type = "text";
        appendInput.placeholder = "String to append (suffix)...";
        appendInput.style.flex = "1";
        appendInput.style.padding = "6px";
        appendInput.style.boxSizing = "border-box";
        appendInput.style.background = "#0f0718";
        appendInput.style.border = "1px solid #9b59b6";
        appendInput.style.color = "#fff";
        appendInput.style.borderRadius = "4px";

        const appendBtn = document.createElement("button");
        appendBtn.innerText = "Append";
        appendBtn.style.background = "#9b59b6";
        appendBtn.style.color = "#fff";
        appendBtn.style.border = "none";
        appendBtn.style.padding = "6px 12px";
        appendBtn.style.borderRadius = "4px";
        appendBtn.style.cursor = "pointer";
        appendBtn.style.fontWeight = "bold";
        appendBtn.style.flexShrink = "0";

        appendRow.appendChild(appendSpacer);
        appendRow.appendChild(appendInput);
        appendRow.appendChild(appendBtn);
        container.appendChild(appendRow);

        const replaceRow = createRow();
        const findInput = document.createElement("input");
        findInput.type = "text";
        findInput.placeholder = "Find text...";
        findInput.style.flex = "1";
        findInput.style.padding = "6px";
        findInput.style.boxSizing = "border-box";
        findInput.style.background = "#0f0718";
        findInput.style.border = "1px solid #9b59b6";
        findInput.style.color = "#fff";
        findInput.style.borderRadius = "4px";

        const replaceInput = document.createElement("input");
        replaceInput.type = "text";
        replaceInput.placeholder = "Replace with...";
        replaceInput.style.flex = "1";
        replaceInput.style.padding = "6px";
        replaceInput.style.boxSizing = "border-box";
        replaceInput.style.background = "#0f0718";
        replaceInput.style.border = "1px solid #9b59b6";
        replaceInput.style.color = "#fff";
        replaceInput.style.borderRadius = "4px";

        const replaceBtn = document.createElement("button");
        replaceBtn.innerText = "Replace";
        replaceBtn.style.background = "#9b59b6";
        replaceBtn.style.color = "#fff";
        replaceBtn.style.border = "none";
        replaceBtn.style.padding = "6px 10px";
        replaceBtn.style.borderRadius = "4px";
        replaceBtn.style.cursor = "pointer";
        replaceBtn.style.fontWeight = "bold";
        replaceBtn.style.flexShrink = "0";

        replaceRow.appendChild(findInput);
        replaceRow.appendChild(replaceInput);
        replaceRow.appendChild(replaceBtn);
        container.appendChild(replaceRow);

        const presetRow = createRow("4px");
        presetRow.style.overflowX = "auto";
        presetRow.style.overflowY = "hidden";

        const presetLabel = document.createElement("span");
        presetLabel.innerText = "Presets:";
        presetLabel.style.fontSize = "10px";
        presetLabel.style.color = "#9b59b6";
        presetLabel.style.flexShrink = "0";
        presetRow.appendChild(presetLabel);

        const presetTags = ["masterpiece", "best quality", "ultra detailed", "photorealistic", "85mm lens", "soft lighting"];
        presetTags.forEach(tag => {
            const tagBtn = document.createElement("button");
            tagBtn.innerText = tag;
            tagBtn.style.background = "#2a1b3d";
            tagBtn.style.color = "#f1c40f";
            tagBtn.style.border = "1px solid #9b59b6";
            tagBtn.style.borderRadius = "10px";
            tagBtn.style.padding = "2px 8px";
            tagBtn.style.fontSize = "10px";
            tagBtn.style.cursor = "pointer";
            tagBtn.style.whiteSpace = "nowrap";
            tagBtn.style.flexShrink = "0";

            tagBtn.onclick = () => {
                if (selectedIndex === null || !currentDataset[selectedIndex]) {
                    setStatus("Please select an image thumbnail first.", true);
                    return;
                }
                const item = currentDataset[selectedIndex];
                const currentVal = textArea.value.trim();
                const newVal = currentVal ? (currentVal.endsWith(",") ? `${currentVal} ${tag}` : `${currentVal}, ${tag}`) : tag;
                textArea.value = newVal;
                item.caption = newVal;
                item.state = "modified";
                renderThumbnails();
                updateCounters(newVal);
                setStatus(`Inserted preset: "${tag}"`);
            };

            presetRow.appendChild(tagBtn);
        });
        container.appendChild(presetRow);

        const textArea = document.createElement("textarea");
        textArea.placeholder = "Select an image thumbnail above to edit its text description... (Ctrl+S to save, Left/Right arrows to navigate)";
        textArea.style.width = "100%";
        textArea.style.boxSizing = "border-box";
        textArea.style.flex = "1";
        textArea.style.minHeight = "40px";
        textArea.style.background = "#0f0718";
        textArea.style.border = "1px solid #9b59b6";
        textArea.style.color = "#f1c40f";
        textArea.style.padding = "6px";
        textArea.style.borderRadius = "4px";
        textArea.style.resize = "none";

        container.appendChild(textArea);

        const counterBar = document.createElement("div");
        counterBar.style.display = "flex";
        counterBar.style.justifyContent = "space-between";
        counterBar.style.alignItems = "center";
        counterBar.style.width = "100%";
        counterBar.style.boxSizing = "border-box";
        counterBar.style.flexShrink = "0";
        counterBar.style.paddingRight = "4px";

        const counterText = document.createElement("div");
        counterText.style.fontSize = "10px";
        counterText.style.color = "#9b59b6";
        counterText.innerText = "Chars: 0 | Words: 0 | Est. Tokens: ~0";

        const rotateGroup = document.createElement("div");
        rotateGroup.style.display = "flex";
        rotateGroup.style.gap = "4px";

        const rotateLeftBtn = document.createElement("button");
        rotateLeftBtn.innerText = "↶ Rotate Left";
        rotateLeftBtn.title = "Rotate Left (Shift+Left Arrow)";
        rotateLeftBtn.style.background = "#2a1b3d";
        rotateLeftBtn.style.color = "#f1c40f";
        rotateLeftBtn.style.border = "1px solid #9b59b6";
        rotateLeftBtn.style.padding = "2px 8px";
        rotateLeftBtn.style.borderRadius = "3px";
        rotateLeftBtn.style.cursor = "pointer";
        rotateLeftBtn.style.fontSize = "10px";

        const rotateRightBtn = document.createElement("button");
        rotateRightBtn.innerText = "Rotate Right ↷";
        rotateRightBtn.title = "Rotate Right (Shift+Right Arrow)";
        rotateRightBtn.style.background = "#2a1b3d";
        rotateRightBtn.style.color = "#f1c40f";
        rotateRightBtn.style.border = "1px solid #9b59b6";
        rotateRightBtn.style.padding = "2px 8px";
        rotateRightBtn.style.borderRadius = "3px";
        rotateRightBtn.style.cursor = "pointer";
        rotateRightBtn.style.fontSize = "10px";

        rotateGroup.appendChild(rotateLeftBtn);
        rotateGroup.appendChild(rotateRightBtn);

        counterBar.appendChild(counterText);
        counterBar.appendChild(rotateGroup);
        container.appendChild(counterBar);

        function updateCounters(text) {
            const chars = text.length;
            const words = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
            const estTokens = Math.round(chars / 4);
            counterText.innerText = `Chars: ${chars} | Words: ${words} | Est. Tokens: ~${estTokens}`;
        }

        const bottomRow = createRow();
        bottomRow.style.justifyContent = "space-between";

        const deleteBtn = document.createElement("button");
        deleteBtn.innerText = "Delete Item";
        deleteBtn.style.background = "#c0392b";
        deleteBtn.style.color = "#ffffff";
        deleteBtn.style.border = "none";
        deleteBtn.style.padding = "6px 12px";
        deleteBtn.style.borderRadius = "4px";
        deleteBtn.style.cursor = "pointer";
        deleteBtn.style.fontWeight = "bold";
        deleteBtn.style.flexShrink = "0";

        const rightBtnsGroup = document.createElement("div");
        rightBtnsGroup.style.display = "flex";
        rightBtnsGroup.style.gap = "6px";
        rightBtnsGroup.style.flexShrink = "0";

        const exportBtn = document.createElement("button");
        exportBtn.innerText = "Export & Resize Selected";
        exportBtn.style.background = "#d4a373";
        exportBtn.style.color = "#150b22";
        exportBtn.style.border = "none";
        exportBtn.style.padding = "6px 10px";
        exportBtn.style.borderRadius = "4px";
        exportBtn.style.cursor = "pointer";
        exportBtn.style.fontWeight = "bold";

        const saveAllBtn = document.createElement("button");
        saveAllBtn.innerText = "Save All Modified";
        saveAllBtn.style.background = "#2ecc71";
        saveAllBtn.style.color = "#150b22";
        saveAllBtn.style.border = "none";
        saveAllBtn.style.padding = "6px 12px";
        saveAllBtn.style.borderRadius = "4px";
        saveAllBtn.style.cursor = "pointer";
        saveAllBtn.style.fontWeight = "bold";

        const updateBtn = document.createElement("button");
        updateBtn.innerText = "Update (Save)";
        updateBtn.style.background = "#f1c40f";
        updateBtn.style.color = "#150b22";
        updateBtn.style.border = "none";
        updateBtn.style.padding = "6px 14px";
        updateBtn.style.borderRadius = "4px";
        updateBtn.style.cursor = "pointer";
        updateBtn.style.fontWeight = "bold";

        rightBtnsGroup.appendChild(exportBtn);
        rightBtnsGroup.appendChild(saveAllBtn);
        rightBtnsGroup.appendChild(updateBtn);
        bottomRow.appendChild(deleteBtn);
        bottomRow.appendChild(rightBtnsGroup);
        container.appendChild(bottomRow);

        const statusBar = document.createElement("div");
        statusBar.style.padding = "6px 8px";
        statusBar.style.background = "#221336";
        statusBar.style.border = "1px solid #9b59b6";
        statusBar.style.borderLeft = "4px solid #f1c40f";
        statusBar.style.borderRadius = "4px";
        statusBar.style.fontSize = "11px";
        statusBar.style.color = "#ffffff";
        statusBar.style.width = "100%";
        statusBar.style.boxSizing = "border-box";
        statusBar.style.flexShrink = "0";
        statusBar.innerText = "Ready. Click 'Browse' or enter directory path to load dataset.";
        container.appendChild(statusBar);

        // Mount DOM widget with a stable computeSize to prevent compounding growth loops
        const domWidget = node.addDOMWidget("lora_editor", "editor", container);

        domWidget.computeSize = function (width) {
            return [width, 760];
        };

        node.onResize = function (size) {
            node.size[0] = Math.max(520, size[0]);
            node.size[1] = Math.max(760, size[1]);
            container.style.height = `${node.size[1] - 60}px`;
        };

        // --- NATIVE RESIZE-OBSERVER LOAD GATE (Zero Timers / Zero Frame Loops) ---
        let initialized = false;
        const loadObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                // Only trigger once the browser has actually computed non-zero layout dimensions
                if (entry.contentRect.height > 0 && !initialized) {
                    initialized = true;
                    loadObserver.disconnect(); // Clean up observer immediately

                    // Set explicit container height based on node size
                    container.style.height = `${(node.size ? node.size[1] : 760) - 60}px`;

                    // Keep container synced if the user manually resizes the node later
                    const activeObserver = new ResizeObserver(activeEntries => {
                        for (let activeEntry of activeEntries) {
                            if (activeEntry.contentRect.height > 0) {
                                container.style.height = `${Math.max(760, activeEntry.contentRect.height - 10)}px`;
                            }
                        }
                    });
                    if (domWidget.element && domWidget.element.parentElement) {
                        activeObserver.observe(domWidget.element.parentElement);
                    }

                    if (node.setDirtyCanvas) {
                        node.setDirtyCanvas(true, true);
                    }

                    if (dirInput.value.trim()) {
                        loadBtn.click();
                    }
                }
            }
        });

        // Observe container directly for native rendering readiness
        loadObserver.observe(container);

        let datasetLookup = {}; // Dictionary map for on-demand lookup
        let currentDataset = [];
        let selectedIndex = null;
        let thumbHeight = 70;

        function setStatus(text, isError = false, isSuccess = false) {
            statusBar.innerText = text;
            if (isError) {
                statusBar.style.borderLeftColor = "#e74c3c";
                statusBar.style.color = "#ff8080";
            } else if (isSuccess) {
                statusBar.style.borderLeftColor = "#2ecc71";
                statusBar.style.color = "#2ecc71";
            } else {
                statusBar.style.borderLeftColor = "#f1c40f";
                statusBar.style.color = "#ffffff";
            }
        }

        async function handleRotate(direction) {
            if (selectedIndex === null || !currentDataset[selectedIndex]) {
                setStatus("Please select an image thumbnail first.", true);
                return;
            }
            const item = currentDataset[selectedIndex];
            try {
                setStatus(`Rotating ${item.filename} ${direction}...`);
                const res = await api.fetchApi("/rsl/utils/rotate_image", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ path: item.image_path, direction: direction })
                });
                const result = await res.json();
                if (result.success) {
                    item.state = "modified";
                    renderThumbnails();
                    setStatus(`Successfully rotated ${item.filename}!`, false, true);
                } else {
                    setStatus("Rotation failed: " + (result.error || "Unknown error"), true);
                }
            } catch (err) {
                console.error(err);
                setStatus("Error executing rotation request.", true);
            }
        }

        rotateLeftBtn.onclick = () => handleRotate("left");
        rotateRightBtn.onclick = () => handleRotate("right");

        exportBtn.onclick = async () => {
            if (currentDataset.length === 0) {
                setStatus("No dataset loaded to export.", true);
                return;
            }

            const dir = dirInput.value.trim();
            if (!dir) {
                setStatus("Please load a valid dataset directory first.", true);
                return;
            }

            const selectedItems = currentDataset.filter(item => item.enabled !== false);
            if (selectedItems.length === 0) {
                setStatus("No images selected/enabled for export.", true);
                return;
            }

            const maxResWidget = node.widgets?.find(w => w.name === "max_resolution");
            const maxResolution = maxResWidget ? parseInt(maxResWidget.value, 10) : 1024;

            if (isNaN(maxResolution) || maxResolution < 256) {
                setStatus("Invalid max resolution value (minimum is 256).", true);
                return;
            }

            try {
                setStatus(`Exporting and resizing ${selectedItems.length} selected images to max ${maxResolution}px...`);
                const res = await api.fetchApi("/rsl/utils/export_dataset", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        dir: dir,
                        max_resolution: maxResolution,
                        image_paths: selectedItems.map(item => item.image_path)
                    })
                });
                const result = await res.json();
                if (result.success) {
                    setStatus(`Successfully exported ${result.count} selected images to: ${result.export_dir}`, false, true);
                } else {
                    setStatus("Export failed: " + (result.error || "Unknown error"), true);
                }
            } catch (err) {
                console.error(err);
                setStatus("Error executing export request.", true);
            }
        };

        function updateTrainingCountDisplay() {
            const total = currentDataset.length;
            const enabledCount = currentDataset.filter(item => item.enabled !== false).length;
            countDisplay.innerText = `Training: ${enabledCount} / ${total} images`;
        }

        async function saveSelectionStatus(item) {
            const dir = dirInput.value.trim();
            if (!dir) return;
            try {
                await api.fetchApi("/rsl/utils/update_selection", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        dir: dir,
                        filename: item.filename,
                        enabled: item.enabled !== false
                    })
                });
            } catch (err) {
                console.error("[RSL] Failed to update selection status:", err);
            }
        }

        async function saveAllSelectionsBulk(enabledState) {
            const dir = dirInput.value.trim();
            if (!dir || currentDataset.length === 0) return;

            const selections = {};
            currentDataset.forEach(item => {
                item.enabled = enabledState;
                selections[item.filename] = enabledState;
            });

            updateTrainingCountDisplay();
            renderThumbnails();
            setStatus(enabledState ? "All images selected for training & export." : "All images deselected.", false, true);

            try {
                await api.fetchApi("/rsl/utils/update_all_selections", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ dir: dir, selections: selections })
                });
            } catch (err) {
                console.error("[RSL] Bulk selection save failed:", err);
            }
        }

        selectAllBtn.onclick = () => saveAllSelectionsBulk(true);
        deselectAllBtn.onclick = () => saveAllSelectionsBulk(false);

        filterSelectedCheckbox.onchange = () => {
            renderThumbnails();
            setStatus(filterSelectedCheckbox.checked ? "Showing selected items only." : "Showing all dataset items.");
        };

        function selectThumbnail(index) {
            if (index < 0 || index >= currentDataset.length) return;
            selectedIndex = index;
            const text = currentDataset[selectedIndex].caption;
            textArea.value = text;
            updateCounters(text);
            renderThumbnails();
            setStatus(`Selected: ${currentDataset[selectedIndex].filename} (${currentDataset[selectedIndex].state})`);

            const thumbEl = thumbContainer.querySelector(`[data-index='${index}']`);
            if (thumbEl) {
                thumbEl.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
            }
        }

        function openDeleteConfirmModal(item) {
            const overlay = document.createElement("div");
            overlay.tabIndex = 0;
            overlay.style.position = "fixed";
            overlay.style.top = "0";
            overlay.style.left = "0";
            overlay.style.width = "100vw";
            overlay.style.height = "100vh";
            overlay.style.background = "rgba(10, 5, 18, 0.92)";
            overlay.style.display = "flex";
            overlay.style.flexDirection = "column";
            overlay.style.justifyContent = "center";
            overlay.style.alignItems = "center";
            overlay.style.zIndex = "999999";
            overlay.style.padding = "20px";
            overlay.style.boxSizing = "border-box";
            overlay.style.outline = "none";

            const modal = document.createElement("div");
            modal.style.background = "#1b1128";
            modal.style.border = "2px solid #e74c3c";
            modal.style.borderRadius = "8px";
            modal.style.padding = "20px";
            modal.style.display = "flex";
            modal.style.flexDirection = "column";
            modal.style.gap = "14px";
            modal.style.maxWidth = "420px";
            modal.style.width = "100%";
            modal.style.boxSizing = "border-box";
            modal.style.color = "#f1c40f";
            modal.style.fontFamily = "sans-serif";
            modal.onclick = (e) => e.stopPropagation();

            const title = document.createElement("h3");
            title.innerText = "Delete Item Confirmation";
            title.style.margin = "0";
            title.style.color = "#e74c3c";
            title.style.fontSize = "15px";

            const desc = document.createElement("p");
            desc.innerHTML = `Are you sure you want to permanently delete <b>${item.filename}</b> and its matching <code>.txt</code> file? This action cannot be undone.`;
            desc.style.margin = "0";
            desc.style.fontSize = "12px";
            desc.style.color = "#fff";
            desc.style.lineHeight = "1.4";

            const btnRow = document.createElement("div");
            btnRow.style.display = "flex";
            btnRow.style.justifyContent = "flex-end";
            btnRow.style.gap = "8px";
            btnRow.style.marginTop = "6px";

            const cancelBtn = document.createElement("button");
            cancelBtn.innerText = "Cancel";
            cancelBtn.style.background = "#2a1b3d";
            cancelBtn.style.color = "#fff";
            cancelBtn.style.border = "1px solid #9b59b6";
            cancelBtn.style.padding = "6px 12px";
            cancelBtn.style.borderRadius = "4px";
            cancelBtn.style.cursor = "pointer";

            const confirmBtn = document.createElement("button");
            confirmBtn.innerText = "Delete Permanently";
            confirmBtn.style.background = "#e74c3c";
            confirmBtn.style.color = "#fff";
            confirmBtn.style.border = "none";
            confirmBtn.style.padding = "6px 12px";
            confirmBtn.style.borderRadius = "4px";
            confirmBtn.style.cursor = "pointer";
            confirmBtn.style.fontWeight = "bold";

            const closeModals = () => {
                if (document.body.contains(overlay)) {
                    document.body.removeChild(overlay);
                }
                window.removeEventListener("keydown", modalEsc);
                container.focus();
            };

            const modalEsc = (e) => {
                if (e.key === "Escape") closeModals();
            };

            cancelBtn.onclick = closeModals;
            overlay.onclick = closeModals;

            confirmBtn.onclick = async () => {
                closeModals();
                await executeDeleteItem(item);
            };

            btnRow.appendChild(cancelBtn);
            btnRow.appendChild(confirmBtn);
            modal.appendChild(title);
            modal.appendChild(desc);
            modal.appendChild(btnRow);
            overlay.appendChild(modal);

            window.addEventListener("keydown", modalEsc);
            document.body.appendChild(overlay);
            setTimeout(() => confirmBtn.focus(), 50);
        }

        async function executeDeleteItem(item) {
            const dir = dirInput.value.trim();
            if (!dir) return;

            try {
                setStatus(`Deleting ${item.filename}...`);
                const res = await api.fetchApi("/rsl/utils/delete_item", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        dir: dir,
                        filename: item.filename
                    })
                });
                const result = await res.json();
                if (result.success) {
                    const deletedIndex = selectedIndex;
                    currentDataset = currentDataset.filter(d => d.filename !== item.filename);
                    delete datasetLookup[item.filename];

                    if (currentDataset.length === 0) {
                        selectedIndex = null;
                        textArea.value = "";
                        updateCounters("");
                    } else if (deletedIndex >= currentDataset.length) {
                        selectThumbnail(currentDataset.length - 1);
                    } else {
                        selectThumbnail(deletedIndex);
                    }

                    renderThumbnails();
                    updateTrainingCountDisplay();
                    setStatus(`Successfully deleted ${item.filename}!`, false, true);
                } else {
                    setStatus("Error deleting item: " + (result.error || "Unknown error"), true);
                }
            } catch (err) {
                console.error(err);
                setStatus("Error executing deletion request.", true);
            }
        }

        deleteBtn.onclick = () => {
            if (selectedIndex === null || !currentDataset[selectedIndex]) {
                setStatus("Please select an image thumbnail first.", true);
                return;
            }
            openDeleteConfirmModal(currentDataset[selectedIndex]);
        };

        function openLightbox(startIndex) {
            let currentIndex = startIndex;

            const overlay = document.createElement("div");
            overlay.tabIndex = 0;
            overlay.style.position = "fixed";
            overlay.style.top = "0";
            overlay.style.left = "0";
            overlay.style.width = "100vw";
            overlay.style.height = "100vh";
            overlay.style.background = "rgba(10, 5, 18, 0.95)";
            overlay.style.display = "flex";
            overlay.style.flexDirection = "column";
            overlay.style.justifyContent = "center";
            overlay.style.alignItems = "center";
            overlay.style.zIndex = "999999";
            overlay.style.padding = "20px";
            overlay.style.boxSizing = "border-box";
            overlay.style.outline = "none";

            const modalContent = document.createElement("div");
            modalContent.style.display = "flex";
            modalContent.style.flexDirection = "column";
            modalContent.style.alignItems = "center";
            modalContent.style.maxHeight = "92vh";
            modalContent.style.maxWidth = "90vw";
            modalContent.style.gap = "8px";
            modalContent.onclick = (e) => e.stopPropagation();

            const headerRow = document.createElement("div");
            headerRow.style.display = "flex";
            headerRow.style.justifyContent = "flex-start";
            headerRow.style.alignItems = "center";
            headerRow.style.width = "650px";
            headerRow.style.maxWidth = "85vw";

            const counterLabel = document.createElement("div");
            counterLabel.style.color = "#9b59b6";
            counterLabel.style.fontSize = "12px";
            counterLabel.style.fontWeight = "bold";

            headerRow.appendChild(counterLabel);

            const viewerWrapper = document.createElement("div");
            viewerWrapper.style.position = "relative";
            viewerWrapper.style.display = "flex";
            viewerWrapper.style.alignItems = "center";
            viewerWrapper.style.justifyContent = "center";

            const img = document.createElement("img");
            img.style.maxHeight = "58vh";
            img.style.maxWidth = "80vw";
            img.style.objectFit = "contain";
            img.style.border = "2px solid #e67e22";
            img.style.borderRadius = "6px";
            img.style.background = "#000";

            const cropContainer = document.createElement("div");
            cropContainer.style.position = "absolute";
            cropContainer.style.display = "none";
            cropContainer.style.cursor = "crosshair";
            cropContainer.style.zIndex = "10";

            const cropCanvas = document.createElement("canvas");
            cropCanvas.style.width = "100%";
            cropCanvas.style.height = "100%";
            cropContainer.appendChild(cropCanvas);
            viewerWrapper.appendChild(cropContainer);

            const prevModalBtn = document.createElement("button");
            prevModalBtn.innerText = "◀";
            prevModalBtn.style.position = "absolute";
            prevModalBtn.style.left = "-50px";
            prevModalBtn.style.background = "#2a1b3d";
            prevModalBtn.style.color = "#f1c40f";
            prevModalBtn.style.border = "1px solid #9b59b6";
            prevModalBtn.style.padding = "12px 10px";
            prevModalBtn.style.borderRadius = "4px";
            prevModalBtn.style.cursor = "pointer";
            prevModalBtn.style.fontSize = "16px";
            prevModalBtn.style.fontWeight = "bold";

            const nextModalBtn = document.createElement("button");
            nextModalBtn.innerText = "▶";
            nextModalBtn.style.position = "absolute";
            nextModalBtn.style.right = "-50px";
            nextModalBtn.style.background = "#2a1b3d";
            nextModalBtn.style.color = "#f1c40f";
            nextModalBtn.style.border = "1px solid #9b59b6";
            nextModalBtn.style.padding = "12px 10px";
            nextModalBtn.style.borderRadius = "4px";
            nextModalBtn.style.cursor = "pointer";
            nextModalBtn.style.fontSize = "16px";
            nextModalBtn.style.fontWeight = "bold";

            viewerWrapper.appendChild(prevModalBtn);
            viewerWrapper.appendChild(img);
            viewerWrapper.appendChild(nextModalBtn);

            const lightboxTextArea = document.createElement("textarea");
            lightboxTextArea.placeholder = "Edit description preview here...";
            lightboxTextArea.style.width = "650px";
            lightboxTextArea.style.maxWidth = "85vw";
            lightboxTextArea.style.height = "85px";
            lightboxTextArea.style.boxSizing = "border-box";
            lightboxTextArea.style.background = "#1b1128";
            lightboxTextArea.style.border = "1px solid #9b59b6";
            lightboxTextArea.style.color = "#f1c40f";
            lightboxTextArea.style.padding = "10px";
            lightboxTextArea.style.borderRadius = "6px";
            lightboxTextArea.style.fontSize = "13px";
            lightboxTextArea.style.fontFamily = "sans-serif";
            lightboxTextArea.style.resize = "vertical";
            lightboxTextArea.style.outline = "none";

            const lightboxControlRow = document.createElement("div");
            lightboxControlRow.style.display = "flex";
            lightboxControlRow.style.justifyContent = "space-between";
            lightboxControlRow.style.alignItems = "center";
            lightboxControlRow.style.width = "650px";
            lightboxControlRow.style.maxWidth = "85vw";

            const lightboxLeftTools = document.createElement("div");
            lightboxLeftTools.style.display = "flex";
            lightboxLeftTools.style.gap = "6px";

            const lbRotateLeftBtn = document.createElement("button");
            lbRotateLeftBtn.innerText = "↶";
            lbRotateLeftBtn.title = "Rotate Left (Shift+Left Arrow)";
            lbRotateLeftBtn.style.background = "#2a1b3d";
            lbRotateLeftBtn.style.color = "#f1c40f";
            lbRotateLeftBtn.style.border = "1px solid #9b59b6";
            lbRotateLeftBtn.style.padding = "3px 10px";
            lbRotateLeftBtn.style.borderRadius = "4px";
            lbRotateLeftBtn.style.cursor = "pointer";
            lbRotateLeftBtn.style.fontSize = "14px";

            const lbRotateRightBtn = document.createElement("button");
            lbRotateRightBtn.innerText = "↷";
            lbRotateRightBtn.title = "Rotate Right (Shift+Right Arrow)";
            lbRotateRightBtn.style.background = "#2a1b3d";
            lbRotateRightBtn.style.color = "#f1c40f";
            lbRotateRightBtn.style.border = "1px solid #9b59b6";
            lbRotateRightBtn.style.padding = "3px 10px";
            lbRotateRightBtn.style.borderRadius = "4px";
            lbRotateRightBtn.style.cursor = "pointer";
            lbRotateRightBtn.style.fontSize = "14px";

            const lbCropToggleBtn = document.createElement("button");
            lbCropToggleBtn.innerText = "✂ Crop Image";
            lbCropToggleBtn.style.background = "#2a1b3d";
            lbCropToggleBtn.style.color = "#f1c40f";
            lbCropToggleBtn.style.border = "1px solid #9b59b6";
            lbCropToggleBtn.style.padding = "3px 10px";
            lbCropToggleBtn.style.borderRadius = "4px";
            lbCropToggleBtn.style.cursor = "pointer";
            lbCropToggleBtn.style.fontSize = "11px";
            lbCropToggleBtn.style.fontWeight = "bold";

            lbRotateLeftBtn.onclick = async (e) => {
                e.stopPropagation();
                await handleRotate("left");
                updateLightboxView();
            };

            lbRotateRightBtn.onclick = async (e) => {
                e.stopPropagation();
                await handleRotate("right");
                updateLightboxView();
            };

            lightboxLeftTools.appendChild(lbRotateLeftBtn);
            lightboxLeftTools.appendChild(lbRotateRightBtn);
            lightboxLeftTools.appendChild(lbCropToggleBtn);

            const lightboxCheckboxLabel = document.createElement("label");
            lightboxCheckboxLabel.style.display = "flex";
            lightboxCheckboxLabel.style.alignItems = "center";
            lightboxCheckboxLabel.style.gap = "6px";
            lightboxCheckboxLabel.style.color = "#f1c40f";
            lightboxCheckboxLabel.style.fontSize = "12px";
            lightboxCheckboxLabel.style.cursor = "pointer";

            const lightboxCheckbox = document.createElement("input");
            lightboxCheckbox.type = "checkbox";
            lightboxCheckbox.style.cursor = "pointer";

            lightboxCheckboxLabel.appendChild(lightboxCheckbox);
            lightboxCheckboxLabel.appendChild(document.createTextNode("Include in Training & Export (Space)"));

            lightboxControlRow.appendChild(lightboxLeftTools);
            lightboxControlRow.appendChild(lightboxCheckboxLabel);

            const cropActionRow = document.createElement("div");
            cropActionRow.style.display = "none";
            cropActionRow.style.justifyContent = "space-between";
            cropActionRow.style.alignItems = "center";
            cropActionRow.style.width = "650px";
            cropActionRow.style.maxWidth = "85vw";
            cropActionRow.style.background = "#221336";
            cropActionRow.style.padding = "6px 10px";
            cropActionRow.style.borderRadius = "4px";
            cropActionRow.style.border = "1px solid #e67e22";

            const cropInfoText = document.createElement("span");
            cropInfoText.innerText = "Click & drag over the image to select crop area.";
            cropInfoText.style.fontSize = "11px";
            cropInfoText.style.color = "#e67e22";

            const cropBtnsGroup = document.createElement("div");
            cropBtnsGroup.style.display = "flex";
            cropBtnsGroup.style.gap = "6px";

            const cropUndoBtn = document.createElement("button");
            cropUndoBtn.innerText = "Undo Crop";
            cropUndoBtn.style.background = "#2a1b3d";
            cropUndoBtn.style.color = "#f1c40f";
            cropUndoBtn.style.border = "1px solid #9b59b6";
            cropUndoBtn.style.padding = "4px 10px";
            cropUndoBtn.style.borderRadius = "4px";
            cropUndoBtn.style.cursor = "pointer";
            cropUndoBtn.style.fontSize = "11px";

            const cropCancelBtn = document.createElement("button");
            cropCancelBtn.innerText = "Cancel";
            cropCancelBtn.style.background = "#2a1b3d";
            cropCancelBtn.style.color = "#fff";
            cropCancelBtn.style.border = "1px solid #9b59b6";
            cropCancelBtn.style.padding = "4px 10px";
            cropCancelBtn.style.borderRadius = "4px";
            cropCancelBtn.style.cursor = "pointer";
            cropCancelBtn.style.fontSize = "11px";

            const cropSaveBtn = document.createElement("button");
            cropSaveBtn.innerText = "Save Crop";
            cropSaveBtn.style.background = "#2ecc71";
            cropSaveBtn.style.color = "#150b22";
            cropSaveBtn.style.border = "none";
            cropSaveBtn.style.padding = "4px 12px";
            cropSaveBtn.style.borderRadius = "4px";
            cropSaveBtn.style.cursor = "pointer";
            cropSaveBtn.style.fontWeight = "bold";
            cropSaveBtn.style.fontSize = "11px";

            cropBtnsGroup.appendChild(cropUndoBtn);
            cropBtnsGroup.appendChild(cropCancelBtn);
            cropBtnsGroup.appendChild(cropSaveBtn);
            cropActionRow.appendChild(cropInfoText);
            cropActionRow.appendChild(cropBtnsGroup);

            let isCroppingActive = false;
            let cropStartX = 0, cropStartY = 0, cropEndX = 0, cropEndY = 0;
            let isDragging = false;

            function drawCropRect() {
                const ctx = cropCanvas.getContext("2d");
                cropCanvas.width = cropContainer.clientWidth;
                cropCanvas.height = cropContainer.clientHeight;
                ctx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);

                if (isDragging || (cropStartX !== cropEndX && cropStartY !== cropEndY)) {
                    const x = Math.min(cropStartX, cropEndX);
                    const y = Math.min(cropStartY, cropEndY);
                    const w = Math.abs(cropEndX - cropStartX);
                    const h = Math.abs(cropEndY - cropStartY);

                    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
                    ctx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);
                    ctx.clearRect(x, y, w, h);
                    ctx.strokeStyle = "#e67e22";
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x, y, w, h);
                }
            }

            lbCropToggleBtn.onclick = (e) => {
                e.stopPropagation();
                isCroppingActive = true;

                const imgRect = img.getBoundingClientRect();
                const wrapperRect = viewerWrapper.getBoundingClientRect();

                cropContainer.style.display = "block";
                cropContainer.style.left = `${imgRect.left - wrapperRect.left}px`;
                cropContainer.style.top = `${imgRect.top - wrapperRect.top}px`;
                cropContainer.style.width = `${imgRect.width}px`;
                cropContainer.style.height = `${imgRect.height}px`;

                cropActionRow.style.display = "flex";
                lightboxControlRow.style.display = "none";
                prevModalBtn.style.display = "none";
                nextModalBtn.style.display = "none";
                cropStartX = 0; cropStartY = 0; cropEndX = 0; cropEndY = 0;
                drawCropRect();
            };

            cropCancelBtn.onclick = (e) => {
                e.stopPropagation();
                exitCropMode();
            };

            cropUndoBtn.onclick = (e) => {
                e.stopPropagation();
                cropStartX = 0; cropStartY = 0; cropEndX = 0; cropEndY = 0;
                isDragging = false;
                drawCropRect();
            };

            cropContainer.onmousedown = (e) => {
                if (!isCroppingActive) return;
                const rect = cropContainer.getBoundingClientRect();
                cropStartX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
                cropStartY = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
                cropEndX = cropStartX;
                cropEndY = cropStartY;
                isDragging = true;
            };

            cropContainer.onmousemove = (e) => {
                if (!isCroppingActive || !isDragging) return;
                const rect = cropContainer.getBoundingClientRect();
                cropEndX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
                cropEndY = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
                drawCropRect();
            };

            cropContainer.onmouseup = () => {
                if (!isCroppingActive) return;
                isDragging = false;
            };

            cropSaveBtn.onclick = async (e) => {
                e.stopPropagation();
                if (cropStartX === cropEndX || cropStartY === cropEndY) {
                    setStatus("Please draw a valid crop rectangle first.", true);
                    return;
                }

                const item = currentDataset[currentIndex];
                if (!item) return;

                const displayW = cropContainer.clientWidth;
                const displayH = cropContainer.clientHeight;
                const scaleX = img.naturalWidth / displayW;
                const scaleY = img.naturalHeight / displayH;

                const x1 = Math.min(cropStartX, cropEndX);
                const y1 = Math.min(cropStartY, cropEndY);
                const x2 = Math.max(cropStartX, cropEndX);
                const y2 = Math.max(cropStartY, cropEndY);

                const cropBox = {
                    left: Math.round(x1 * scaleX),
                    top: Math.round(y1 * scaleY),
                    right: Math.round(x2 * scaleX),
                    bottom: Math.round(y2 * scaleY)
                };

                try {
                    setStatus(`Cropping ${item.filename}...`);
                    const res = await api.fetchApi("/rsl/utils/crop_image", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            path: item.image_path,
                            box: cropBox
                        })
                    });
                    const result = await res.json();
                    if (result.success) {
                        item.state = "modified";
                        exitCropMode();
                        updateLightboxView();
                        setStatus(`Successfully cropped ${item.filename}!`, false, true);
                    } else {
                        setStatus("Crop failed: " + (result.error || "Unknown error"), true);
                    }
                } catch (err) {
                    console.error(err);
                    setStatus("Error executing crop request.", true);
                }
            };

            function exitCropMode() {
                isCroppingActive = false;
                cropContainer.style.display = "none";
                cropActionRow.style.display = "none";
                lightboxControlRow.style.display = "flex";
                prevModalBtn.style.display = "block";
                nextModalBtn.style.display = "block";
            }

            const lightboxCounterBar = document.createElement("div");
            lightboxCounterBar.style.width = "650px";
            lightboxCounterBar.style.maxWidth = "85vw";
            lightboxCounterBar.style.display = "flex";
            lightboxCounterBar.style.justifyContent = "flex-end";
            lightboxCounterBar.style.gap = "12px";
            lightboxCounterBar.style.fontSize = "11px";
            lightboxCounterBar.style.color = "#9b59b6";

            function updateLightboxCounters(text) {
                const chars = text.length;
                const words = text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
                const estTokens = Math.round(chars / 4);
                lightboxCounterBar.innerText = `Chars: ${chars} | Words: ${words} | Est. Tokens: ~${estTokens}`;
            }

            function updateLightboxView() {
                const item = currentDataset[currentIndex];
                if (!item) {
                    closeLightbox();
                    return;
                }
                // On-demand full image load when inspecting in lightbox
                img.src = datasetLookup[item.filename] ? datasetLookup[item.filename].fullUrl : `/rsl/utils/get_image?path=${encodeURIComponent(item.image_path)}&t=${Date.now()}`;
                lightboxTextArea.value = item.caption || "";
                lightboxCheckbox.checked = item.enabled !== false;
                counterLabel.innerText = `Image ${currentIndex + 1} of ${currentDataset.length}: ${item.filename}`;

                selectedIndex = currentIndex;
                const text = currentDataset[selectedIndex].caption;
                textArea.value = text;
                updateCounters(text);
                updateLightboxCounters(text);
                renderThumbnails();

                const thumbEl = thumbContainer.querySelector(`[data-index='${selectedIndex}']`);
                if (thumbEl) {
                    thumbEl.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
                }
                overlay.focus();
            }

            lightboxCheckbox.onchange = async () => {
                const item = currentDataset[currentIndex];
                if (!item) return;
                item.enabled = lightboxCheckbox.checked;
                await saveSelectionStatus(item);
                updateTrainingCountDisplay();
                renderThumbnails();
            };

            prevModalBtn.onclick = (e) => {
                e.stopPropagation();
                if (currentIndex > 0) {
                    currentIndex--;
                    updateLightboxView();
                }
            };

            nextModalBtn.onclick = (e) => {
                e.stopPropagation();
                if (currentIndex < currentDataset.length - 1) {
                    currentIndex++;
                    updateLightboxView();
                }
            };

            lightboxTextArea.oninput = () => {
                const item = currentDataset[currentIndex];
                if (!item) return;
                item.caption = lightboxTextArea.value;
                item.state = "modified";
                textArea.value = lightboxTextArea.value;
                updateCounters(lightboxTextArea.value);
                updateLightboxCounters(lightboxTextArea.value);
                renderThumbnails();
            };

            const actionRow = document.createElement("div");
            actionRow.style.display = "flex";
            actionRow.style.justifyContent = "space-between";
            actionRow.style.alignItems = "center";
            actionRow.style.width = "650px";
            actionRow.style.maxWidth = "85vw";

            const lbDeleteBtn = document.createElement("button");
            lbDeleteBtn.innerText = "Delete Item";
            lbDeleteBtn.style.background = "#c0392b";
            lbDeleteBtn.style.color = "#ffffff";
            lbDeleteBtn.style.border = "none";
            lbDeleteBtn.style.padding = "6px 12px";
            lbDeleteBtn.style.borderRadius = "4px";
            lbDeleteBtn.style.cursor = "pointer";
            lbDeleteBtn.style.fontWeight = "bold";

            lbDeleteBtn.onclick = () => {
                if (selectedIndex === null || !currentDataset[selectedIndex]) return;
                openDeleteConfirmModal(currentDataset[selectedIndex]);
            };

            const rightModalBtns = document.createElement("div");
            rightModalBtns.style.display = "flex";
            rightModalBtns.style.gap = "10px";

            const saveBtn = document.createElement("button");
            saveBtn.innerText = "Save Caption";
            saveBtn.style.background = "#f1c40f";
            saveBtn.style.color = "#150b22";
            saveBtn.style.border = "none";
            saveBtn.style.padding = "6px 14px";
            saveBtn.style.borderRadius = "4px";
            saveBtn.style.cursor = "pointer";
            saveBtn.style.fontWeight = "bold";

            saveBtn.onclick = async () => {
                await saveCurrentItem();
                overlay.focus();
            };

            const closeBtn = document.createElement("button");
            closeBtn.innerText = "Close (Esc)";
            closeBtn.style.background = "#2a1b3d";
            closeBtn.style.color = "#fff";
            closeBtn.style.border = "1px solid #9b59b6";
            closeBtn.style.padding = "6px 14px";
            closeBtn.style.borderRadius = "4px";
            closeBtn.style.cursor = "pointer";

            closeBtn.onclick = () => closeLightbox();

            rightModalBtns.appendChild(saveBtn);
            rightModalBtns.appendChild(closeBtn);

            actionRow.appendChild(lbDeleteBtn);
            actionRow.appendChild(rightModalBtns);

            modalContent.appendChild(headerRow);
            modalContent.appendChild(viewerWrapper);
            modalContent.appendChild(lightboxTextArea);
            modalContent.appendChild(lightboxControlRow);
            modalContent.appendChild(cropActionRow);
            modalContent.appendChild(lightboxCounterBar);
            modalContent.appendChild(actionRow);
            overlay.appendChild(modalContent);

            const closeLightbox = () => {
                if (document.body.contains(overlay)) {
                    document.body.removeChild(overlay);
                }
                window.removeEventListener("keydown", escListener);
                container.focus();
            };

            const escListener = async (e) => {
                if (e.key === "Escape") {
                    if (isCroppingActive) {
                        exitCropMode();
                    } else {
                        closeLightbox();
                    }
                } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                    e.preventDefault();
                    e.stopPropagation();
                    saveCurrentItem();
                } else if (e.shiftKey && e.key === "ArrowLeft") {
                    e.preventDefault();
                    e.stopPropagation();
                    await handleRotate("left");
                    updateLightboxView();
                } else if (e.shiftKey && e.key === "ArrowRight") {
                    e.preventDefault();
                    e.stopPropagation();
                    await handleRotate("right");
                    updateLightboxView();
                } else if (e.key === " " && document.activeElement !== lightboxTextArea && !isCroppingActive) {
                    e.preventDefault();
                    e.stopPropagation();
                    lightboxCheckbox.checked = !lightboxCheckbox.checked;
                    const item = currentDataset[currentIndex];
                    if (item) {
                        item.enabled = lightboxCheckbox.checked;
                        await saveSelectionStatus(item);
                        updateTrainingCountDisplay();
                        renderThumbnails();
                    }
                } else if (e.key === "ArrowLeft" && document.activeElement !== lightboxTextArea && !isCroppingActive) {
                    e.preventDefault();
                    if (currentIndex > 0) {
                        currentIndex--;
                        updateLightboxView();
                    }
                } else if (e.key === "ArrowRight" && document.activeElement !== lightboxTextArea && !isCroppingActive) {
                    e.preventDefault();
                    if (currentIndex < currentDataset.length - 1) {
                        currentIndex++;
                        updateLightboxView();
                    }
                }
            };

            overlay.onclick = () => {
                if (!isCroppingActive) closeLightbox();
            };
            window.addEventListener("keydown", escListener);
            document.body.appendChild(overlay);

            updateLightboxView();
        }

        prevBtn.onclick = () => {
            if (selectedIndex !== null && selectedIndex > 0) {
                selectThumbnail(selectedIndex - 1);
            } else if (currentDataset.length > 0) {
                selectThumbnail(0);
            }
        };

        nextBtn.onclick = () => {
            if (selectedIndex !== null && selectedIndex < currentDataset.length - 1) {
                selectThumbnail(selectedIndex + 1);
            } else if (currentDataset.length > 0) {
                selectThumbnail(0);
            }
        };

        function applyZoom() {
            const containerHeight = thumbHeight + 20;
            thumbContainer.style.height = `${containerHeight}px`;
            thumbContainer.style.minHeight = `${containerHeight}px`;
            thumbContainer.style.maxHeight = `${containerHeight}px`;
            renderThumbnails();
        }

        zoomOutBtn.onclick = () => {
            thumbHeight = Math.max(45, thumbHeight - 12);
            applyZoom();
        };
        zoomResetBtn.onclick = () => {
            thumbHeight = 70;
            applyZoom();
        };
        zoomInBtn.onclick = () => {
            thumbHeight = Math.min(140, thumbHeight + 12);
            applyZoom();
        };

        loadBtn.onclick = async () => {
            const dir = dirInput.value.trim();
            if (!dir) {
                setStatus("Please enter a valid directory path.", true);
                return;
            }

            syncPathToWidget();

            try {
                setStatus("Loading dataset metadata & indexing dictionary...");
                const res = await api.fetchApi(`/rsl/utils/get_dataset?dir=${encodeURIComponent(dir)}`);
                const data = await res.json();
                if (data.items) {
                    datasetLookup = {};
                    currentDataset = data.items.map(item => {
                        const fullUrl = `/rsl/utils/get_image?path=${encodeURIComponent(item.image_path)}&t=${Date.now()}`;
                        datasetLookup[item.filename] = {
                            image_path: item.image_path,
                            fullUrl: fullUrl
                        };
                        return {
                            ...item,
                            state: "untouched"
                        };
                    });
                    selectedIndex = null;
                    textArea.value = "";
                    updateCounters("");
                    prependInput.value = "";
                    appendInput.value = "";
                    findInput.value = "";
                    replaceInput.value = "";
                    allCheckbox.checked = false;
                    renderThumbnails();
                    updateTrainingCountDisplay();
                    localStorage.setItem("RSL_LoraDescriptionEditor_lastDir", dir);
                    setStatus(`Indexed & loaded metadata for ${currentDataset.length} images successfully.`, false, true);
                }
            } catch (err) {
                console.error(err);
                setStatus("Failed to load directory.", true);
            }
        };

        function renderThumbnails() {
            thumbContainer.innerHTML = "";
            const showOnlySelected = filterSelectedCheckbox.checked;

            currentDataset.forEach((item, index) => {
                if (showOnlySelected && item.enabled === false) {
                    return;
                }

                const thumb = document.createElement("div");
                thumb.dataset.index = index;
                const thumbWidth = Math.round(thumbHeight * 0.8);
                thumb.style.position = "relative";
                thumb.style.minWidth = `${thumbWidth}px`;
                thumb.style.width = `${thumbWidth}px`;
                thumb.style.height = `${thumbHeight}px`;
                thumb.style.background = "#000";
                thumb.style.flexShrink = "0";
                thumb.style.opacity = (item.enabled !== false) ? "1.0" : "0.35";

                let borderColor = "#9b59b6";
                if (item.state === "modified") {
                    borderColor = "#e67e22";
                } else if (item.state === "saved") {
                    borderColor = "#2ecc71";
                } else if (index === selectedIndex) {
                    borderColor = "#f1c40f";
                }

                thumb.style.border = `2px solid ${borderColor}`;
                thumb.style.borderRadius = "4px";
                thumb.style.cursor = "pointer";
                // Uses indexed lookup URL for thumbnail rendering
                thumb.style.backgroundImage = `url('${datasetLookup[item.filename] ? datasetLookup[item.filename].fullUrl : ""}')`;
                thumb.style.backgroundSize = "cover";
                thumb.style.backgroundPosition = "center";
                thumb.title = `Double-click to inspect & edit full image\n${item.filename}`;

                const thumbCheckbox = document.createElement("input");
                thumbCheckbox.type = "checkbox";
                thumbCheckbox.checked = item.enabled !== false;
                thumbCheckbox.style.position = "absolute";
                thumbCheckbox.style.top = "2px";
                thumbCheckbox.style.left = "2px";
                thumbCheckbox.style.cursor = "pointer";
                thumbCheckbox.title = "Toggle training & export inclusion";

                thumbCheckbox.onclick = (e) => {
                    e.stopPropagation();
                };

                thumbCheckbox.onchange = async () => {
                    item.enabled = thumbCheckbox.checked;
                    await saveSelectionStatus(item);
                    updateTrainingCountDisplay();
                    renderThumbnails();
                };

                thumb.appendChild(thumbCheckbox);

                thumb.onclick = () => {
                    selectThumbnail(index);
                };

                thumb.ondblclick = (e) => {
                    e.stopPropagation();
                    openLightbox(index);
                };

                thumbContainer.appendChild(thumb);
            });
        }

        async function saveCurrentItem() {
            if (selectedIndex === null || !currentDataset[selectedIndex]) {
                setStatus("Please select an image thumbnail first.", true);
                return;
            }
            const item = currentDataset[selectedIndex];
            item.caption = textArea.value;

            try {
                setStatus(`Saving ${item.filename}...`);
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
                    item.state = "saved";
                    renderThumbnails();
                    setStatus(`Successfully saved caption for ${item.filename}!`, false, true);
                } else {
                    setStatus("Error saving: " + result.error, true);
                }
            } catch (err) {
                console.error(err);
                setStatus("Error updating caption.", true);
            }
        }

        container.onkeydown = async (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                e.stopPropagation();
                saveCurrentItem();
                return;
            }

            if (e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
                e.preventDefault();
                e.stopPropagation();
                if (e.key === "ArrowLeft") {
                    await handleRotate("left");
                } else {
                    await handleRotate("right");
                }
                return;
            }

            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                const activeEl = document.activeElement;
                const isTextArea = activeEl === textArea;

                if (isTextArea) {
                    if (e.key === "ArrowLeft" && textArea.selectionStart === 0 && textArea.selectionEnd === 0) {
                        if (selectedIndex !== null && selectedIndex > 0) {
                            e.preventDefault();
                            selectThumbnail(selectedIndex - 1);
                            textArea.focus();
                        }
                    } else if (e.key === "ArrowRight" && textArea.selectionStart === textArea.value.length && textArea.selectionEnd === textArea.value.length) {
                        if (selectedIndex !== null && selectedIndex < currentDataset.length - 1) {
                            e.preventDefault();
                            selectThumbnail(selectedIndex + 1);
                            textArea.focus();
                        }
                    }
                    return;
                }

                if (selectedIndex !== null && currentDataset.length > 0) {
                    e.stopPropagation();
                    e.preventDefault();

                    if (e.key === "ArrowLeft" && selectedIndex > 0) {
                        selectThumbnail(selectedIndex - 1);
                    } else if (e.key === "ArrowRight" && selectedIndex < currentDataset.length - 1) {
                        selectThumbnail(selectedIndex + 1);
                    }
                }
            }
        };

        textArea.oninput = () => {
            if (selectedIndex === null || !currentDataset[selectedIndex]) return;
            const item = currentDataset[selectedIndex];
            item.caption = textArea.value;
            item.state = "modified";
            updateCounters(textArea.value);
            renderThumbnails();
        };

        prependBtn.onclick = () => {
            const prependVal = prependInput.value;
            if (!prependVal) return;

            if (allCheckbox.checked) {
                if (currentDataset.length === 0) {
                    setStatus("No dataset loaded.", true);
                    return;
                }
                currentDataset.forEach(item => {
                    item.caption = prependVal + item.caption;
                    item.state = "modified";
                });
                if (selectedIndex !== null && currentDataset[selectedIndex]) {
                    textArea.value = currentDataset[selectedIndex].caption;
                    updateCounters(textArea.value);
                }
                renderThumbnails();
                setStatus(`Prepended text to all ${currentDataset.length} items.`, false, true);
            } else {
                if (selectedIndex === null || !currentDataset[selectedIndex]) {
                    setStatus("Please select an image thumbnail first.", true);
                    return;
                }
                const item = currentDataset[selectedIndex];
                textArea.value = prependVal + item.caption;
                item.caption = textArea.value;
                item.state = "modified";
                updateCounters(textArea.value);
                renderThumbnails();
                setStatus(`Prepended text to ${item.filename}.`, false, true);
            }
        };

        appendBtn.onclick = () => {
            const appendVal = appendInput.value;
            if (!appendVal) return;

            if (allCheckbox.checked) {
                if (currentDataset.length === 0) {
                    setStatus("No dataset loaded.", true);
                    return;
                }
                currentDataset.forEach(item => {
                    item.caption = item.caption + appendVal;
                    item.state = "modified";
                });
                if (selectedIndex !== null && currentDataset[selectedIndex]) {
                    textArea.value = currentDataset[selectedIndex].caption;
                    updateCounters(textArea.value);
                }
                renderThumbnails();
                setStatus(`Appended text to all ${currentDataset.length} items.`, false, true);
            } else {
                if (selectedIndex === null || !currentDataset[selectedIndex]) {
                    setStatus("Please select an image thumbnail first.", true);
                    return;
                }
                const item = currentDataset[selectedIndex];
                textArea.value = textArea.value + appendVal;
                item.caption = textArea.value;
                item.state = "modified";
                updateCounters(textArea.value);
                renderThumbnails();
                setStatus(`Appended text to ${item.filename}.`, false, true);
            }
        };

        replaceBtn.onclick = () => {
            const findVal = findInput.value;
            if (!findVal) {
                setStatus("Please enter text to find.", true);
                return;
            }
            if (currentDataset.length === 0) {
                setStatus("No dataset loaded.", true);
                return;
            }

            const replaceVal = replaceInput.value;
            let matchCount = 0;

            if (allCheckbox.checked) {
                currentDataset.forEach(item => {
                    if (item.caption.includes(findVal)) {
                        item.caption = item.caption.split(findVal).join(replaceVal);
                        item.state = "modified";
                        matchCount++;
                    }
                });
                setStatus(`Replaced "${findVal}" in ${matchCount} items across all files.`, false, true);
            } else {
                if (selectedIndex === null || !currentDataset[selectedIndex]) {
                    setStatus("Please select an image thumbnail first.", true);
                    return;
                }
                const item = currentDataset[selectedIndex];
                if (item.caption.includes(findVal)) {
                    item.caption = item.caption.split(findVal).join(replaceVal);
                    item.state = "modified";
                    matchCount = 1;
                    setStatus(`Replaced "${findVal}" in ${item.filename}.`, false, true);
                } else {
                    setStatus(`"${findVal}" not found in selected item.`, true);
                    return;
                }
            }

            if (selectedIndex !== null && currentDataset[selectedIndex]) {
                textArea.value = currentDataset[selectedIndex].caption;
                updateCounters(textArea.value);
            }

            renderThumbnails();
        };

        updateBtn.onclick = saveCurrentItem;

        saveAllBtn.onclick = async () => {
            const modifiedItems = currentDataset.filter(item => item.state === "modified");
            if (modifiedItems.length === 0) {
                setStatus("No modified items to save.", true);
                return;
            }

            const dir = dirInput.value.trim();
            if (!dir) {
                setStatus("Invalid directory path.", true);
                return;
            }

            try {
                setStatus(`Saving ${modifiedItems.length} modified items...`);
                let successCount = 0;

                for (const item of modifiedItems) {
                    const res = await api.fetchApi("/rsl/utils/update_caption", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            dir: dir,
                            filename: item.filename,
                            caption: item.caption
                        })
                    });
                    const result = await res.json();
                    if (result.success) {
                        item.state = "saved";
                        successCount++;
                    }
                }

                renderThumbnails();
                setStatus(`Successfully saved all ${successCount} modified captions!`, false, true);
            } catch (err) {
                console.error(err);
                setStatus("Error during batch save.", true);
            }
        };

        if (dirInput.value.trim()) {
            loadBtn.click();
        }
    }
});