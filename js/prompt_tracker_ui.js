import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import {
    PROMPT_TRACKER_THEME as THEME,
    THEMES,
    getThemePalette,
    styleButton,
    styleInput,
    createStatusBar,
    createThemeDropdown
} from "./color_node.js";

function hideBackendWidgets(node) {
    if (!node.widgets) return;
    node.widgets.forEach(w => {
        if ([
            "AutoCaptureOn", "auto_prompt", "auto_negative", "auto_render_model",
            "auto_image", "auto_steps", "auto_cfg", "auto_denoise", "auto_seed",
            "prompt_value", "negative_value", "category_value", "model_value",
            "loras_value", "config_value", "source_value", "tag_value",
            "steps", "cfg", "denoise", "seed", "active_db", "master_root",
            "instance_uuid"
        ].includes(w.name)) {
            w.type = "hidden";
            w.computeSize = () => [0, -4];
            w.draw = function () { };
        }
    });
}

function createResizeDivider(title, accentColor, onResizeDelta) {
    const divider = document.createElement("div");
    divider.style.width = "100%";
    divider.style.height = "16px";
    divider.style.minHeight = "16px";
    divider.style.cursor = "row-resize";
    divider.style.display = "flex";
    divider.style.alignItems = "center";
    divider.style.justifyContent = "center";
    divider.style.flexShrink = "0";
    divider.style.touchAction = "none";
    divider.style.backgroundColor = accentColor ? `${accentColor}25` : "rgba(255, 255, 255, 0.05)";
    divider.style.borderRadius = "4px";
    divider.style.margin = "3px 0";
    divider.title = title;

    const line = document.createElement("div");
    line.style.width = "80px";
    line.style.height = "4px";
    line.style.backgroundColor = accentColor || "#4f46e5";
    line.style.borderRadius = "2px";
    divider.appendChild(line);

    let isResizing = false;
    let startY = 0;

    const onMove = (clientY) => {
        if (!isResizing) return;
        const dy = clientY - startY;
        startY = clientY;
        onResizeDelta(dy);
    };

    const stopResize = () => {
        if (isResizing) {
            isResizing = false;
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", stopResize);
            window.removeEventListener("touchmove", onTouchMove);
            window.removeEventListener("touchend", stopResize);
        }
    };

    const onMouseMove = (e) => onMove(e.clientY);
    const onTouchMove = (e) => e.touches[0] && onMove(e.touches[0].clientY);

    divider.onmousedown = (e) => {
        e.preventDefault();
        isResizing = true;
        startY = e.clientY;
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", stopResize);
    };

    divider.ontouchstart = (e) => {
        if (!e.touches[0]) return;
        isResizing = true;
        startY = e.touches[0].clientY;
        window.addEventListener("touchmove", onTouchMove, { passive: false });
        window.addEventListener("touchend", stopResize);
    };

    return divider;
}

app.registerExtension({
    name: "RSL.PromptTrackerUI",
    async loadedGraphNode(node) {
        if (node.comfyClass === "PromptTrackerNode") {
            hideBackendWidgets(node);
            const enableWidget = node.widgets?.find(w => w.name === "enable_auto_capture");
            if (enableWidget) {
                enableWidget.computeSize = () => [0, -4];
                enableWidget.draw = function () { };
            }
        }
    },
    async nodeCreated(node) {
        if (node.comfyClass !== "PromptTrackerNode") return;

        if (!node.properties) node.properties = {};
        if (!node.properties.selected_database) node.properties.selected_database = "prompts_db";
        if (!node.properties.master_root) node.properties.master_root = "";

        if (!node.properties.instanceUuid) {
            node.properties.instanceUuid = (typeof crypto !== 'undefined' && crypto.randomUUID)
                ? crypto.randomUUID()
                : 'rsl-' + Math.random().toString(36).substring(2, 9) + Date.now();
        }
        const instanceUuid = node.properties.instanceUuid;

        if (node.properties.selected_prompt_text === undefined) node.properties.selected_prompt_text = null;
        if (node.properties.promptFontSize === undefined) node.properties.promptFontSize = 12;
        if (node.properties.promptBoxHeight === undefined) node.properties.promptBoxHeight = 110;
        if (node.properties.negativeBoxHeight === undefined) node.properties.negativeBoxHeight = 70;

        let savedThemeKey = node.properties.activeTheme || "tracker";
        let activeTheme = getThemePalette(savedThemeKey);

        const initialNodeTheme = THEMES[savedThemeKey] || THEMES.tracker;
        node.color = initialNodeTheme.color;
        node.bgcolor = initialNodeTheme.bgcolor;

        let localDb = [];
        let selectedIndex = null;
        let currentImageInfo = { image: "", steps: 20, cfg: 8.0, denoise: 1.0, seed: 0, render_model: "undefined" };
        let autoCaptureState = true;
        let currentDbName = node.properties.selected_database;
        let searchFilterQuery = "";
        let filterFavoritesOnly = false;
        let imageFilterMode = "all";
        let promptFontSize = node.properties.promptFontSize;
        let currentRotationAngle = 0;
        let currentDirModalMode = "master";

        let dbCategories = new Set(["General"]);
        let dbModels = new Set(["undefined"]);
        let activeSelectedCategory = "General";
        let activeSelectedModel = "undefined";

        hideBackendWidgets(node);
        const enableWidget = node.widgets?.find(w => w.name === "enable_auto_capture");
        if (enableWidget) {
            enableWidget.computeSize = () => [0, -4];
            enableWidget.draw = function () { };
        }

        function getProxiedImageUrl(imgUrl) {
            if (!imgUrl) return "";
            if (imgUrl.startsWith("http") || imgUrl.startsWith("data:")) {
                return imgUrl;
            }
            const masterRoot = node.properties.master_root || "";
            let fullUrl = imgUrl;
            if (imgUrl.includes("/prompt_tracker/view_image")) {
                const sep = imgUrl.includes("?") ? "&" : "?";
                fullUrl = `${imgUrl}${sep}master_root=${encodeURIComponent(masterRoot)}`;
            }
            const baseUri = api.apiURL(fullUrl);
            const cacheBuster = `_t=${Date.now()}`;
            return baseUri.includes("?") ? `${baseUri}&${cacheBuster}` : `${baseUri}?${cacheBuster}`;
        }

        async function prefetchImagesAsBase64(dbItems) {
            for (const item of dbItems) {
                const imgUrl = item.image_info?.image;
                if (imgUrl && !imgUrl.startsWith("data:") && !imgUrl.startsWith("http")) {
                    try {
                        const res = await fetch(getProxiedImageUrl(imgUrl));
                        if (res.ok) {
                            const blob = await res.blob();
                            const base64 = await new Promise((resolve) => {
                                const reader = new FileReader();
                                reader.onloadend = () => resolve(reader.result);
                                reader.readAsDataURL(blob);
                            });
                            item.image_info.image = base64;
                        }
                    } catch (err) {
                        console.error("Failed to prefetch image as base64:", err);
                    }
                }
            }
        }

        function createPromptTransferPayload(item, sourceMasterRoot, sourceUuid) {
            const imgInfo = item.image_info || { steps: 20, cfg: 8.0, denoise: 1.0, seed: 0, render_model: "undefined" };
            const rawImg = imgInfo.image || "";
            const cleanImg = (rawImg.startsWith("data:") || rawImg.startsWith("http")) ? rawImg : "";

            return {
                prompt: item.prompt || "",
                negative: item.negative || "",
                category: item.category || "General",
                model: item.model || "undefined",
                loras: item.loras || "",
                config: item.config || "",
                source: item.source || "",
                tags: item.tags || "",
                starred: item.starred || false,
                image_info: {
                    ...imgInfo,
                    image: cleanImg
                },
                is_embedded: Boolean(cleanImg),
                source_master_root: sourceMasterRoot || "",
                source_instance_uuid: sourceUuid || ""
            };
        }

        function updateBackendWidgets() {
            if (!node.widgets) return;
            node.widgets.forEach(w => {
                if (w.name === "prompt_value") w.value = activeTextarea.value;
                if (w.name === "negative_value") w.value = activeNegativeTextarea.value;
                if (w.name === "category_value") w.value = activeSelectedCategory;
                if (w.name === "model_value") w.value = activeSelectedModel;
                if (w.name === "loras_value") w.value = lorasInput.value.trim();
                if (w.name === "config_value") w.value = configInput.value.trim();
                if (w.name === "source_value") w.value = sourceInput.value.trim();
                if (w.name === "tag_value") w.value = tagInput.value.trim();
                if (w.name === "steps") w.value = currentImageInfo.steps;
                if (w.name === "cfg") w.value = currentImageInfo.cfg;
                if (w.name === "denoise") w.value = currentImageInfo.denoise;
                if (w.name === "seed") w.value = currentImageInfo.seed;
                if (w.name === "AutoCaptureOn") w.value = autoCaptureState;
                if (w.name === "active_db") w.value = currentDbName;
                if (w.name === "master_root") w.value = node.properties.master_root;
                if (w.name === "instance_uuid") w.value = instanceUuid;
            });
        }

        function updateSelectedPromptProperty() {
            if (selectedIndex !== null && localDb[selectedIndex]) {
                node.properties.selected_prompt_text = localDb[selectedIndex].prompt || "";
            } else {
                node.properties.selected_prompt_text = null;
            }
            node.properties.selected_database = currentDbName;
        }

        function updateCounters(text) {
            const charCount = text.length;
            const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
            const total = localDb.length;
            const currentNum = (selectedIndex !== null && selectedIndex >= 0 && selectedIndex < total) ? selectedIndex + 1 : 0;
            const indexStr = total > 0 ? `[${currentNum} / ${total}]` : `[0 / 0]`;
            counterBadge.innerText = `${indexStr}  |  ${charCount} chars | ~${wordCount} words`;
            lightboxIndexBadge.innerText = indexStr;
        }

        function setImageInfo(info, isEmbedded = false) {
            currentImageInfo = info || { image: "", steps: 20, cfg: 8.0, denoise: 1.0, seed: 0, render_model: "undefined" };
            const imgUrl = currentImageInfo.image || "";
            if (imgUrl) {
                exampleThumbImg.src = getProxiedImageUrl(imgUrl);
                exampleThumbImg.style.display = "block";
                examplePlaceholder.style.display = "none";
            } else {
                exampleThumbImg.src = "";
                exampleThumbImg.style.display = "none";
                examplePlaceholder.style.display = "block";
            }

            embedCheck.checked = isEmbedded;
            embedLabelText.innerText = isEmbedded ? "Embed Image (ON)" : "Embed Image (OFF)";

            lightboxEmbedCheck.checked = isEmbedded;
            lightboxEmbedLabelText.innerText = isEmbedded ? "Embed (ON)" : "Embed (OFF)";

            const modelInfo = currentImageInfo.render_model || activeSelectedModel || "undefined";
            exampleContainer.title = `Image Info (Double-click to preview):\nModel: ${modelInfo}\nSteps: ${currentImageInfo.steps}\nCFG: ${currentImageInfo.cfg}\nDenoise: ${currentImageInfo.denoise}\nSeed: ${currentImageInfo.seed}`;
            updateBackendWidgets();
        }

        function setActiveSelection(promptText, negativeText = "", imageInfo = null, isEmbedded = false) {
            activeTextarea.value = promptText;
            activeNegativeTextarea.value = negativeText;
            setImageInfo(imageInfo, isEmbedded);

            updateBackendWidgets();
            updateCounters(promptText);
            updateStarButtonState();
            updateSelectedPromptProperty();
        }

        function updateStarButtonState() {
            if (selectedIndex !== null && localDb[selectedIndex]) {
                const isStarred = localDb[selectedIndex].starred || false;
                activeStarBtn.innerText = isStarred ? "★ Favorited" : "☆ Favorite";
                activeStarBtn.style.color = isStarred ? "#facc15" : activeTheme.textPrimary;
                activeStarBtn.style.display = "inline-block";
            } else {
                activeStarBtn.style.display = "none";
            }
        }

        const container = document.createElement("div");
        container.style.position = "relative";
        container.style.display = "flex";
        container.style.flexDirection = "column";
        container.style.gap = "6px";
        container.style.padding = "8px";
        container.style.backgroundColor = activeTheme.bgDark;
        container.style.color = activeTheme.textPrimary;
        container.style.fontSize = "12px";
        container.style.boxSizing = "border-box";
        container.style.borderRadius = "8px";
        container.style.border = `1px solid ${activeTheme.border}`;
        container.style.width = "100%";
        container.style.height = "100%";
        container.style.overflow = "hidden";

        const baseStatusBarObj = createStatusBar(activeTheme);
        const statusBar = baseStatusBarObj.statusBar;
        const rawSetStatus = baseStatusBarObj.setStatus;

        statusBar.style.fontWeight = "bold";

        const setStatus = (text, isError = false) => {
            rawSetStatus(text, isError);
            statusBar.style.color = isError ? "#ef4444" : "#4ade80";
        };
        statusBar.style.color = "#4ade80";

        // --- LIGHTBOX OVERLAY ---
        const lightboxOverlay = document.createElement("div");
        lightboxOverlay.tabIndex = 0;
        lightboxOverlay.style.position = "absolute";
        lightboxOverlay.style.top = "0";
        lightboxOverlay.style.left = "0";
        lightboxOverlay.style.width = "100%";
        lightboxOverlay.style.height = "100%";
        lightboxOverlay.style.backgroundColor = "rgba(0, 0, 0, 0.95)";
        lightboxOverlay.style.backdropFilter = "blur(5px)";
        lightboxOverlay.style.display = "none";
        lightboxOverlay.style.flexDirection = "column";
        lightboxOverlay.style.justifyContent = "space-between";
        lightboxOverlay.style.alignItems = "center";
        lightboxOverlay.style.zIndex = "30";
        lightboxOverlay.style.borderRadius = "8px";
        lightboxOverlay.style.padding = "8px";
        lightboxOverlay.style.boxSizing = "border-box";
        lightboxOverlay.style.outline = "none";

        const lightboxHeader = document.createElement("div");
        lightboxHeader.style.display = "flex";
        lightboxHeader.style.justifyContent = "space-between";
        lightboxHeader.style.alignItems = "center";
        lightboxHeader.style.width = "100%";
        lightboxHeader.style.padding = "2px 4px";
        lightboxHeader.style.boxSizing = "border-box";

        const lightboxTitle = document.createElement("div");
        lightboxTitle.innerText = "🖼️ Preview & Editable Metadata HUD (Draggable)";
        lightboxTitle.style.fontWeight = "bold";
        lightboxTitle.style.fontSize = "11px";
        lightboxTitle.style.color = "#facc15";

        const lightboxCenterGroup = document.createElement("div");
        lightboxCenterGroup.style.display = "flex";
        lightboxCenterGroup.style.gap = "8px";
        lightboxCenterGroup.style.alignItems = "center";

        const lightboxIndexBadge = document.createElement("div");
        lightboxIndexBadge.innerText = "[0 / 0]";
        lightboxIndexBadge.style.fontWeight = "bold";
        lightboxIndexBadge.style.fontSize = "10px";
        lightboxIndexBadge.style.color = activeTheme.blueBoxTitle || "#38bdf8";

        const svgCcw = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>';
        const svgCw = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>';

        const lightboxRotateCcwBtn = document.createElement("button");
        lightboxRotateCcwBtn.innerHTML = svgCcw;
        styleButton(lightboxRotateCcwBtn, false, activeTheme);
        lightboxRotateCcwBtn.style.display = "flex";
        lightboxRotateCcwBtn.style.alignItems = "center";
        lightboxRotateCcwBtn.style.justifyContent = "center";
        lightboxRotateCcwBtn.style.padding = "3px 6px";

        const lightboxRotateCwBtn = document.createElement("button");
        lightboxRotateCwBtn.innerHTML = svgCw;
        styleButton(lightboxRotateCwBtn, false, activeTheme);
        lightboxRotateCwBtn.style.display = "flex";
        lightboxRotateCwBtn.style.alignItems = "center";
        lightboxRotateCwBtn.style.justifyContent = "center";
        lightboxRotateCwBtn.style.padding = "3px 6px";

        lightboxCenterGroup.appendChild(lightboxIndexBadge);
        lightboxCenterGroup.appendChild(lightboxRotateCcwBtn);
        lightboxCenterGroup.appendChild(lightboxRotateCwBtn);

        const lightboxHeaderBtnGroup = document.createElement("div");
        lightboxHeaderBtnGroup.style.display = "flex";
        lightboxHeaderBtnGroup.style.gap = "6px";
        lightboxHeaderBtnGroup.style.alignItems = "center";

        const lightboxHudToggleBtn = document.createElement("button");
        lightboxHudToggleBtn.innerText = "👁️ HUD (H)";
        styleButton(lightboxHudToggleBtn, false, activeTheme);
        lightboxHudToggleBtn.style.padding = "2px 6px";

        const lightboxCloseBtn = document.createElement("button");
        lightboxCloseBtn.innerText = "✕ Close";
        styleButton(lightboxCloseBtn, true, activeTheme);

        lightboxHeaderBtnGroup.appendChild(lightboxHudToggleBtn);
        lightboxHeaderBtnGroup.appendChild(lightboxCloseBtn);

        lightboxHeader.appendChild(lightboxTitle);
        lightboxHeader.appendChild(lightboxCenterGroup);
        lightboxHeader.appendChild(lightboxHeaderBtnGroup);

        const lightboxBody = document.createElement("div");
        lightboxBody.style.position = "relative";
        lightboxBody.style.flex = "1";
        lightboxBody.style.width = "100%";
        lightboxBody.style.display = "flex";
        lightboxBody.style.justifyContent = "center";
        lightboxBody.style.alignItems = "center";
        lightboxBody.style.overflow = "hidden";
        lightboxBody.style.margin = "4px 0";
        lightboxBody.title = "Drag this preview area to another tracker to copy prompt + embedded image!";

        lightboxBody.draggable = true;
        lightboxBody.ondragstart = (e) => {
            e.stopPropagation();
            if (selectedIndex === null || !localDb[selectedIndex]) return;
            const item = localDb[selectedIndex];
            const transferData = createPromptTransferPayload(item, node.properties.master_root, instanceUuid);
            e.dataTransfer.setData("application/rsl-prompt-transfer", JSON.stringify(transferData));
            e.dataTransfer.effectAllowed = "copy";
        };

        const lightboxImg = document.createElement("img");
        lightboxImg.style.maxWidth = "95%";
        lightboxImg.style.maxHeight = "95%";
        lightboxImg.style.objectFit = "contain";
        lightboxImg.style.borderRadius = "4px";
        lightboxImg.style.transition = "transform 0.2s ease, opacity 0.2s ease, filter 0.2s ease";
        lightboxImg.style.boxShadow = "0 8px 24px rgba(0,0,0,0.8)";
        lightboxImg.style.pointerEvents = "none";

        const lightboxHud = document.createElement("div");
        lightboxHud.style.position = "absolute";
        lightboxHud.style.bottom = "4px";
        lightboxHud.style.left = "4px";
        lightboxHud.style.right = "4px";
        lightboxHud.style.backgroundColor = "rgba(15, 23, 42, 0.94)";
        lightboxHud.style.border = `1.5px solid ${activeTheme.borderFocus || '#4f46e5'}`;
        lightboxHud.style.borderRadius = "6px";
        lightboxHud.style.padding = "6px";
        lightboxHud.style.display = "flex";
        lightboxHud.style.flexDirection = "column";
        lightboxHud.style.gap = "4px";
        lightboxHud.style.maxHeight = "60%";
        lightboxHud.style.overflowY = "auto";
        lightboxHud.style.boxShadow = "0 4px 16px rgba(0,0,0,0.8)";

        const createHudFieldLabel = (text) => {
            const l = document.createElement("div");
            l.innerText = text;
            l.style.fontSize = "9px";
            l.style.fontWeight = "bold";
            l.style.color = activeTheme.textSecondary || "#9ca3af";
            return l;
        };

        const hudPromptTitle = createHudFieldLabel("ACTIVE PROMPT (EDITABLE):");
        const hudPromptArea = document.createElement("textarea");
        hudPromptArea.style.width = "100%";
        hudPromptArea.style.height = "55px";
        hudPromptArea.style.resize = "vertical";
        styleInput(hudPromptArea, activeTheme);
        hudPromptArea.style.color = "#38bdf8";

        const hudNegTitle = createHudFieldLabel("ACTIVE NEGATIVE PROMPT (EDITABLE):");
        const hudNegArea = document.createElement("textarea");
        hudNegArea.style.width = "100%";
        hudNegArea.style.height = "40px";
        hudNegArea.style.resize = "vertical";
        styleInput(hudNegArea, activeTheme);
        hudNegArea.style.color = "#f472b6";

        const hudMetaRow1 = document.createElement("div");
        hudMetaRow1.style.display = "flex";
        hudMetaRow1.style.gap = "4px";

        const hudCatInput = document.createElement("input");
        hudCatInput.placeholder = "Category";
        styleInput(hudCatInput, activeTheme);
        hudCatInput.style.flex = "1";

        const hudModelInput = document.createElement("input");
        hudModelInput.placeholder = "Model";
        styleInput(hudModelInput, activeTheme);
        hudModelInput.style.flex = "1";

        const hudSourceInput = document.createElement("input");
        hudSourceInput.placeholder = "Source";
        styleInput(hudSourceInput, activeTheme);
        hudSourceInput.style.flex = "1";

        hudMetaRow1.appendChild(hudCatInput);
        hudMetaRow1.appendChild(hudModelInput);
        hudMetaRow1.appendChild(hudSourceInput);

        const hudMetaRow2 = document.createElement("div");
        hudMetaRow2.style.display = "flex";
        hudMetaRow2.style.gap = "4px";

        const hudLorasInput = document.createElement("input");
        hudLorasInput.placeholder = "Loras";
        styleInput(hudLorasInput, activeTheme);
        hudLorasInput.style.flex = "1";

        const hudConfigInput = document.createElement("input");
        hudConfigInput.placeholder = "Config";
        styleInput(hudConfigInput, activeTheme);
        hudConfigInput.style.flex = "1";

        const hudTagsInput = document.createElement("input");
        hudTagsInput.placeholder = "Tags";
        styleInput(hudTagsInput, activeTheme);
        hudTagsInput.style.flex = "1";

        hudMetaRow2.appendChild(hudLorasInput);
        hudMetaRow2.appendChild(hudConfigInput);
        hudMetaRow2.appendChild(hudTagsInput);

        hudPromptArea.oninput = () => { activeTextarea.value = hudPromptArea.value; updateBackendWidgets(); updateCounters(hudPromptArea.value); };
        hudNegArea.oninput = () => { activeNegativeTextarea.value = hudNegArea.value; updateBackendWidgets(); };
        hudCatInput.oninput = () => { activeSelectedCategory = hudCatInput.value; updateBackendWidgets(); };
        hudModelInput.oninput = () => { activeSelectedModel = hudModelInput.value; updateBackendWidgets(); };
        hudSourceInput.oninput = () => { sourceInput.value = hudSourceInput.value; updateBackendWidgets(); };
        hudLorasInput.oninput = () => { lorasInput.value = hudLorasInput.value; updateBackendWidgets(); };
        hudConfigInput.oninput = () => { configInput.value = hudConfigInput.value; updateBackendWidgets(); };
        hudTagsInput.oninput = () => { tagInput.value = hudTagsInput.value; updateBackendWidgets(); };

        lightboxHud.appendChild(hudPromptTitle);
        lightboxHud.appendChild(hudPromptArea);
        lightboxHud.appendChild(hudNegTitle);
        lightboxHud.appendChild(hudNegArea);
        lightboxHud.appendChild(hudMetaRow1);
        lightboxHud.appendChild(hudMetaRow2);

        lightboxBody.appendChild(lightboxImg);
        lightboxBody.appendChild(lightboxHud);

        const lightboxNavRow = document.createElement("div");
        lightboxNavRow.style.display = "flex";
        lightboxNavRow.style.justifyContent = "space-between";
        lightboxNavRow.style.alignItems = "center";
        lightboxNavRow.style.width = "100%";
        lightboxNavRow.style.gap = "8px";
        lightboxNavRow.style.flexShrink = "0";

        const prevImgBtn = document.createElement("button");
        prevImgBtn.innerText = "◄ Prev (←)";
        styleButton(prevImgBtn, false, activeTheme);

        const lightboxRightActionGroup = document.createElement("div");
        lightboxRightActionGroup.style.display = "flex";
        lightboxRightActionGroup.style.alignItems = "center";
        lightboxRightActionGroup.style.gap = "8px";

        const lightboxEmbedLabel = document.createElement("label");
        lightboxEmbedLabel.style.display = "flex";
        lightboxEmbedLabel.style.alignItems = "center";
        lightboxEmbedLabel.style.gap = "4px";
        lightboxEmbedLabel.style.fontSize = "10px";
        lightboxEmbedLabel.style.cursor = "pointer";

        const lightboxEmbedCheck = document.createElement("input");
        lightboxEmbedCheck.type = "checkbox";
        lightboxEmbedCheck.checked = false;
        lightboxEmbedCheck.style.cursor = "pointer";

        const lightboxEmbedLabelText = document.createElement("span");
        lightboxEmbedLabelText.innerText = "Embed (OFF)";
        lightboxEmbedLabelText.style.color = activeTheme.textSecondary || "#9ca3af";

        lightboxEmbedCheck.onchange = (e) => {
            e.stopPropagation();
            embedCheck.checked = lightboxEmbedCheck.checked;
            embedLabelText.innerText = lightboxEmbedCheck.checked ? "Embed Image (ON)" : "Embed Image (OFF)";
            lightboxEmbedLabelText.innerText = lightboxEmbedCheck.checked ? "Embed (ON)" : "Embed (OFF)";
        };

        lightboxEmbedLabel.appendChild(lightboxEmbedCheck);
        lightboxEmbedLabel.appendChild(lightboxEmbedLabelText);

        const updateActiveBtn = document.createElement("button");
        updateActiveBtn.innerText = "💾 Save/Update Prompt & Image";
        styleButton(updateActiveBtn, false, activeTheme);
        updateActiveBtn.style.fontWeight = "bold";

        const lightboxDeleteBtn = document.createElement("button");
        lightboxDeleteBtn.innerText = "🗑️ Delete";
        styleButton(lightboxDeleteBtn, true, activeTheme);
        lightboxDeleteBtn.style.fontWeight = "bold";

        lightboxDeleteBtn.onclick = async (e) => {
            e.stopPropagation();
            if (selectedIndex === null || !localDb[selectedIndex]) return;

            const targetIndex = selectedIndex;
            const currentItem = localDb[targetIndex];

            const del = async () => {
                lightboxImg.style.opacity = "0.7";
                lightboxImg.style.filter = "brightness(0.5)";

                const res = await api.fetchApi("/prompt_tracker/delete", {
                    method: "POST",
                    body: JSON.stringify({
                        db: currentDbName,
                        id: currentItem.id,
                        index: targetIndex,
                        master_root: node.properties.master_root,
                        instance_uuid: instanceUuid
                    })
                });
                const data = await res.json();
                if (data.status === "success") {
                    localDb = data.db;
                    await prefetchImagesAsBase64(localDb);
                    updateCategoryDropdowns();
                    renderList();

                    const visible = getVisibleRows();
                    if (visible.length > 0) {
                        let nextVizIdx = visible.findIndex(r => r.originalIndex >= targetIndex);
                        if (nextVizIdx === -1) nextVizIdx = visible.length - 1;
                        selectItemByIndex(nextVizIdx, visible);

                        if (currentImageInfo.image) {
                            lightboxImg.src = getProxiedImageUrl(currentImageInfo.image);
                        } else {
                            lightboxImg.src = "";
                        }
                        applyRotation(0, true);
                        updateLightboxHudFields();

                        lightboxImg.style.opacity = "1";
                        lightboxImg.style.filter = "none";
                        lightboxOverlay.focus();
                    } else {
                        selectedIndex = null;
                        setActiveSelection("", "", null, false);
                        lightboxOverlay.style.display = "none";
                    }
                    setStatus(`Deleted prompt #${targetIndex + 1}`);
                }
            };

            if (e.shiftKey) {
                await del();
            } else {
                showThemedModal(`Delete prompt #${targetIndex + 1}?`, "", null, del, false);
            }
        };

        lightboxRightActionGroup.appendChild(lightboxEmbedLabel);
        lightboxRightActionGroup.appendChild(updateActiveBtn);
        lightboxRightActionGroup.appendChild(lightboxDeleteBtn);

        const nextImgBtn = document.createElement("button");
        nextImgBtn.innerText = "Next (→) ►";
        styleButton(nextImgBtn, false, activeTheme);

        lightboxNavRow.appendChild(prevImgBtn);
        lightboxNavRow.appendChild(lightboxRightActionGroup);
        lightboxNavRow.appendChild(nextImgBtn);

        lightboxOverlay.appendChild(lightboxHeader);
        lightboxOverlay.appendChild(lightboxBody);
        lightboxOverlay.appendChild(lightboxNavRow);
        container.appendChild(lightboxOverlay);

        function applyRotation(angleDelta = 0, reset = false) {
            if (reset) currentRotationAngle = 0;
            else currentRotationAngle = (currentRotationAngle + angleDelta + 360) % 360;
            lightboxImg.style.transform = `rotate(${currentRotationAngle}deg)`;
        }

        function updateLightboxHudFields() {
            hudPromptArea.value = activeTextarea.value;
            hudNegArea.value = activeNegativeTextarea.value;
            hudCatInput.value = activeSelectedCategory;
            hudModelInput.value = activeSelectedModel;
            hudSourceInput.value = sourceInput.value;
            hudLorasInput.value = lorasInput.value;
            hudConfigInput.value = configInput.value;
            hudTagsInput.value = tagInput.value;
            lightboxEmbedCheck.checked = embedCheck.checked;
            lightboxEmbedLabelText.innerText = embedCheck.checked ? "Embed (ON)" : "Embed (OFF)";
        }

        function openLightboxForCurrentSelection() {
            if (currentImageInfo.image) {
                const imgUrl = currentImageInfo.image;
                lightboxImg.src = getProxiedImageUrl(imgUrl);
                lightboxImg.style.opacity = "1";
                lightboxImg.style.filter = "none";
                applyRotation(0, true);
                updateLightboxHudFields();
                lightboxOverlay.style.display = "flex";
                lightboxOverlay.focus();
                setStatus("Opened preview lightbox HUD");
            } else {
                setStatus("No image available to preview", true);
            }
        }

        function navigateVisibleItems(direction) {
            const visible = getVisibleRows();
            if (visible.length === 0) return;

            let currentIdx = visible.findIndex(r => r.originalIndex === selectedIndex);
            let nextIdx = 0;
            if (currentIdx !== -1) {
                nextIdx = (currentIdx + direction + visible.length) % visible.length;
            }

            selectItemByIndex(nextIdx, visible);
            if (currentImageInfo.image) {
                lightboxImg.src = getProxiedImageUrl(currentImageInfo.image);
            } else {
                lightboxImg.src = "";
            }
            applyRotation(0, true);
            updateLightboxHudFields();
        }

        lightboxHudToggleBtn.onclick = (e) => {
            e.stopPropagation();
            lightboxHud.style.display = lightboxHud.style.display === "none" ? "flex" : "none";
        };

        lightboxRotateCcwBtn.onclick = (e) => { e.stopPropagation(); applyRotation(-90); };
        lightboxRotateCwBtn.onclick = (e) => { e.stopPropagation(); applyRotation(90); };
        lightboxCloseBtn.onclick = (e) => { e.stopPropagation(); lightboxOverlay.style.display = "none"; };

        prevImgBtn.onclick = (e) => { e.stopPropagation(); navigateVisibleItems(-1); };
        nextImgBtn.onclick = (e) => { e.stopPropagation(); navigateVisibleItems(1); };

        updateActiveBtn.onclick = async (e) => {
            e.stopPropagation();

            if (lightboxImg.src) {
                if (currentRotationAngle !== 0 && lightboxImg.naturalWidth > 0) {
                    try {
                        const canvas = document.createElement("canvas");
                        const ctx = canvas.getContext("2d");
                        const rads = (currentRotationAngle * Math.PI) / 180;
                        const is90or270 = Math.abs(currentRotationAngle % 180) === 90;

                        canvas.width = is90or270 ? lightboxImg.naturalHeight : lightboxImg.naturalWidth;
                        canvas.height = is90or270 ? lightboxImg.naturalWidth : lightboxImg.naturalHeight;

                        ctx.translate(canvas.width / 2, canvas.height / 2);
                        ctx.rotate(rads);
                        ctx.drawImage(lightboxImg, -lightboxImg.naturalWidth / 2, -lightboxImg.naturalHeight / 2);

                        currentImageInfo.image = canvas.toDataURL("image/png");
                        currentRotationAngle = 0;
                        lightboxImg.style.transform = `rotate(0deg)`;
                    } catch (err) {
                        console.error("Canvas rotation baking error, falling back to source:", err);
                        currentImageInfo.image = lightboxImg.src;
                    }
                } else {
                    currentImageInfo.image = lightboxImg.src;
                }
            }

            embedCheck.checked = lightboxEmbedCheck.checked;
            embedLabelText.innerText = embedCheck.checked ? "Embed Image (ON)" : "Embed Image (OFF)";

            if (embedCheck.checked && currentImageInfo.image && !currentImageInfo.image.startsWith("data:") && !currentImageInfo.image.startsWith("http")) {
                try {
                    const res = await fetch(getProxiedImageUrl(currentImageInfo.image));
                    const blob = await res.blob();
                    currentImageInfo.image = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.readAsDataURL(blob);
                    });
                } catch (err) {
                    console.error("Failed to convert server image to embedded base64 data URI:", err);
                }
            }

            activeTextarea.value = hudPromptArea.value;
            activeNegativeTextarea.value = hudNegArea.value;
            activeSelectedCategory = hudCatInput.value || "General";
            activeSelectedModel = hudModelInput.value || "undefined";
            sourceInput.value = hudSourceInput.value;
            lorasInput.value = hudLorasInput.value;
            configInput.value = hudConfigInput.value;
            tagInput.value = hudTagsInput.value;

            updateBackendWidgets();

            if (updateBtn.onclick) await updateBtn.onclick(e);

            if (currentImageInfo.image) {
                lightboxImg.src = getProxiedImageUrl(currentImageInfo.image);
            }

            setImageInfo(currentImageInfo, embedCheck.checked);
            updateLightboxHudFields();
            await fetchAndRender();
            setStatus("Saved prompt and image updates successfully!");
        };

        lightboxOverlay.onkeydown = (e) => {
            if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") {
                return;
            }
            if (e.key === "ArrowLeft") {
                e.preventDefault();
                e.stopPropagation();
                if (e.shiftKey) applyRotation(-90);
                else navigateVisibleItems(-1);
            } else if (e.key === "ArrowRight") {
                e.preventDefault();
                e.stopPropagation();
                if (e.shiftKey) applyRotation(90);
                else navigateVisibleItems(1);
            } else if (e.key.toLowerCase() === "h") {
                e.preventDefault();
                e.stopPropagation();
                lightboxHud.style.display = lightboxHud.style.display === "none" ? "flex" : "none";
            } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                lightboxOverlay.style.display = "none";
            }
        };

        const dirModalOverlay = document.createElement("div");
        dirModalOverlay.style.position = "absolute";
        dirModalOverlay.style.top = "0";
        dirModalOverlay.style.left = "0";
        dirModalOverlay.style.width = "100%";
        dirModalOverlay.style.height = "100%";
        dirModalOverlay.style.backgroundColor = "rgba(10, 5, 20, 0.9)";
        dirModalOverlay.style.backdropFilter = "blur(3px)";
        dirModalOverlay.style.display = "none";
        dirModalOverlay.style.flexDirection = "column";
        dirModalOverlay.style.justifyContent = "center";
        dirModalOverlay.style.alignItems = "center";
        dirModalOverlay.style.zIndex = "60";
        dirModalOverlay.style.borderRadius = "8px";
        dirModalOverlay.style.padding = "16px";
        dirModalOverlay.style.boxSizing = "border-box";

        const dirModalBox = document.createElement("div");
        dirModalBox.style.backgroundColor = activeTheme.bgCard;
        dirModalBox.style.border = `1.5px solid ${activeTheme.borderFocus}`;
        dirModalBox.style.borderRadius = "8px";
        dirModalBox.style.padding = "14px";
        dirModalBox.style.display = "flex";
        dirModalBox.style.flexDirection = "column";
        dirModalBox.style.gap = "10px";
        dirModalBox.style.width = "100%";
        dirModalBox.style.maxWidth = "400px";
        dirModalBox.style.height = "380px";
        dirModalBox.style.boxShadow = "0 8px 24px rgba(0,0,0,0.7)";

        const dirModalHeader = document.createElement("div");
        dirModalHeader.style.display = "flex";
        dirModalHeader.style.justifyContent = "space-between";
        dirModalHeader.style.alignItems = "center";

        const dirModalTitle = document.createElement("div");
        dirModalTitle.innerText = "Select Instance Directory";
        dirModalTitle.style.fontWeight = "bold";
        dirModalTitle.style.fontSize = "13px";
        dirModalTitle.style.color = "#facc15";

        const drivesBtn = document.createElement("button");
        drivesBtn.innerText = "💻 Drives";
        styleButton(drivesBtn, false, activeTheme);
        drivesBtn.style.padding = "3px 8px";
        dirModalHeader.appendChild(dirModalTitle);
        dirModalHeader.appendChild(drivesBtn);

        const dirPathInput = document.createElement("input");
        dirPathInput.style.width = "100%";
        styleInput(dirPathInput, activeTheme);

        const dirListContainer = document.createElement("div");
        dirListContainer.style.flex = "1";
        dirListContainer.style.overflowY = "auto";
        dirListContainer.style.border = `1px solid ${activeTheme.border}`;
        dirListContainer.style.borderRadius = "4px";
        dirListContainer.style.padding = "6px";
        dirListContainer.style.backgroundColor = activeTheme.bgList || "#121212";
        dirListContainer.style.display = "flex";
        dirListContainer.style.flexDirection = "column";
        dirListContainer.style.gap = "3px";

        const dirModalBtnGroup = document.createElement("div");
        dirModalBtnGroup.style.display = "flex";
        dirModalBtnGroup.style.gap = "8px";
        dirModalBtnGroup.style.justifyContent = "flex-end";

        const dirCancelBtn = document.createElement("button");
        dirCancelBtn.innerText = "Cancel";
        styleButton(dirCancelBtn, true, activeTheme);

        const dirSelectBtn = document.createElement("button");
        dirSelectBtn.innerText = "Select This Folder";
        styleButton(dirSelectBtn, false, activeTheme);
        dirSelectBtn.style.backgroundColor = "#22c55e";

        dirModalBtnGroup.appendChild(dirCancelBtn);
        dirModalBtnGroup.appendChild(dirSelectBtn);

        dirModalBox.appendChild(dirModalHeader);
        dirModalBox.appendChild(dirPathInput);
        dirModalBox.appendChild(dirListContainer);
        dirModalBox.appendChild(dirModalBtnGroup);
        dirModalOverlay.appendChild(dirModalBox);
        container.appendChild(dirModalOverlay);

        let browsingPath = "";

        async function loadDirectory(targetPath) {
            try {
                const res = await api.fetchApi("/prompt_tracker/browse_dirs", {
                    method: "POST",
                    body: JSON.stringify({ path: targetPath })
                });
                const data = await res.json();
                if (data.error) {
                    setStatus(data.error, true);
                    return;
                }
                browsingPath = data.current;
                dirPathInput.value = browsingPath;
                dirListContainer.innerHTML = "";

                if (!data.is_drive_list && browsingPath) {
                    const parentRow = document.createElement("div");
                    parentRow.innerText = "📁 .. (Parent Directory)";
                    parentRow.style.padding = "6px 8px";
                    parentRow.style.cursor = "pointer";
                    parentRow.style.borderRadius = "4px";
                    parentRow.style.color = "#facc15";
                    parentRow.style.fontWeight = "bold";
                    parentRow.onmouseenter = () => parentRow.style.backgroundColor = activeTheme.selectedRow || "#3730a3";
                    parentRow.onmouseleave = () => parentRow.style.backgroundColor = "transparent";
                    parentRow.onclick = () => {
                        const parent = browsingPath.substring(0, browsingPath.lastIndexOf(window.navigator.platform.includes("Win") ? "\\" : "/"));
                        loadDirectory(parent);
                    };
                    dirListContainer.appendChild(parentRow);
                }

                data.dirs.forEach(dirName => {
                    const row = document.createElement("div");
                    row.innerText = `📁 ${dirName}`;
                    row.style.padding = "6px 8px";
                    row.style.cursor = "pointer";
                    row.style.borderRadius = "4px";
                    row.style.fontSize = `${promptFontSize}px`;
                    row.onmouseenter = () => row.style.backgroundColor = activeTheme.selectedRow || "#3730a3";
                    row.onmouseleave = () => row.style.backgroundColor = "transparent";

                    const fullSubPath = data.is_drive_list ? dirName : (browsingPath.endsWith("/") || browsingPath.endsWith("\\") ? browsingPath + dirName : browsingPath + (window.navigator.platform.includes("Win") ? "\\" : "/") + dirName);

                    row.onclick = () => loadDirectory(fullSubPath);
                    row.ondblclick = () => loadDirectory(fullSubPath);
                    dirListContainer.appendChild(row);
                });
            } catch (err) {
                setStatus("Failed to load directory", true);
            }
        }

        drivesBtn.onclick = (e) => {
            e.stopPropagation();
            loadDirectory("");
        };

        dirCancelBtn.onclick = (e) => {
            e.stopPropagation();
            dirModalOverlay.style.display = "none";
        };

        dirSelectBtn.onclick = async (e) => {
            e.stopPropagation();
            const chosenPath = dirPathInput.value.trim();
            if (!chosenPath) return;

            if (currentDirModalMode === "export") {
                dirModalOverlay.style.display = "none";
                setStatus("Exporting images...");
                try {
                    const res = await api.fetchApi("/prompt_tracker/export_images", {
                        method: "POST",
                        body: JSON.stringify({
                            db: currentDbName,
                            export_path: chosenPath,
                            master_root: node.properties.master_root
                        })
                    });
                    const data = await res.json();
                    if (data.status === "success") {
                        setStatus(data.message || "Exported images successfully!");
                    } else {
                        setStatus(data.message || "Export failed", true);
                    }
                } catch (err) {
                    setStatus("Failed to export images", true);
                }
            } else {
                node.properties.master_root = chosenPath;
                masterPathInput.value = chosenPath;
                masterPathInput.title = chosenPath;
                currentDbName = "prompts_db";
                node.properties.selected_database = currentDbName;
                updateBackendWidgets();
                selectedIndex = null;
                setActiveSelection("", "", null, false);
                await updateDbDropdown();
                await fetchAndRender(true);
                setStatus(`Set Instance Root to: '${chosenPath}'`);
                dirModalOverlay.style.display = "none";
            }
        };

        const modalOverlay = document.createElement("div");
        modalOverlay.style.position = "absolute";
        modalOverlay.style.top = "0";
        modalOverlay.style.left = "0";
        modalOverlay.style.width = "100%";
        modalOverlay.style.height = "100%";
        modalOverlay.style.backgroundColor = "rgba(10, 5, 20, 0.88)";
        modalOverlay.style.backdropFilter = "blur(2px)";
        modalOverlay.style.display = "none";
        modalOverlay.style.flexDirection = "column";
        modalOverlay.style.justifyContent = "center";
        modalOverlay.style.alignItems = "center";
        modalOverlay.style.zIndex = "50";
        modalOverlay.style.borderRadius = "8px";
        modalOverlay.style.padding = "12px";
        modalOverlay.style.boxSizing = "border-box";

        const modalBox = document.createElement("div");
        modalBox.style.backgroundColor = activeTheme.bgCard;
        modalBox.style.border = `1.5px solid ${activeTheme.borderFocus}`;
        modalBox.style.borderRadius = "6px";
        modalBox.style.padding = "12px 16px";
        modalBox.style.display = "flex";
        modalBox.style.flexDirection = "column";
        modalBox.style.gap = "8px";
        modalBox.style.alignItems = "center";
        modalBox.style.boxShadow = "0 4px 12px rgba(0,0,0,0.5)";
        modalBox.style.width = "100%";
        modalBox.style.maxWidth = "280px";

        const modalTitle = document.createElement("div");
        modalTitle.style.fontWeight = "bold";
        modalTitle.style.fontSize = "11px";
        modalTitle.style.color = activeTheme.textPrimary;
        modalTitle.style.textAlign = "center";

        const modalInput = document.createElement("input");
        modalInput.style.width = "100%";
        styleInput(modalInput, activeTheme);

        const modalSelect = document.createElement("select");
        modalSelect.style.width = "100%";
        modalSelect.style.display = "none";
        styleInput(modalSelect, activeTheme);

        const modalBtnGroup = document.createElement("div");
        modalBtnGroup.style.display = "flex";
        modalBtnGroup.style.gap = "8px";
        modalBtnGroup.style.marginTop = "4px";

        const modalConfirmBtn = document.createElement("button");
        modalConfirmBtn.innerText = "Confirm";
        styleButton(modalConfirmBtn, false, activeTheme);

        const modalCancelBtn = document.createElement("button");
        modalCancelBtn.innerText = "Cancel";
        styleButton(modalCancelBtn, true, activeTheme);

        modalBtnGroup.appendChild(modalConfirmBtn);
        modalBtnGroup.appendChild(modalCancelBtn);
        modalBox.appendChild(modalTitle);
        modalBox.appendChild(modalInput);
        modalBox.appendChild(modalSelect);
        modalBox.appendChild(modalBtnGroup);
        modalOverlay.appendChild(modalBox);
        container.appendChild(modalOverlay);

        function showThemedModal(titleText, defaultVal, optionsList, onConfirm, showInput = true) {
            modalTitle.innerText = titleText;
            const isSelectMode = optionsList && optionsList.length > 0;

            modalInput.style.display = (!isSelectMode && showInput) ? "block" : "none";
            modalSelect.style.display = isSelectMode ? "block" : "none";

            if (isSelectMode) {
                modalSelect.innerHTML = "";
                optionsList.forEach(opt => {
                    const el = document.createElement("option");
                    el.value = opt;
                    el.innerText = opt;
                    if (opt === defaultVal) el.selected = true;
                    modalSelect.appendChild(el);
                });
            } else if (showInput) {
                modalInput.value = defaultVal || "";
            }

            modalOverlay.style.display = "flex";
            if (!isSelectMode && showInput) {
                modalInput.focus();
                modalInput.select();
            }

            const triggerConfirm = async () => {
                modalOverlay.style.display = "none";
                const val = isSelectMode ? modalSelect.value : (showInput ? modalInput.value.trim() : null);
                await onConfirm(val);
                if (lightboxOverlay.style.display === "flex") {
                    lightboxOverlay.focus();
                } else {
                    listContainer.focus();
                }
            };

            modalConfirmBtn.onclick = async (e) => {
                e.stopPropagation();
                await triggerConfirm();
            };

            modalInput.onkeydown = async (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    await triggerConfirm();
                } else if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    modalOverlay.style.display = "none";
                    if (lightboxOverlay.style.display === "flex") lightboxOverlay.focus();
                }
            };

            modalCancelBtn.onclick = (e) => {
                e.stopPropagation();
                modalOverlay.style.display = "none";
                if (lightboxOverlay.style.display === "flex") lightboxOverlay.focus();
            };
        }

        function createActionDropdown(headerText, getItems, getActiveVal, onSelectVal, onAddVal, onDelVal, isModelDropdown = false) {
            const dropdownWrapper = document.createElement("div");
            dropdownWrapper.style.position = "relative";
            dropdownWrapper.style.flex = "1";

            const displayBtn = document.createElement("button");
            displayBtn.style.width = "100%";
            displayBtn.style.textAlign = "left";
            displayBtn.style.display = "flex";
            displayBtn.style.justifyContent = "space-between";
            displayBtn.style.alignItems = "center";
            styleInput(displayBtn, activeTheme);
            displayBtn.style.cursor = "pointer";

            const displaySpan = document.createElement("span");
            const arrowSpan = document.createElement("span");
            arrowSpan.innerText = "▼";
            arrowSpan.style.fontSize = "8px";
            displayBtn.appendChild(displaySpan);
            displayBtn.appendChild(arrowSpan);

            const popupList = document.createElement("div");
            popupList.style.position = "absolute";
            popupList.style.top = "100%";
            popupList.style.left = "0";
            popupList.style.width = "100%";
            popupList.style.backgroundColor = activeTheme.bgCard;
            popupList.style.border = `1px solid ${activeTheme.borderFocus}`;
            popupList.style.borderRadius = "4px";
            popupList.style.zIndex = "20";
            popupList.style.display = "none";
            popupList.style.flexDirection = "column";
            popupList.style.maxHeight = "160px";
            popupList.style.overflowY = "auto";
            popupList.style.boxShadow = "0 4px 10px rgba(0,0,0,0.5)";

            dropdownWrapper.applyTheme = () => {
                styleInput(displayBtn, activeTheme);
                popupList.style.backgroundColor = activeTheme.bgCard;
                popupList.style.border = `1px solid ${activeTheme.borderFocus}`;
            };

            function renderDropdownItems() {
                popupList.innerHTML = "";
                const items = getItems().filter(i => {
                    const lower = i.toLowerCase();
                    return lower !== "auto captured" && lower !== "autocaptured";
                });
                const currentVal = getActiveVal();
                displaySpan.innerText = currentVal || headerText;

                const headerEl = document.createElement("div");
                headerEl.innerText = headerText;
                headerEl.style.padding = "4px 8px";
                headerEl.style.fontSize = `${Math.max(9, promptFontSize - 2)}px`;
                headerEl.style.color = activeTheme.textSecondary || "#9ca3af";
                headerEl.style.fontWeight = "bold";
                headerEl.style.borderBottom = `1px solid ${activeTheme.border}`;
                popupList.appendChild(headerEl);

                items.forEach(item => {
                    const itemRow = document.createElement("div");
                    itemRow.style.display = "flex";
                    itemRow.style.justifyContent = "space-between";
                    itemRow.style.alignItems = "center";
                    itemRow.style.padding = "4px 8px";
                    itemRow.style.cursor = "pointer";
                    itemRow.style.fontSize = `${promptFontSize}px`;
                    const rowHighlight = activeTheme.selectedRow || "#3730a3";
                    if (item === currentVal) {
                        itemRow.style.backgroundColor = rowHighlight;
                        itemRow.style.fontWeight = "bold";
                    }

                    itemRow.onmouseenter = () => itemRow.style.backgroundColor = rowHighlight;
                    itemRow.onmouseleave = () => itemRow.style.backgroundColor = (item === currentVal) ? rowHighlight : "transparent";

                    const itemTitle = document.createElement("span");
                    itemTitle.innerText = item;
                    itemRow.appendChild(itemTitle);

                    const nonDeletable = isModelDropdown ? "undefined" : "General";
                    if (item !== nonDeletable) {
                        const itemTrashBtn = document.createElement("button");
                        itemTrashBtn.innerText = "🗑️";
                        itemTrashBtn.style.background = "none";
                        itemTrashBtn.style.border = "none";
                        itemTrashBtn.style.cursor = "pointer";
                        itemTrashBtn.style.fontSize = `${Math.max(9, promptFontSize - 1)}px`;
                        itemTrashBtn.style.padding = "0 2px";
                        itemTrashBtn.style.opacity = "0.7";

                        itemTrashBtn.onclick = async (e) => {
                            e.stopPropagation();
                            popupList.style.display = "none";
                            await onDelVal(item, e.shiftKey);
                        };
                        itemRow.appendChild(itemTrashBtn);
                    }

                    itemRow.onclick = (e) => {
                        e.stopPropagation();
                        onSelectVal(item);
                        popupList.style.display = "none";
                        renderDropdownItems();
                    };
                    popupList.appendChild(itemRow);
                });

                const addRow = document.createElement("div");
                addRow.innerText = "➕ Add New...";
                addRow.style.padding = "4px 8px";
                addRow.style.cursor = "pointer";
                addRow.style.fontSize = `${promptFontSize}px`;
                addRow.style.fontWeight = "bold";
                addRow.style.color = activeTheme.blueBoxTitle || "#38bdf8";
                addRow.style.borderTop = `1px solid ${activeTheme.border}`;

                addRow.onclick = async (e) => {
                    e.stopPropagation();
                    popupList.style.display = "none";
                    await onAddVal();
                };
                popupList.appendChild(addRow);
            }

            displayBtn.onclick = (e) => {
                e.stopPropagation();
                const isVisible = popupList.style.display === "flex";
                document.querySelectorAll(".rsl-custom-dropdown").forEach(el => el.style.display = "none");
                if (!isVisible) {
                    renderDropdownItems();
                    popupList.style.display = "flex";
                }
            };

            popupList.classList.add("rsl-custom-dropdown");
            dropdownWrapper.appendChild(displayBtn);
            dropdownWrapper.appendChild(popupList);
            dropdownWrapper.updateDisplay = renderDropdownItems;
            return dropdownWrapper;
        }

        document.addEventListener("click", () => {
            document.querySelectorAll(".rsl-custom-dropdown").forEach(el => el.style.display = "none");
        });

        const topToolbar = document.createElement("div");
        topToolbar.style.display = "flex";
        topToolbar.style.justifyContent = "space-between";
        topToolbar.style.alignItems = "center";
        topToolbar.style.flexShrink = "0";

        const counterBadge = document.createElement("div");
        counterBadge.innerText = "[0 / 0]  |  0 chars | ~0 words";
        counterBadge.style.fontSize = "10px";
        counterBadge.style.color = activeTheme.blueBoxTitle;

        const toolBtnGroup = document.createElement("div");
        toolBtnGroup.style.display = "flex";
        toolBtnGroup.style.alignItems = "center";
        toolBtnGroup.style.gap = "4px";

        const toggleLabel = document.createElement("label");
        toggleLabel.style.display = "flex";
        toggleLabel.style.alignItems = "center";
        toggleLabel.style.gap = "3px";
        toggleLabel.style.fontSize = "10px";
        toggleLabel.style.cursor = "pointer";

        const toggleCheck = document.createElement("input");
        toggleCheck.type = "checkbox";
        toggleCheck.checked = autoCaptureState;
        toggleCheck.style.cursor = "pointer";

        const toggleLabelText = document.createElement("span");
        toggleLabelText.innerText = autoCaptureState ? "Auto-Capture ON" : "Auto-Capture OFF";
        toggleLabelText.style.color = autoCaptureState ? activeTheme.textSource || "#38bdf8" : "#f472b6";
        toggleLabelText.style.fontWeight = "bold";

        toggleCheck.onchange = (e) => {
            e.stopPropagation();
            autoCaptureState = toggleCheck.checked;
            updateBackendWidgets();
            toggleLabelText.innerText = autoCaptureState ? "Auto-Capture ON" : "Auto-Capture OFF";
            toggleLabelText.style.color = autoCaptureState ? activeTheme.textSource : "#f472b6";
            setStatus(`Auto-capture ${autoCaptureState ? "ENABLED" : "DISABLED"}`);
        };

        toggleLabel.appendChild(toggleCheck);
        toggleLabel.appendChild(toggleLabelText);

        const fontDownBtn = document.createElement("button");
        fontDownBtn.innerText = "A-";
        styleButton(fontDownBtn, false, activeTheme);
        fontDownBtn.onclick = (e) => {
            e.stopPropagation();
            promptFontSize = Math.max(9, promptFontSize - 1);
        };

        const fontUpBtn = document.createElement("button");
        fontUpBtn.innerText = "A+";
        styleButton(fontUpBtn, false, activeTheme);
        fontUpBtn.onclick = (e) => {
            e.stopPropagation();
            promptFontSize = Math.min(24, promptFontSize + 1);
        };

        const themeDropdown = createThemeDropdown(node, activeTheme, (newTheme, themeKey) => {
            activeTheme = newTheme;
            node.properties.activeTheme = themeKey;
            applyThemeStyles();
            setStatus(`Applied theme: ${themeKey}`);
        });

        const copyBtn = document.createElement("button");
        copyBtn.innerText = "📋 Copy";
        styleButton(copyBtn, false, activeTheme);
        copyBtn.onclick = (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(activeTextarea.value);
            copyBtn.innerText = "✓ Copied!";
            setStatus("Copied active prompt to clipboard");
            setTimeout(() => copyBtn.innerText = "📋 Copy", 1200);
        };

        toolBtnGroup.appendChild(toggleLabel);
        toolBtnGroup.appendChild(fontDownBtn);
        toolBtnGroup.appendChild(fontUpBtn);
        toolBtnGroup.appendChild(themeDropdown);
        toolBtnGroup.appendChild(copyBtn);
        topToolbar.appendChild(counterBadge);
        topToolbar.appendChild(toolBtnGroup);
        container.appendChild(topToolbar);

        const masterRow = document.createElement("div");
        masterRow.style.display = "flex";
        masterRow.style.gap = "4px";
        masterRow.style.alignItems = "center";
        masterRow.style.flexShrink = "0";

        const masterBtn = document.createElement("button");
        masterBtn.innerText = "📁 Master Root";
        styleButton(masterBtn, false, activeTheme);
        masterBtn.style.fontWeight = "bold";

        const masterPathInput = document.createElement("input");
        masterPathInput.readOnly = true;
        masterPathInput.style.flex = "1";
        styleInput(masterPathInput, activeTheme);
        masterPathInput.placeholder = "Select root directory...";

        masterBtn.onclick = async (e) => {
            e.stopPropagation();
            currentDirModalMode = "master";
            dirModalTitle.innerText = "Select Instance Directory";
            dirModalOverlay.style.display = "flex";
            await loadDirectory(masterPathInput.value || node.properties.master_root || "");
            setStatus("Opened folder selection window");
        };

        masterRow.appendChild(masterBtn);
        masterRow.appendChild(masterPathInput);
        container.appendChild(masterRow);

        const dbRow = document.createElement("div");
        dbRow.style.display = "flex";
        dbRow.style.gap = "4px";
        dbRow.style.alignItems = "center";
        dbRow.style.flexShrink = "0";

        const dbSelect = document.createElement("select");
        dbSelect.style.flex = "1";
        styleInput(dbSelect, activeTheme);

        dbSelect.onchange = async (e) => {
            e.stopPropagation();
            currentDbName = dbSelect.value;
            node.properties.selected_database = currentDbName;
            updateBackendWidgets();
            selectedIndex = null;
            node.properties.selected_prompt_text = null;
            setActiveSelection("", "", null, false);
            await fetchAndRender(true);
            setStatus(`Switched DB to: '${currentDbName}'`);
        };

        const refreshDbBtn = document.createElement("button");
        refreshDbBtn.innerText = "🔄";
        styleButton(refreshDbBtn, false, activeTheme);
        refreshDbBtn.onclick = async (e) => {
            e.stopPropagation();
            await fetchAndRender(false);
            setStatus("Refreshed database view");
        };

        const newDbBtn = document.createElement("button");
        newDbBtn.innerText = "+ New";
        styleButton(newDbBtn, false, activeTheme);
        newDbBtn.onclick = (e) => {
            e.stopPropagation();
            showThemedModal("Create New Database Name:", "", null, async (newDb) => {
                if (!newDb) return;
                await api.fetchApi("/prompt_tracker/new_db", {
                    method: "POST",
                    body: JSON.stringify({ db: newDb, master_root: node.properties.master_root, instance_uuid: instanceUuid })
                });
                currentDbName = newDb;
                node.properties.selected_database = currentDbName;
                updateBackendWidgets();
                selectedIndex = null;
                node.properties.selected_prompt_text = null;
                setActiveSelection("", "", null, false);
                await updateDbDropdown();
                await fetchAndRender(true);
                setStatus(`Created & Switched to DB: '${newDb}'`);
            }, true);
        };

        const renameDbBtn = document.createElement("button");
        renameDbBtn.innerText = "✏️ DB";
        styleButton(renameDbBtn, false, activeTheme);
        renameDbBtn.onclick = (e) => {
            e.stopPropagation();
            showThemedModal(`Rename DB '${currentDbName}' to:`, currentDbName, null, async (newName) => {
                if (!newName || newName === currentDbName) return;
                await api.fetchApi("/prompt_tracker/rename_db", {
                    method: "POST",
                    body: JSON.stringify({ old_db: currentDbName, new_db: newName, master_root: node.properties.master_root, instance_uuid: instanceUuid })
                });
                currentDbName = newName;
                node.properties.selected_database = currentDbName;
                updateBackendWidgets();
                await updateDbDropdown();
                await fetchAndRender(false);
                setStatus(`Renamed DB to: '${newName}'`);
            }, true);
        };

        const cleanOrphansBtn = document.createElement("button");
        cleanOrphansBtn.innerText = "🧹 Clean";
        cleanOrphansBtn.title = "Purge unreferenced orphaned images from disk";
        styleButton(cleanOrphansBtn, false, activeTheme);
        cleanOrphansBtn.onclick = async (e) => {
            e.stopPropagation();
            try {
                const res = await api.fetchApi("/prompt_tracker/clean_orphans", {
                    method: "POST",
                    body: JSON.stringify({ master_root: node.properties.master_root, instance_uuid: instanceUuid })
                });
                const data = await res.json();
                setStatus(data.message || "Cleaned orphans");
            } catch (err) {
                setStatus("Failed to clean orphaned images", true);
            }
        };

        const auditDbBtn = document.createElement("button");
        auditDbBtn.innerText = "🔍 Audit";
        auditDbBtn.title = "Audit current database for broken image links\n(Shift + Click to audit ALL databases globally)";
        styleButton(auditDbBtn, false, activeTheme);
        auditDbBtn.onclick = async (e) => {
            e.stopPropagation();
            const isGlobal = e.shiftKey;
            try {
                const res = await api.fetchApi("/prompt_tracker/audit_images", {
                    method: "POST",
                    body: JSON.stringify({ db: currentDbName, global: isGlobal, master_root: node.properties.master_root, instance_uuid: instanceUuid })
                });
                const data = await res.json();
                await fetchAndRender(false);
                setStatus(data.message || "Audited database(s)");
            } catch (err) {
                setStatus("Failed to audit database images", true);
            }
        };

        const exportImagesBtn = document.createElement("button");
        exportImagesBtn.innerText = "📤 Export";
        exportImagesBtn.title = "Export all images in current database to a selected directory";
        styleButton(exportImagesBtn, false, activeTheme);
        exportImagesBtn.onclick = async (e) => {
            e.stopPropagation();
            currentDirModalMode = "export";
            dirModalTitle.innerText = "Select Base Export Directory";
            dirModalOverlay.style.display = "flex";
            await loadDirectory(masterPathInput.value || node.properties.master_root || "");
            setStatus("Opened export directory selection window");
        };

        dbRow.appendChild(dbSelect);
        dbRow.appendChild(refreshDbBtn);
        dbRow.appendChild(newDbBtn);
        dbRow.appendChild(renameDbBtn);
        dbRow.appendChild(cleanOrphansBtn);
        dbRow.appendChild(auditDbBtn);
        dbRow.appendChild(exportImagesBtn);
        container.appendChild(dbRow);

        async function updateDbDropdown() {
            const masterRoot = node.properties.master_root || "";
            const res = await api.fetchApi(`/prompt_tracker/list_dbs?master_root=${encodeURIComponent(masterRoot)}`);
            const dbs = await res.json();
            dbSelect.innerHTML = "";
            dbs.forEach(db => {
                const opt = document.createElement("option");
                opt.value = db;
                opt.innerText = `📂 ${db}`;
                if (db === currentDbName) opt.selected = true;
                dbSelect.appendChild(opt);
            });
        }

        const activePromptBox = document.createElement("div");
        activePromptBox.style.display = "flex";
        activePromptBox.style.flexDirection = "column";
        activePromptBox.style.gap = "4px";
        activePromptBox.style.backgroundColor = activeTheme.blueBoxBg;
        activePromptBox.style.border = `1.5px solid ${activeTheme.blueBoxBorder}`;
        activePromptBox.style.borderRadius = "6px";
        activePromptBox.style.padding = "6px";
        activePromptBox.style.height = `${node.properties.promptBoxHeight}px`;
        activePromptBox.style.flexShrink = "0";
        activePromptBox.style.boxSizing = "border-box";

        const titleRow = document.createElement("div");
        titleRow.style.display = "flex";
        titleRow.style.justifyContent = "space-between";
        titleRow.style.alignItems = "center";

        const activeTitle = document.createElement("div");
        activeTitle.innerText = "ACTIVE PROMPT (EDITABLE):";
        activeTitle.style.fontSize = "10px";
        activeTitle.style.fontWeight = "bold";
        activeTitle.style.color = activeTheme.blueBoxTitle;

        const activeStarBtn = document.createElement("button");
        activeStarBtn.innerText = "☆ Favorite";
        activeStarBtn.style.display = "none";
        styleButton(activeStarBtn, false, activeTheme);

        activeStarBtn.onclick = async (e) => {
            e.stopPropagation();
            if (selectedIndex !== null && localDb[selectedIndex]) {
                const targetIndex = selectedIndex;
                const item = localDb[targetIndex];
                const newStarredState = !item.starred;
                item.starred = newStarredState;
                await api.fetchApi("/prompt_tracker/toggle_star", {
                    method: "POST",
                    body: JSON.stringify({ db: currentDbName, id: item.id, index: targetIndex, master_root: node.properties.master_root, instance_uuid: instanceUuid })
                });
                updateStarButtonState();
                renderList();
                setStatus(newStarredState ? "Favorited prompt" : "Unfavorited prompt");
            }
        };

        titleRow.appendChild(activeTitle);
        titleRow.appendChild(activeStarBtn);

        const activeContentRow = document.createElement("div");
        activeContentRow.style.display = "flex";
        activeContentRow.style.gap = "6px";
        activeContentRow.style.alignItems = "stretch";
        activeContentRow.style.flex = "1";
        activeContentRow.style.minHeight = "0";

        const exampleCol = document.createElement("div");
        exampleCol.style.display = "flex";
        exampleCol.style.flexDirection = "column";
        exampleCol.style.gap = "4px";
        exampleCol.style.alignItems = "center";
        exampleCol.style.flexShrink = "0";

        const exampleContainer = document.createElement("div");
        exampleContainer.title = "Image Info (Double-click to preview): No image loaded";
        exampleContainer.style.width = "96px";
        exampleContainer.style.height = "96px";
        exampleContainer.style.minWidth = "96px";
        exampleContainer.style.minHeight = "96px";
        exampleContainer.style.borderRadius = "4px";
        exampleContainer.style.border = `1.5px dashed ${activeTheme.blueBoxBorder}`;
        exampleContainer.style.backgroundColor = "rgba(0, 0, 0, 0.2)";
        exampleContainer.style.display = "flex";
        exampleContainer.style.alignItems = "center";
        exampleContainer.style.justifyContent = "center";
        exampleContainer.style.overflow = "hidden";
        exampleContainer.style.position = "relative";
        exampleContainer.style.cursor = "pointer";

        const examplePlaceholder = document.createElement("span");
        examplePlaceholder.innerText = "IMG";
        examplePlaceholder.style.fontSize = "10px";
        examplePlaceholder.style.color = activeTheme.blueBoxTitle;
        examplePlaceholder.style.opacity = "0.7";

        const exampleThumbImg = document.createElement("img");
        exampleThumbImg.style.width = "100%";
        exampleThumbImg.style.height = "100%";
        exampleThumbImg.style.objectFit = "cover";
        exampleThumbImg.style.display = "none";

        exampleContainer.appendChild(examplePlaceholder);
        exampleContainer.appendChild(exampleThumbImg);

        const embedLabel = document.createElement("label");
        embedLabel.style.display = "flex";
        embedLabel.style.alignItems = "center";
        embedLabel.style.gap = "3px";
        embedLabel.style.fontSize = "9px";
        embedLabel.style.cursor = "pointer";

        const embedCheck = document.createElement("input");
        embedCheck.type = "checkbox";
        embedCheck.checked = false;
        embedCheck.style.cursor = "pointer";

        const embedLabelText = document.createElement("span");
        embedLabelText.innerText = "Embed Image (OFF)";
        embedLabelText.style.color = activeTheme.textSecondary || "#9ca3af";

        embedCheck.onchange = (e) => {
            e.stopPropagation();
            embedLabelText.innerText = embedCheck.checked ? "Embed Image (ON)" : "Embed Image (OFF)";
        };

        embedLabel.appendChild(embedCheck);
        embedLabel.appendChild(embedLabelText);

        exampleCol.appendChild(exampleContainer);
        exampleCol.appendChild(embedLabel);

        exampleContainer.ondblclick = (e) => {
            e.stopPropagation();
            openLightboxForCurrentSelection();
        };

        exampleContainer.ondragover = (e) => { e.preventDefault(); e.stopPropagation(); exampleContainer.style.borderColor = "#facc15"; };
        exampleContainer.ondragleave = (e) => { e.preventDefault(); e.stopPropagation(); exampleContainer.style.borderColor = activeTheme.blueBoxBorder; };

        exampleContainer.ondrop = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            exampleContainer.style.borderColor = activeTheme.blueBoxBorder;

            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const file = e.dataTransfer.files[0];
                const reader = new FileReader();
                reader.onload = async (event) => {
                    currentImageInfo.image = event.target.result;
                    setImageInfo(currentImageInfo, embedCheck.checked);
                    setStatus("Loaded dropped image file!");
                };
                reader.readAsDataURL(file);
                return;
            }

            const customBundle = e.dataTransfer.getData("application/rsl-preview-bundle");
            if (customBundle) {
                try {
                    const parsed = JSON.parse(customBundle);
                    currentImageInfo = parsed.image_info || currentImageInfo;
                    const imgUrl = parsed.image || "";

                    configInput.value = `Steps: ${currentImageInfo.steps}, CFG: ${currentImageInfo.cfg}, Denoise: ${currentImageInfo.denoise}, Seed: ${currentImageInfo.seed}`;
                    const droppedModel = parsed.render_model || (parsed.image_info && parsed.image_info.render_model);
                    if (droppedModel) setModelValue(droppedModel);

                    updateBackendWidgets();
                    currentImageInfo.image = imgUrl;
                    setImageInfo(currentImageInfo, embedCheck.checked);

                    if (selectedIndex !== null && localDb[selectedIndex]) {
                        localDb[selectedIndex].image_info = currentImageInfo;
                        localDb[selectedIndex].config = configInput.value;
                        if (droppedModel) localDb[selectedIndex].model = droppedModel;
                        await api.fetchApi("/prompt_tracker/update", {
                            method: "POST",
                            body: JSON.stringify({
                                db: currentDbName,
                                id: localDb[selectedIndex].id,
                                index: selectedIndex,
                                image_info: currentImageInfo,
                                is_embedded: embedCheck.checked,
                                config: configInput.value,
                                model: droppedModel || activeSelectedModel,
                                master_root: node.properties.master_root,
                                instance_uuid: instanceUuid
                            })
                        });
                        const visible = getVisibleRows();
                        const vizPos = visible.findIndex(r => r.originalIndex === selectedIndex);
                        if (vizPos !== -1) selectItemByIndex(vizPos, visible);
                    }
                    setStatus(droppedModel ? `Loaded preview & mapped model: '${droppedModel}'` : "Loaded preview bundle!");
                } catch (err) {
                    console.error("Failed to parse rsl-preview-bundle", err);
                }
            }
        };

        const activeTextarea = document.createElement("textarea");
        activeTextarea.placeholder = "Enter or click any saved prompt below...";
        activeTextarea.style.flex = "1";
        activeTextarea.style.width = "100%";
        activeTextarea.style.height = "100%";
        activeTextarea.style.backgroundColor = "transparent";
        activeTextarea.style.color = activeTheme.blueBoxText;
        activeTextarea.style.border = "none";
        activeTextarea.style.outline = "none";
        activeTextarea.style.resize = "none";
        activeTextarea.style.fontFamily = "monospace, sans-serif";
        activeTextarea.style.boxSizing = "border-box";

        activeTextarea.oninput = () => { updateBackendWidgets(); updateCounters(activeTextarea.value); };

        activeContentRow.appendChild(exampleCol);
        activeContentRow.appendChild(activeTextarea);
        activePromptBox.appendChild(titleRow);
        activePromptBox.appendChild(activeContentRow);
        container.appendChild(activePromptBox);

        const topResizeDivider = createResizeDivider("Drag to resize prompt height", activeTheme.borderFocus || "#4f46e5", (dy) => {
            let newHeight = Math.max(50, Math.min(300, activePromptBox.clientHeight + dy));
            activePromptBox.style.height = `${newHeight}px`;
            node.properties.promptBoxHeight = newHeight;
        });
        container.appendChild(topResizeDivider);

        const activeNegativeBox = document.createElement("div");
        activeNegativeBox.style.display = "flex";
        activeNegativeBox.style.flexDirection = "column";
        activeNegativeBox.style.gap = "2px";
        activeNegativeBox.style.backgroundColor = activeTheme.negBoxBg;
        activeNegativeBox.style.border = `1px solid ${activeTheme.negBoxBorder}`;
        activeNegativeBox.style.borderRadius = "6px";
        activeNegativeBox.style.padding = "4px 6px";
        activeNegativeBox.style.height = `${node.properties.negativeBoxHeight}px`;
        activeNegativeBox.style.flexShrink = "0";
        activeNegativeBox.style.boxSizing = "border-box";

        const activeNegTitle = document.createElement("div");
        activeNegTitle.innerText = "ACTIVE NEGATIVE PROMPT (EDITABLE):";
        activeNegTitle.style.fontSize = "9px";
        activeNegTitle.style.fontWeight = "bold";
        activeNegTitle.style.color = activeTheme.negBoxTitle;

        const activeNegativeTextarea = document.createElement("textarea");
        activeNegativeTextarea.placeholder = "Negative prompt output...";
        activeNegativeTextarea.style.width = "100%";
        activeNegativeTextarea.style.height = "100%";
        activeNegativeTextarea.style.flex = "1";
        activeNegativeTextarea.style.backgroundColor = "transparent";
        activeNegativeTextarea.style.color = activeTheme.negBoxText;
        activeNegativeTextarea.style.border = "none";
        activeNegativeTextarea.style.outline = "none";
        activeNegativeTextarea.style.resize = "none";
        activeNegativeTextarea.style.fontFamily = "monospace, sans-serif";
        activeNegativeTextarea.style.boxSizing = "border-box";

        activeNegativeTextarea.oninput = () => updateBackendWidgets();

        activeNegativeBox.appendChild(activeNegTitle);
        activeNegativeBox.appendChild(activeNegativeTextarea);
        container.appendChild(activeNegativeBox);

        const bottomResizeDivider = createResizeDivider("Drag to resize negative prompt box height", activeTheme.negBoxBorder || "#f472b6", (dy) => {
            let newHeight = Math.max(35, Math.min(250, activeNegativeBox.clientHeight + dy));
            activeNegativeBox.style.height = `${newHeight}px`;
            node.properties.negativeBoxHeight = newHeight;
        });
        container.appendChild(bottomResizeDivider);

        const actionBtnRow = document.createElement("div");
        actionBtnRow.style.display = "flex";
        actionBtnRow.style.gap = "4px";
        actionBtnRow.style.flexShrink = "0";

        const updateBtn = document.createElement("button");
        updateBtn.innerText = "💾 Update";
        styleButton(updateBtn, false, activeTheme);
        updateBtn.style.flex = "1.5";
        updateBtn.style.fontWeight = "bold";

        const addBtn = document.createElement("button");
        addBtn.innerText = "➕ Add New";
        styleButton(addBtn, false, activeTheme);
        addBtn.style.flex = "1";

        const clearBtn = document.createElement("button");
        clearBtn.innerText = "🧹 Clear";
        styleButton(clearBtn, false, activeTheme);
        clearBtn.style.flex = "1";

        actionBtnRow.appendChild(updateBtn);
        actionBtnRow.appendChild(addBtn);
        actionBtnRow.appendChild(clearBtn);
        container.appendChild(actionBtnRow);

        clearBtn.onclick = (e) => {
            if (e) e.stopPropagation();
            activeTextarea.value = "";
            activeNegativeTextarea.value = "";
            lorasInput.value = "";
            configInput.value = "";
            sourceInput.value = "";
            tagInput.value = "";
            setImageInfo({ image: "", steps: 20, cfg: 8.0, denoise: 1.0, seed: 0, render_model: "undefined" }, false);
            selectedIndex = null;
            setActiveSelection("", "", null, false);
            updateBackendWidgets();
            renderList();
            setStatus("Cleared prompt input fields");
        };

        addBtn.onclick = async (e) => {
            if (e) e.stopPropagation();
            const category = activeSelectedCategory;
            const model = activeSelectedModel;
            const loras = lorasInput.value.trim();
            const config = configInput.value.trim();
            const source = sourceInput.value.trim();
            const tags = tagInput.value.trim();
            const prompt = activeTextarea.value;
            const negative = activeNegativeTextarea.value;
            let image_info = currentImageInfo;
            const is_embedded = embedCheck.checked;

            if (is_embedded && image_info.image && !image_info.image.startsWith("data:") && !image_info.image.startsWith("http")) {
                try {
                    const res = await fetch(getProxiedImageUrl(image_info.image));
                    const blob = await res.blob();
                    const base64 = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.readAsDataURL(blob);
                    });
                    image_info = { ...image_info, image: base64 };
                } catch (err) {
                    console.error("Failed to convert image for embed add:", err);
                }
            }

            if (!prompt.trim() && !negative.trim()) return;

            const res = await api.fetchApi("/prompt_tracker/add", {
                method: "POST",
                body: JSON.stringify({
                    db: currentDbName,
                    category,
                    model,
                    loras,
                    config,
                    source,
                    tags,
                    prompt,
                    negative,
                    image_info,
                    is_embedded,
                    starred: false,
                    master_root: node.properties.master_root,
                    source_master_root: node.properties.master_root || "",
                    instance_uuid: instanceUuid
                })
            });
            const data = await res.json();
            if (data.status === "success") {
                localDb = data.db;
                await prefetchImagesAsBase64(localDb);
                const newIdx = localDb.length - 1;
                updateCategoryDropdowns();
                renderList();
                if (categoryDropdown.updateDisplay) categoryDropdown.updateDisplay();
                if (modelDropdown.updateDisplay) modelDropdown.updateDisplay();

                const visible = getVisibleRows();
                const vizPos = visible.findIndex(r => r.originalIndex === newIdx);
                if (vizPos !== -1) {
                    selectItemByIndex(vizPos, visible);
                } else {
                    selectedIndex = newIdx;
                    setActiveSelection(prompt, negative, image_info, is_embedded);
                }
                setStatus("Added new prompt entry");
            }
        };

        updateBtn.onclick = async (e) => {
            if (e) e.stopPropagation();
            if (selectedIndex === null || selectedIndex < 0 || selectedIndex >= localDb.length) {
                setStatus("Select a prompt first before updating!", true);
                return;
            }

            const category = activeSelectedCategory;
            const model = activeSelectedModel;
            const loras = lorasInput.value.trim();
            const config = configInput.value.trim();
            const source = sourceInput.value.trim();
            const tags = tagInput.value.trim();
            const prompt = activeTextarea.value;
            const negative = activeNegativeTextarea.value;
            let image_info = currentImageInfo;
            const is_embedded = embedCheck.checked;

            if (is_embedded && image_info.image && !image_info.image.startsWith("data:") && !image_info.image.startsWith("http")) {
                try {
                    const res = await fetch(getProxiedImageUrl(image_info.image));
                    const blob = await res.blob();
                    const base64 = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.readAsDataURL(blob);
                    });
                    image_info = { ...image_info, image: base64 };
                } catch (err) {
                    console.error("Failed to convert image for embed update:", err);
                }
            }

            if (!prompt.trim() && !negative.trim()) return;

            const targetIndex = selectedIndex;
            const currentItem = localDb[targetIndex];

            try {
                const res = await api.fetchApi("/prompt_tracker/update", {
                    method: "POST",
                    body: JSON.stringify({
                        db: currentDbName,
                        id: currentItem ? currentItem.id : null,
                        index: targetIndex,
                        category,
                        model,
                        loras,
                        config,
                        source,
                        tags,
                        prompt,
                        negative,
                        image_info,
                        is_embedded,
                        master_root: node.properties.master_root,
                        source_master_root: node.properties.master_root || "",
                        instance_uuid: instanceUuid
                    })
                });

                if (!res.ok) {
                    const errText = await res.text();
                    console.error("Server returned error. Response body:", errText);
                    setStatus("Update failed on server (check console)", true);
                } else {
                    const data = await res.json();
                    if (data.status === "success") {
                        localDb = data.db;
                        await prefetchImagesAsBase64(localDb);
                        updateCategoryDropdowns();
                        renderList();

                        const visible = getVisibleRows();
                        const vizPos = visible.findIndex(r => r.originalIndex === targetIndex);
                        if (vizPos !== -1) {
                            selectItemByIndex(vizPos, visible);
                        } else {
                            selectedIndex = targetIndex;
                            setActiveSelection(prompt, negative, image_info, is_embedded);
                        }
                        setStatus(`Updated prompt #${targetIndex + 1} in place`);
                    }
                }
            } catch (err) {
                console.error("CRITICAL FETCH ERROR caught:", err);
                setStatus("Update failed due to network error (check console)", true);
            }
        };

        const metadataRow = document.createElement("div");
        metadataRow.style.display = "flex";
        metadataRow.style.gap = "4px";
        metadataRow.style.flexShrink = "0";

        const categoryDropdown = createActionDropdown(
            "-- Select Category --",
            () => Array.from(dbCategories).sort(),
            () => activeSelectedCategory,
            (selCat) => { activeSelectedCategory = selCat; updateBackendWidgets(); },
            () => {
                showThemedModal("Enter New Category Name:", "", null, (newCat) => {
                    if (newCat) {
                        dbCategories.add(newCat);
                        activeSelectedCategory = newCat;
                        updateBackendWidgets();
                        updateCategoryDropdowns();
                    }
                }, true);
            },
            async (catToDelete, isShift) => {
                if (catToDelete === "General") return;
                const performDel = async () => {
                    dbCategories.delete(catToDelete);
                    await api.fetchApi("/prompt_tracker/delete_category", {
                        method: "POST",
                        body: JSON.stringify({ db: currentDbName, category: catToDelete, master_root: node.properties.master_root, instance_uuid: instanceUuid })
                    });
                    if (activeSelectedCategory === catToDelete) { activeSelectedCategory = "General"; updateBackendWidgets(); }
                    await fetchAndRender(false);
                };
                if (isShift) await performDel();
                else showThemedModal(`Delete Category '${catToDelete}'?`, "", null, performDel, false);
            },
            false
        );

        const sourceInput = document.createElement("input");
        sourceInput.placeholder = "Source (e.g. Civitai)";
        sourceInput.style.flex = "1";
        styleInput(sourceInput, activeTheme);
        sourceInput.oninput = () => updateBackendWidgets();

        const tagInput = document.createElement("input");
        tagInput.placeholder = "Tags (e.g. portrait)";
        tagInput.style.flex = "1";
        styleInput(tagInput, activeTheme);
        tagInput.oninput = () => updateBackendWidgets();

        metadataRow.appendChild(categoryDropdown);
        metadataRow.appendChild(sourceInput);
        metadataRow.appendChild(tagInput);
        container.appendChild(metadataRow);

        const pipelineRow = document.createElement("div");
        pipelineRow.style.display = "flex";
        pipelineRow.style.gap = "4px";
        pipelineRow.style.flexShrink = "0";

        const modelDropdown = createActionDropdown(
            "-- Select Model --",
            () => Array.from(dbModels).sort(),
            () => activeSelectedModel,
            (selMod) => { activeSelectedModel = selMod; updateBackendWidgets(); },
            () => {
                showThemedModal("Enter New Model Name:", "", null, (newMod) => {
                    if (newMod) {
                        dbModels.add(newMod);
                        activeSelectedModel = newMod;
                        updateBackendWidgets();
                        updateCategoryDropdowns();
                    }
                }, true);
            },
            async (modelToDelete, isShift) => {
                if (modelToDelete === "undefined") return;
                const performDel = async () => {
                    dbModels.delete(modelToDelete);
                    await api.fetchApi("/prompt_tracker/delete_model", {
                        method: "POST",
                        body: JSON.stringify({ db: currentDbName, model: modelToDelete, master_root: node.properties.master_root, instance_uuid: instanceUuid })
                    });
                    if (activeSelectedModel === modelToDelete) { activeSelectedModel = "undefined"; updateBackendWidgets(); }
                    await fetchAndRender(false);
                };
                if (isShift) await performDel();
                else showThemedModal(`Delete Model '${modelToDelete}'?`, "", null, performDel, false);
            },
            true
        );

        const lorasInput = document.createElement("input");
        lorasInput.placeholder = "Loras (e.g. detail_slider)";
        lorasInput.style.flex = "1";
        styleInput(lorasInput, activeTheme);
        lorasInput.oninput = () => updateBackendWidgets();

        const configInput = document.createElement("input");
        configInput.placeholder = "Config (e.g. Steps: 25)";
        configInput.style.flex = "1";
        styleInput(configInput, activeTheme);
        configInput.oninput = () => updateBackendWidgets();

        pipelineRow.appendChild(modelDropdown);
        pipelineRow.appendChild(lorasInput);
        pipelineRow.appendChild(configInput);
        container.appendChild(pipelineRow);

        function setItemCategory(catName) {
            const target = catName || "General";
            dbCategories.add(target);
            activeSelectedCategory = target;
            updateBackendWidgets();
            updateCategoryDropdowns();
        }

        function setModelValue(modelName) {
            const target = modelName || "undefined";
            dbModels.add(target);
            activeSelectedModel = target;
            updateBackendWidgets();
            updateCategoryDropdowns();
        }

        const searchRow = document.createElement("div");
        searchRow.style.display = "flex";
        searchRow.style.gap = "4px";
        searchRow.style.alignItems = "center";
        searchRow.style.width = "100%";
        searchRow.style.flexShrink = "0";

        const searchInputWrapper = document.createElement("div");
        searchInputWrapper.style.position = "relative";
        searchInputWrapper.style.flex = "1";
        searchInputWrapper.style.display = "flex";
        searchInputWrapper.style.alignItems = "center";

        const searchInput = document.createElement("input");
        searchInput.placeholder = "🔍 Search prompts, tags, models...";
        searchInput.style.width = "100%";
        styleInput(searchInput, activeTheme);
        searchInput.style.paddingRight = "22px";

        const searchClearBtn = document.createElement("button");
        searchClearBtn.innerText = "✕";
        searchClearBtn.style.position = "absolute";
        searchClearBtn.style.right = "6px";
        searchClearBtn.style.background = "none";
        searchClearBtn.style.border = "none";
        searchClearBtn.style.cursor = "pointer";
        searchClearBtn.style.color = activeTheme.textSecondary || "#9ca3af";

        searchClearBtn.onclick = (e) => { e.stopPropagation(); searchInput.value = ""; searchFilterQuery = ""; renderList(); };
        searchInput.oninput = () => { searchFilterQuery = searchInput.value.trim().toLowerCase(); renderList(); };

        searchInputWrapper.appendChild(searchInput);
        searchInputWrapper.appendChild(searchClearBtn);

        const imageFilterSelect = document.createElement("select");
        imageFilterSelect.style.width = "90px";
        styleInput(imageFilterSelect, activeTheme);
        [{ val: "all", label: "🖼️ All" }, { val: "image", label: "🖼️ Image" }, { val: "no_image", label: "🖼️ No Img" }].forEach(opt => {
            const el = document.createElement("option");
            el.value = opt.val;
            el.innerText = opt.label;
            imageFilterSelect.appendChild(el);
        });
        imageFilterSelect.onchange = () => { imageFilterMode = imageFilterSelect.value; renderList(); };

        const favFilterBtn = document.createElement("button");
        favFilterBtn.innerText = "☆ Favorites";
        styleButton(favFilterBtn, false, activeTheme);
        favFilterBtn.onclick = (e) => {
            if (e) e.stopPropagation();
            filterFavoritesOnly = !filterFavoritesOnly;
            favFilterBtn.innerText = filterFavoritesOnly ? "★ Favorites" : "☆ Favorites";
            favFilterBtn.style.color = filterFavoritesOnly ? "#facc15" : activeTheme.textPrimary;
            renderList();
        };

        searchRow.appendChild(searchInputWrapper);
        searchRow.appendChild(imageFilterSelect);
        searchRow.appendChild(favFilterBtn);
        container.appendChild(searchRow);

        const listContainer = document.createElement("div");
        listContainer.tabIndex = 0;
        listContainer.style.flex = "1 1 0px";
        listContainer.style.minHeight = "60px";
        listContainer.style.overflowY = "scroll";
        listContainer.style.border = `1px solid ${activeTheme.border}`;
        listContainer.style.borderRadius = "4px";
        listContainer.style.padding = "4px";
        listContainer.style.backgroundColor = activeTheme.bgList;
        listContainer.style.outline = "none";
        container.appendChild(listContainer);
        container.appendChild(statusBar);

        listContainer.ondragover = (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "copy";
            listContainer.style.borderColor = "#facc15";
        };

        listContainer.ondragleave = (e) => {
            e.preventDefault();
            e.stopPropagation();
            listContainer.style.borderColor = activeTheme.border;
        };

        listContainer.ondrop = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            listContainer.style.borderColor = activeTheme.border;

            const rawData = e.dataTransfer.getData("application/rsl-prompt-transfer");
            if (!rawData) {
                setStatus("Drop failed: No prompt data received", true);
                return;
            }

            try {
                const droppedPromptData = JSON.parse(rawData);
                const sourceUuid = String(droppedPromptData.source_instance_uuid || "");

                if (sourceUuid && sourceUuid === instanceUuid) {
                    setStatus("Cannot drop a prompt back onto the same tracker window!", true);
                    return;
                }

                const payload = {
                    db: currentDbName,
                    category: droppedPromptData.category || "General",
                    model: droppedPromptData.model || "undefined",
                    loras: droppedPromptData.loras || "",
                    config: droppedPromptData.config || "",
                    source: droppedPromptData.source || "Cross-Tracker Drop",
                    tags: droppedPromptData.tags || "",
                    prompt: droppedPromptData.prompt || "",
                    negative: droppedPromptData.negative || "",
                    image_info: droppedPromptData.image_info || { image: "" },
                    is_embedded: droppedPromptData.is_embedded || false,
                    starred: droppedPromptData.starred || false,
                    master_root: node.properties.master_root,
                    source_master_root: droppedPromptData.source_master_root || "",
                    instance_uuid: instanceUuid
                };

                const res = await api.fetchApi("/prompt_tracker/add", {
                    method: "POST",
                    body: JSON.stringify(payload)
                });
                const data = await res.json();

                if (data.status === "success") {
                    localDb = data.db;
                    await prefetchImagesAsBase64(localDb);
                    const newIndex = localDb.length - 1;
                    updateCategoryDropdowns();
                    renderList();

                    const visible = getVisibleRows();
                    const vizPos = visible.findIndex(r => r.originalIndex === newIndex);
                    if (vizPos !== -1) {
                        selectItemByIndex(vizPos, visible);
                    } else {
                        selectedIndex = newIndex;
                        setActiveSelection(payload.prompt, payload.negative, payload.image_info, payload.is_embedded);
                    }
                    setStatus("Successfully imported & selected dropped prompt!");
                }
            } catch (err) {
                console.error("Failed to process dropped prompt transfer", err);
                setStatus("Failed to import dropped prompt", true);
            }
        };

        function getVisibleRows() {
            const terms = searchFilterQuery.split(/\s+/).filter(t => t.length > 0);
            const visibleRowsMap = [];
            const children = Array.from(listContainer.children);

            localDb.forEach((item, index) => {
                if (filterFavoritesOnly && !item.starred) return;
                const hasImg = Boolean(item.image_info && item.image_info.image);
                if (imageFilterMode === "image" && !hasImg) return;
                if (imageFilterMode === "no_image" && hasImg) return;
                if (terms.length > 0) {
                    const combined = `${item.category || ''} ${item.model || ''} ${item.loras || ''} ${item.tags || ''} ${item.prompt || ''} ${item.negative || ''} ${item.source || ''}`.toLowerCase();
                    if (!terms.every(term => combined.includes(term))) return;
                }
                const vizIdx = visibleRowsMap.length;
                visibleRowsMap.push({
                    originalIndex: index,
                    item,
                    rowEl: children[vizIdx]
                });
            });
            return visibleRowsMap;
        }

        listContainer.onkeydown = (e) => {
            if (localDb.length === 0) return;
            const visible = getVisibleRows();
            if (visible.length === 0) return;

            let currentVisiblePos = visible.findIndex(r => r.originalIndex === selectedIndex);

            if (e.key === "ArrowDown") {
                e.preventDefault();
                if (currentVisiblePos === -1) {
                    selectItemByIndex(0, visible);
                } else if (currentVisiblePos >= visible.length - 1) {
                    setStatus("Reached the bottom of the list");
                } else {
                    selectItemByIndex(currentVisiblePos + 1, visible);
                }
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                if (currentVisiblePos === -1) {
                    selectItemByIndex(visible.length - 1, visible);
                } else if (currentVisiblePos <= 0) {
                    setStatus("Reached the top of the list");
                } else {
                    selectItemByIndex(currentVisiblePos - 1, visible);
                }
            }
        };

        if (node._autoPromptListener) {
            api.removeEventListener("rsl-auto-prompt-received", node._autoPromptListener);
        }

        node._autoPromptListener = async (e) => {
            if (!e.detail) return;
            if (String(e.detail.node_id) !== String(node.id)) return;
            if (e.detail.instance_uuid && String(e.detail.instance_uuid) !== String(instanceUuid)) return;

            const wiredPrompt = e.detail.prompt || "";
            const wiredNeg = e.detail.negative || "";
            const wiredModel = e.detail.render_model || activeSelectedModel;
            const category = activeSelectedCategory;
            const loras = lorasInput.value.trim();
            const config = e.detail.config || configInput.value.trim();
            const source = e.detail.source || "Auto-Prompt";
            const tags = tagInput.value.trim();
            const image_info = e.detail.image_info || currentImageInfo;
            const is_embedded = false;

            try {
                let final_image_info = image_info;
                if (is_embedded && final_image_info.image && !final_image_info.image.startsWith("data:") && !final_image_info.image.startsWith("http")) {
                    const resImg = await fetch(getProxiedImageUrl(final_image_info.image));
                    const blob = await resImg.blob();
                    const base64 = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.readAsDataURL(blob);
                    });
                    final_image_info = { ...final_image_info, image: base64 };
                }

                await api.fetchApi("/prompt_tracker/add", {
                    method: "POST",
                    body: JSON.stringify({
                        db: currentDbName,
                        category,
                        model: wiredModel,
                        loras,
                        config,
                        source,
                        tags,
                        prompt: wiredPrompt,
                        negative: wiredNeg,
                        image_info: final_image_info,
                        is_embedded,
                        starred: false,
                        master_root: node.properties.master_root,
                        source_master_root: node.properties.master_root || "",
                        instance_uuid: instanceUuid
                    })
                });
            } catch (err) {
                console.error("Failed to auto-add wired prompt:", err);
                setStatus("Failed to auto-add wired prompt", true);
            }
        };

        api.addEventListener("rsl-auto-prompt-received", node._autoPromptListener);

        if (node._refreshListener) {
            api.removeEventListener("rsl-database-refreshed", node._refreshListener);
        }

        // --- UUID-BASED REMOTE UPDATE & DELETE HANDLER ---
        node._refreshListener = async (e) => {
            if (!e.detail) return;

            if (e.detail.db === currentDbName && String(e.detail.master_root || "") === String(node.properties.master_root || "")) {
                const isInitiator = String(e.detail.instance_uuid || "") === String(instanceUuid);
                const action = e.detail.action;
                const targetId = e.detail.item_id;
                const savedScrollTop = listContainer.scrollTop;

                const currentSelectedId = (selectedIndex !== null && localDb[selectedIndex]) ? localDb[selectedIndex].id : null;
                const oldSelectedIndex = selectedIndex;

                const masterRoot = node.properties.master_root || "";

                // --- FIX: Ensure we await the fetch before doing any index lookups ---
                const res = await api.fetchApi(`/prompt_tracker/get?db=${encodeURIComponent(currentDbName)}&master_root=${encodeURIComponent(masterRoot)}`);
                localDb = await res.json();
                await prefetchImagesAsBase64(localDb);
                updateCategoryDropdowns();

                if (currentSelectedId) {
                    const foundIdx = localDb.findIndex(item => item.id === currentSelectedId);
                    if (foundIdx !== -1) {
                        selectedIndex = foundIdx;
                    } else if (action === "delete" && oldSelectedIndex !== null) {
                        // --- DELECTION FALLBACK RULE: Previous, else Next ---
                        if (localDb.length === 0) {
                            selectedIndex = null;
                            setActiveSelection("", "", null, false);
                        } else {
                            let targetIdx = oldSelectedIndex > 0 ? oldSelectedIndex - 1 : 0;
                            selectedIndex = Math.min(targetIdx, localDb.length - 1);
                            const newItem = localDb[selectedIndex];
                            const isEmb = newItem.is_embedded !== undefined ? newItem.is_embedded : true;
                            setItemCategory(newItem.category || "General");
                            setModelValue(newItem.model || "undefined");
                            lorasInput.value = newItem.loras || "";
                            configInput.value = newItem.config || "";
                            sourceInput.value = newItem.source || "";
                            tagInput.value = newItem.tags || "";
                            setActiveSelection(newItem.prompt || "", newItem.negative || "", newItem.image_info || null, isEmb);
                        }
                    } else {
                        selectedIndex = null;
                    }
                }

                renderList();
                listContainer.scrollTop = savedScrollTop;

                if (isInitiator) {
                    if ((action === "add" || action === "update") && targetId) {
                        // localDb is now fully guaranteed to be loaded here!
                        const targetIdx = localDb.findIndex(item => item.id === targetId);
                        if (targetIdx !== -1) {
                            const visible = getVisibleRows();
                            const vizPos = visible.findIndex(r => r.originalIndex === targetIdx);
                            if (vizPos !== -1) {
                                selectItemByIndex(vizPos, visible);
                            } else {
                                selectedIndex = targetIdx;
                                const newItem = localDb[targetIdx];
                                const isEmb = newItem.is_embedded !== undefined ? newItem.is_embedded : true;
                                setItemCategory(newItem.category || "General");
                                setModelValue(newItem.model || "undefined");
                                lorasInput.value = newItem.loras || "";
                                configInput.value = newItem.config || "";
                                sourceInput.value = newItem.source || "";
                                tagInput.value = newItem.tags || "";
                                setActiveSelection(newItem.prompt || "", newItem.negative || "", newItem.image_info || null, isEmb);
                            }
                        }
                    }
                    setStatus(`Successfully completed (${action})`, false);
                } else {
                    // Remote action from another instance/machine
                    const shortId = targetId ? targetId.substring(0, 8) : "sync";

                    if (targetId && currentSelectedId && targetId === currentSelectedId && selectedIndex !== null && localDb[selectedIndex]) {
                        const updatedItem = localDb[selectedIndex];
                        const isEmb = updatedItem.is_embedded !== undefined ? updatedItem.is_embedded : true;
                        setItemCategory(updatedItem.category || "General");
                        setModelValue(updatedItem.model || "undefined");
                        lorasInput.value = updatedItem.loras || "";
                        configInput.value = updatedItem.config || "";
                        sourceInput.value = updatedItem.source || "";
                        tagInput.value = updatedItem.tags || "";
                        setActiveSelection(updatedItem.prompt || "", updatedItem.negative || "", updatedItem.image_info || null, isEmb);
                    }

                    setStatus(`remote action: data updated for item #${shortId}`, false);
                }
                updateCounters(activeTextarea.value);
            }
        };

        api.addEventListener("rsl-database-refreshed", node._refreshListener);

        function updateCategoryDropdowns() {
            dbCategories = new Set(["General"]);
            dbModels = new Set(["undefined"]);
            localDb.forEach(item => {
                if (item.category) dbCategories.add(item.category.trim());
                if (item.model) dbModels.add(item.model.trim());
            });
            if (categoryDropdown.updateDisplay) categoryDropdown.updateDisplay();
            if (modelDropdown.updateDisplay) modelDropdown.updateDisplay();
        }

        function applyThemeStyles() {
            container.style.backgroundColor = activeTheme.bgDark;
            container.style.color = activeTheme.textPrimary;
            container.style.borderColor = activeTheme.border;
            statusBar.style.backgroundColor = activeTheme.bgCard;
            renderList();
        }

        function selectItemByIndex(index, visibleRowsMap) {
            if (index < 0 || index >= visibleRowsMap.length) return;
            const { item, originalIndex } = visibleRowsMap[index];
            selectedIndex = originalIndex;

            setItemCategory(item.category || "General");
            setModelValue(item.model || "undefined");
            lorasInput.value = item.loras || "";
            configInput.value = item.config || "";
            sourceInput.value = item.source || "";
            tagInput.value = item.tags || "";
            const isEmb = item.is_embedded !== undefined ? item.is_embedded : true;
            setActiveSelection(item.prompt || "", item.negative || "", item.image_info || null, isEmb);

            const children = Array.from(listContainer.children);
            visibleRowsMap.forEach((r, vizIdx) => {
                if (children[vizIdx]) {
                    const isSelected = r.originalIndex === selectedIndex;
                    children[vizIdx].style.backgroundColor = isSelected ? (activeTheme.selectedRow || "#3730a3") : activeTheme.bgCard;
                }
            });

            const activeRowEl = children[index];
            if (activeRowEl) {
                activeRowEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }
        }

        async function fetchAndRender(autoSelectFirst = false) {
            const masterRoot = node.properties.master_root || "";
            const res = await api.fetchApi(`/prompt_tracker/get?db=${encodeURIComponent(currentDbName)}&master_root=${encodeURIComponent(masterRoot)}`);
            localDb = await res.json();

            await prefetchImagesAsBase64(localDb);

            updateCategoryDropdowns();
            renderList();

            setTimeout(() => {
                if (autoSelectFirst && localDb.length > 0) {
                    const visible = getVisibleRows();
                    if (visible.length > 0) {
                        selectItemByIndex(0, visible);
                        listContainer.focus();
                    }
                } else if (selectedIndex !== null && selectedIndex < localDb.length) {
                    const visible = getVisibleRows();
                    const vizPos = visible.findIndex(r => r.originalIndex === selectedIndex);
                    if (vizPos !== -1) {
                        selectItemByIndex(vizPos, visible);
                    }
                }
            }, 30);

            updateCounters(activeTextarea.value);
            node.setDirtyCanvas(true, true);
        }

        function renderList() {
            const savedScrollTop = listContainer.scrollTop;
            listContainer.innerHTML = "";
            const visible = getVisibleRows();

            visible.forEach(({ item, originalIndex }, vizIdx) => {
                const isSelected = selectedIndex === originalIndex;
                const row = document.createElement("div");
                row.style.display = "flex";
                row.style.alignItems = "flex-start";
                row.style.gap = "6px";
                row.style.borderBottom = `1px solid ${activeTheme.border}`;
                row.style.padding = "6px 6px";
                row.style.margin = "2px 0";
                row.style.borderRadius = "4px";
                row.style.cursor = "pointer";
                row.style.backgroundColor = isSelected ? (activeTheme.selectedRow || "#3730a3") : activeTheme.bgCard;

                row.draggable = true;
                row.ondragstart = (e) => {
                    e.stopPropagation();
                    const transferData = createPromptTransferPayload(item, node.properties.master_root, instanceUuid);
                    e.dataTransfer.setData("application/rsl-prompt-transfer", JSON.stringify(transferData));
                    e.dataTransfer.effectAllowed = "copy";
                };

                const rowStarBtn = document.createElement("button");
                rowStarBtn.innerText = item.starred ? "★" : "☆";
                rowStarBtn.style.background = "none";
                rowStarBtn.style.border = "none";
                rowStarBtn.style.cursor = "pointer";
                rowStarBtn.style.color = item.starred ? "#facc15" : activeTheme.textSecondary || "#9ca3af";

                rowStarBtn.onclick = async (e) => {
                    e.stopPropagation();
                    item.starred = !item.starred;
                    await api.fetchApi("/prompt_tracker/toggle_star", {
                        method: "POST",
                        body: JSON.stringify({ db: currentDbName, id: item.id, index: originalIndex, master_root: node.properties.master_root, instance_uuid: instanceUuid })
                    });
                    rowStarBtn.innerText = item.starred ? "★" : "☆";
                    rowStarBtn.style.color = item.starred ? "#facc15" : activeTheme.textSecondary || "#9ca3af";
                    updateStarButtonState();
                };

                const textSpan = document.createElement("div");
                textSpan.style.flex = "1";
                textSpan.style.display = "-webkit-box";
                textSpan.style.webkitLineClamp = "2";
                textSpan.style.webkitBoxOrient = "vertical";
                textSpan.style.overflow = "hidden";
                textSpan.style.wordBreak = "break-word";
                textSpan.style.fontSize = `${promptFontSize}px`;
                textSpan.innerHTML = `<strong style="color: ${activeTheme.textCategory};">[${item.category || 'General'}:${item.model || 'undefined'}]</strong> <span style="color: ${activeTheme.textPrimary};">${item.prompt || ''}</span>`;

                const itemMoveBtn = document.createElement("button");
                itemMoveBtn.innerText = "🚚";
                itemMoveBtn.style.background = "none";
                itemMoveBtn.style.border = "none";
                itemMoveBtn.style.cursor = "pointer";
                itemMoveBtn.style.fontSize = `${Math.max(9, promptFontSize - 1)}px`;
                itemMoveBtn.title = "Move prompt to another database";

                itemMoveBtn.onclick = async (e) => {
                    e.stopPropagation();
                    const res = await api.fetchApi(`/prompt_tracker/list_dbs?master_root=${encodeURIComponent(node.properties.master_root || "")}`);
                    const dbs = await res.json();
                    const otherDbs = dbs.filter(db => db !== currentDbName);

                    if (otherDbs.length === 0) {
                        setStatus("No other databases available to move to", true);
                        return;
                    }

                    showThemedModal(`Move prompt #${originalIndex + 1} to database:`, otherDbs[0], otherDbs, async (targetDb) => {
                        if (!targetDb || targetDb === currentDbName) return;
                        const moveRes = await api.fetchApi("/prompt_tracker/move_prompt", {
                            method: "POST",
                            body: JSON.stringify({
                                source_db: currentDbName,
                                target_db: targetDb,
                                id: item.id,
                                index: originalIndex,
                                master_root: node.properties.master_root,
                                instance_uuid: instanceUuid
                            })
                        });
                        const moveData = await moveRes.json();
                        if (moveData.status === "success") {
                            if (selectedIndex === originalIndex) {
                                selectedIndex = null;
                                setActiveSelection("", "", null, false);
                            }
                            await fetchAndRender(false);
                            setStatus(`Moved prompt to database: '${targetDb}'`);
                        } else {
                            setStatus(moveData.message || "Failed to move prompt", true);
                        }
                    }, false);
                };

                const itemDeleteBtn = document.createElement("button");
                itemDeleteBtn.innerText = "🗑️";
                itemDeleteBtn.style.background = "none";
                itemDeleteBtn.style.border = "none";
                itemDeleteBtn.style.cursor = "pointer";

                itemDeleteBtn.onclick = async (e) => {
                    e.stopPropagation();
                    const targetIndex = originalIndex;
                    const del = async () => {
                        const res = await api.fetchApi("/prompt_tracker/delete", {
                            method: "POST",
                            body: JSON.stringify({ db: currentDbName, id: item.id, index: targetIndex, master_root: node.properties.master_root, instance_uuid: instanceUuid })
                        });
                        const data = await res.json();
                        if (data.status === "success") {
                            localDb = data.db;
                            await prefetchImagesAsBase64(localDb);
                            updateCategoryDropdowns();
                            renderList();

                            const visibleRowsAfterDel = getVisibleRows();
                            if (visibleRowsAfterDel.length > 0) {
                                let nextVizIdx = visibleRowsAfterDel.findIndex(r => r.originalIndex >= targetIndex);
                                if (nextVizIdx === -1) nextVizIdx = visibleRowsAfterDel.length - 1;
                                selectItemByIndex(nextVizIdx, visibleRowsAfterDel);
                            } else {
                                selectedIndex = null;
                                setActiveSelection("", "", null, false);
                            }
                            listContainer.focus();
                            setStatus(`Deleted prompt #${targetIndex + 1}`);
                        }
                    };

                    if (e.shiftKey) await del();
                    else showThemedModal(`Delete prompt #${originalIndex + 1}?`, "", null, del, false);
                };

                row.onclick = (e) => {
                    e.stopPropagation();
                    listContainer.focus();
                    selectItemByIndex(vizIdx, visible);
                };

                row.ondblclick = (e) => {
                    e.stopPropagation();
                    listContainer.focus();
                    selectItemByIndex(vizIdx, visible);
                    openLightboxForCurrentSelection();
                };

                row.appendChild(rowStarBtn);
                row.appendChild(textSpan);
                row.appendChild(itemMoveBtn);
                row.appendChild(itemDeleteBtn);
                listContainer.appendChild(row);
            });
            listContainer.scrollTop = savedScrollTop;
        }

        function syncFromProperties() {
            const rootWidget = node.widgets?.find(w => w.name === "master_root");
            if (rootWidget && rootWidget.value && !node.properties.master_root) {
                node.properties.master_root = rootWidget.value;
            }

            const dbWidget = node.widgets?.find(w => w.name === "active_db");
            if (dbWidget && dbWidget.value && !node.properties.selected_database) {
                node.properties.selected_database = dbWidget.value;
            }

            if (node.properties?.master_root) {
                masterPathInput.value = node.properties.master_root;
                masterPathInput.title = node.properties.master_root;
            }
            if (node.properties?.selected_database) {
                currentDbName = node.properties.selected_database;
                dbSelect.value = currentDbName;
            }
        }

        node.onResize = function (size) {
            if (this.properties) {
                this.properties.nodeSize = [size[0], size[1]];
            }
        };

        node.onConfigure = async function (o) {
            if (o && o.properties) {
                node.properties = Object.assign({}, node.properties, o.properties);
            }
            syncFromProperties();
            hideBackendWidgets(this);
            const enableWidget = this.widgets?.find(w => w.name === "enable_auto_capture");
            if (enableWidget) {
                enableWidget.computeSize = () => [0, -4];
                enableWidget.draw = function () { };
            }

            if (node.properties?.nodeSize) {
                this.setSize(node.properties.nodeSize);
            }
            if (node.properties?.promptBoxHeight) {
                activePromptBox.style.height = `${node.properties.promptBoxHeight}px`;
            }
            if (node.properties?.negativeBoxHeight) {
                activeNegativeBox.style.height = `${node.properties.negativeBoxHeight}px`;
            }
            if (node.properties?.activeTheme) {
                savedThemeKey = node.properties.activeTheme;
                activeTheme = getThemePalette(savedThemeKey);
                const configuredTheme = THEMES[savedThemeKey] || THEMES.tracker;
                node.color = configuredTheme.color;
                node.bgcolor = configuredTheme.bgcolor;
                applyThemeStyles();
            }

            currentDbName = node.properties?.selected_database || "prompts_db";
            updateBackendWidgets();
            await updateDbDropdown();
            await fetchAndRender(true);
        };

        node.addDOMWidget("prompt_tracker_panel", "container", container);
        node.setSize([460, 620]);

        syncFromProperties();
        updateBackendWidgets();
        await updateDbDropdown();
        await fetchAndRender(true);
        setStatus("Ready");
    }
});