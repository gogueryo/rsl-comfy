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

app.registerExtension({
    name: "RSL.JSONEditorUI",
    async nodeCreated(node) {
        if (node.comfyClass !== "JSONEditorNode") return;

        // --- PERSISTENT THEME RESTORATION ---
        if (!node.properties) node.properties = {};
        let savedThemeKey = node.properties.activeTheme || "tracker";
        let activeTheme = getThemePalette(savedThemeKey);

        const initialNodeTheme = THEMES[savedThemeKey] || THEMES.tracker;
        node.color = initialNodeTheme.color;
        node.bgcolor = initialNodeTheme.bgcolor;

        let currentJsonData = { example: "value", list: [1, 2, 3] };
        let activeFilename = "payload.json";
        let allFileList = [];
        let viewMode = "tree"; 
        let fontSize = 11;
        let autoCaptureState = false;

        // Search State
        let searchMatches = [];
        let currentMatchIndex = -1;
        let rawMatchIndices = [];

        node.widgets = [];

        const hiddenJsonWidget = node.addWidget("custom", "json_value", "{}", () => {});
        hiddenJsonWidget.type = "hidden";
        hiddenJsonWidget.serializeValue = async () => JSON.stringify(currentJsonData, null, 2);

        const hiddenFileWidget = node.addWidget("custom", "active_filename", "payload.json", () => {});
        hiddenFileWidget.type = "hidden";
        hiddenFileWidget.serializeValue = async () => activeFilename;

        const hiddenAutoWidget = node.addWidget("custom", "auto_capture", false, () => {});
        hiddenAutoWidget.type = "hidden";
        hiddenAutoWidget.serializeValue = async () => autoCaptureState;

        // Outer Container
        const container = document.createElement("div");
        container.style.position = "relative";
        container.style.display = "flex";
        container.style.flexDirection = "column";
        container.style.gap = "6px";
        container.style.padding = "6px";
        container.style.backgroundColor = activeTheme.bgDark;
        container.style.color = activeTheme.textPrimary;
        container.style.fontSize = `${fontSize}px`;
        container.style.boxSizing = "border-box";
        container.style.borderRadius = "8px";
        container.style.border = `1px solid ${activeTheme.border}`;
        container.style.width = "100%";
        container.style.height = "100%";
        container.style.overflow = "hidden";

        const { statusBar, setStatus } = createStatusBar(activeTheme);

        // --- INLINE THEMED MODAL OVERLAY ---
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
        modalOverlay.style.zIndex = "100";
        modalOverlay.style.borderRadius = "8px";
        modalOverlay.style.padding = "12px";
        modalOverlay.style.boxSizing = "border-box";

        const modalBox = document.createElement("div");
        modalBox.style.backgroundColor = activeTheme.bgCard;
        modalBox.style.border = `1px solid ${activeTheme.borderFocus}`;
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

        const renameOptionRow = document.createElement("label");
        renameOptionRow.style.display = "none";
        renameOptionRow.style.alignItems = "center";
        renameOptionRow.style.gap = "6px";
        renameOptionRow.style.fontSize = "10px";
        renameOptionRow.style.cursor = "pointer";
        renameOptionRow.style.color = activeTheme.textCategory;

        const renameCheck = document.createElement("input");
        renameCheck.type = "checkbox";
        renameCheck.style.cursor = "pointer";

        const renameLabelText = document.createElement("span");
        renameLabelText.innerText = "Rename existing file";

        renameOptionRow.appendChild(renameCheck);
        renameOptionRow.appendChild(renameLabelText);

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
        modalBox.appendChild(renameOptionRow);
        modalBox.appendChild(modalBtnGroup);
        modalOverlay.appendChild(modalBox);
        container.appendChild(modalOverlay);

        function showThemedPrompt(titleText, defaultVal, onConfirm, showInput = true, allowRenameOption = false) {
            modalTitle.innerText = titleText;
            modalInput.style.display = showInput ? "block" : "none";
            renameOptionRow.style.display = allowRenameOption ? "flex" : "none";
            renameCheck.checked = false;

            if (showInput) modalInput.value = defaultVal || "";
            modalOverlay.style.display = "flex";
            if (showInput) {
                modalInput.focus();
                modalInput.select();
            }

            modalConfirmBtn.onclick = async (e) => {
                e.stopPropagation();
                modalOverlay.style.display = "none";
                await onConfirm(modalInput.value.trim(), renameCheck.checked);
            };

            modalCancelBtn.onclick = (e) => {
                e.stopPropagation();
                modalOverlay.style.display = "none";
            };
        }

        // --- TOP TOOLBAR: File Row ---
        const fileRow = document.createElement("div");
        fileRow.style.display = "flex";
        fileRow.style.gap = "4px";
        fileRow.style.alignItems = "center";
        fileRow.style.flexShrink = "0";

        const fileSearchInput = document.createElement("input");
        fileSearchInput.placeholder = "📁 Filter...";
        fileSearchInput.style.width = "75px";
        styleInput(fileSearchInput, activeTheme);

        fileSearchInput.oninput = () => {
            filterFileDropdown(fileSearchInput.value.trim().toLowerCase());
        };

        const fileSelect = document.createElement("select");
        fileSelect.style.flex = "1";
        styleInput(fileSelect, activeTheme);

        fileSelect.onchange = async () => {
            activeFilename = fileSelect.value;
            hiddenFileWidget.value = activeFilename;
            await loadFileContent(activeFilename);
            setStatus(`Loaded: ${activeFilename}`);
        };

        const saveFileBtn = document.createElement("button");
        saveFileBtn.innerText = "💾 Save";
        styleButton(saveFileBtn, false, activeTheme);

        saveFileBtn.onclick = async () => {
            const rawStr = viewMode === "raw" ? rawTextarea.value : JSON.stringify(currentJsonData, null, 2);
            const res = await api.fetchApi("/rsl_json_editor/save_file", {
                method: "POST",
                body: JSON.stringify({ filename: activeFilename, content: rawStr })
            });
            const data = await res.json();
            if (data.status === "success") {
                saveFileBtn.innerText = "✓ Saved!";
                setStatus(`File saved: ${activeFilename}`);
                setTimeout(() => saveFileBtn.innerText = "💾 Save", 1200);
                await updateFileList();
            } else {
                setStatus(`Save failed: ${data.message}`, true);
            }
        };

        const saveAsBtn = document.createElement("button");
        saveAsBtn.innerText = "Save As";
        styleButton(saveAsBtn, false, activeTheme);

        saveAsBtn.onclick = () => {
            showThemedPrompt("Save JSON File As:", activeFilename, async (newName, isRename) => {
                if (!newName) return;
                const clean = newName.replace(/[^a-zA-Z0-9_\-\.]/g, "");
                const target = clean.endsWith(".json") ? clean : clean + ".json";
                const rawStr = viewMode === "raw" ? rawTextarea.value : JSON.stringify(currentJsonData, null, 2);
                
                if (isRename) {
                    const res = await api.fetchApi("/rsl_json_editor/rename_file", {
                        method: "POST",
                        body: JSON.stringify({ old_filename: activeFilename, new_filename: target })
                    });
                    const data = await res.json();
                    if (data.status === "success") {
                        activeFilename = data.filename;
                        hiddenFileWidget.value = activeFilename;
                        setStatus(`Renamed file to: ${activeFilename}`);
                        await updateFileList();
                    } else {
                        setStatus(`Rename failed: ${data.message}`, true);
                    }
                } else {
                    const res = await api.fetchApi("/rsl_json_editor/save_file", {
                        method: "POST",
                        body: JSON.stringify({ filename: target, content: rawStr })
                    });
                    const data = await res.json();
                    if (data.status === "success") {
                        activeFilename = data.filename;
                        hiddenFileWidget.value = activeFilename;
                        setStatus(`Saved As new file: ${activeFilename}`);
                        await updateFileList();
                    } else {
                        setStatus(`Save As failed: ${data.message}`, true);
                    }
                }
            }, true, true);
        };

        const newFileBtn = document.createElement("button");
        newFileBtn.innerText = "+ New";
        styleButton(newFileBtn, false, activeTheme);

        newFileBtn.onclick = () => {
            showThemedPrompt("Enter New JSON File Name:", "data.json", async (newName) => {
                if (!newName) return;
                const clean = newName.replace(/[^a-zA-Z0-9_\-\.]/g, "");
                activeFilename = clean.endsWith(".json") ? clean : clean + ".json";
                hiddenFileWidget.value = activeFilename;
                currentJsonData = {};
                rawTextarea.value = "{}";
                renderEditor();
                setStatus(`Created new payload: ${activeFilename}`);
                await updateFileList();
            });
        };

        const deleteFileBtn = document.createElement("button");
        deleteFileBtn.innerText = "🗑️ Del";
        styleButton(deleteFileBtn, true, activeTheme);

        const executeDelete = async () => {
            const res = await api.fetchApi("/rsl_json_editor/delete_file", {
                method: "POST",
                body: JSON.stringify({ filename: activeFilename })
            });
            const data = await res.json();
            if (data.status === "success") {
                setStatus(`Deleted file: ${activeFilename}`);
                await updateFileList();
                if (allFileList.length > 0) {
                    activeFilename = allFileList[0];
                    hiddenFileWidget.value = activeFilename;
                    await loadFileContent(activeFilename);
                }
            } else {
                setStatus(`Delete failed: ${data.message}`, true);
            }
        };

        deleteFileBtn.onclick = (e) => {
            if (e.shiftKey) {
                executeDelete();
            } else {
                showThemedPrompt(`Delete current file '${activeFilename}'?`, "", async () => {
                    await executeDelete();
                }, false);
            }
        };

        fileRow.appendChild(fileSearchInput);
        fileRow.appendChild(fileSelect);
        fileRow.appendChild(saveFileBtn);
        fileRow.appendChild(saveAsBtn);
        fileRow.appendChild(newFileBtn);
        fileRow.appendChild(deleteFileBtn);
        container.appendChild(fileRow);

        // --- CONTROLS BAR ---
        const toolbar = document.createElement("div");
        toolbar.style.display = "flex";
        toolbar.style.gap = "4px";
        toolbar.style.alignItems = "center";
        toolbar.style.flexShrink = "0";

        const modeToggleBtn = document.createElement("button");
        modeToggleBtn.innerText = "🌳 Tree";
        styleButton(modeToggleBtn, false, activeTheme);

        modeToggleBtn.onclick = () => {
            const savedSize = [node.size[0], node.size[1]];

            if (viewMode === "tree") {
                viewMode = "raw";
                modeToggleBtn.innerText = "📝 Raw";
                rawTextarea.value = JSON.stringify(currentJsonData, null, 2);
                editorBox.style.display = "none";
                rawTextarea.style.display = "block";
                setStatus("Switched to Raw Text view");
            } else {
                try {
                    currentJsonData = JSON.parse(rawTextarea.value);
                    viewMode = "tree";
                    modeToggleBtn.innerText = "🌳 Tree";
                    rawTextarea.style.display = "none";
                    editorBox.style.display = "block";
                    renderEditor();
                    setStatus("Switched to Tree View");
                } catch (err) {
                    showThemedPrompt("Invalid JSON! Fix syntax errors before returning to Tree View.", "", () => {}, false);
                    setStatus("JSON syntax error in Raw view", true);
                    return;
                }
            }

            searchMatches = [];
            rawMatchIndices = [];
            currentMatchIndex = -1;

            requestAnimationFrame(() => {
                node.setSize(savedSize);
                node.setDirtyCanvas(true, true);
            });
        };

        const formatBtn = document.createElement("button");
        formatBtn.innerText = "✨ Format";
        styleButton(formatBtn, false, activeTheme);
        formatBtn.onclick = () => {
            if (viewMode === "raw") {
                try {
                    const parsed = JSON.parse(rawTextarea.value);
                    rawTextarea.value = JSON.stringify(parsed, null, 2);
                    setStatus("Formatted raw JSON text");
                } catch (e) {
                    setStatus("Format failed: Invalid JSON syntax", true);
                }
            } else {
                renderEditor();
                setStatus("Refreshed Tree View formatting");
            }
        };

        const fontDownBtn = document.createElement("button");
        fontDownBtn.innerText = "A-";
        styleButton(fontDownBtn, false, activeTheme);
        fontDownBtn.onclick = () => {
            fontSize = Math.max(8, fontSize - 1);
            applyThemeAndFont();
        };

        const fontUpBtn = document.createElement("button");
        fontUpBtn.innerText = "A+";
        styleButton(fontUpBtn, false, activeTheme);
        fontUpBtn.onclick = () => {
            fontSize = Math.min(22, fontSize + 1);
            applyThemeAndFont();
        };

        const themeDropdown = createThemeDropdown(node, activeTheme, (newTheme, themeKey) => {
            activeTheme = newTheme;
            applyThemeAndFont();
            setStatus(`Applied theme: ${themeKey}`);
        });

        const toggleLabel = document.createElement("label");
        toggleLabel.style.display = "flex";
        toggleLabel.style.alignItems = "center";
        toggleLabel.style.gap = "4px";
        toggleLabel.style.fontSize = "10px";
        toggleLabel.style.cursor = "pointer";

        const toggleCheck = document.createElement("input");
        toggleCheck.type = "checkbox";
        toggleCheck.checked = false;
        toggleCheck.style.cursor = "pointer";

        const toggleLabelText = document.createElement("span");
        toggleLabelText.innerText = "Auto OFF";
        toggleLabelText.style.color = "#f472b6";
        toggleLabelText.style.fontWeight = "bold";

        toggleCheck.onchange = (e) => {
            e.stopPropagation();
            autoCaptureState = toggleCheck.checked;
            hiddenAutoWidget.value = autoCaptureState;
            toggleLabelText.innerText = autoCaptureState ? "Auto ON" : "Auto OFF";
            toggleLabelText.style.color = autoCaptureState ? activeTheme.textSource : "#f472b6";
            setStatus(`Auto-capture ${autoCaptureState ? "ENABLED" : "DISABLED"}`);
        };

        toggleLabel.appendChild(toggleCheck);
        toggleLabel.appendChild(toggleLabelText);

        toolbar.appendChild(modeToggleBtn);
        toolbar.appendChild(formatBtn);
        toolbar.appendChild(fontDownBtn);
        toolbar.appendChild(fontUpBtn);
        toolbar.appendChild(themeDropdown);
        toolbar.appendChild(toggleLabel);
        container.appendChild(toolbar);

        // --- SEARCH & REPLACE BAR ---
        const searchRow = document.createElement("div");
        searchRow.style.display = "flex";
        searchRow.style.gap = "4px";
        searchRow.style.flexShrink = "0";

        const searchInput = document.createElement("input");
        searchInput.placeholder = "🔍 Search...";
        searchInput.style.flex = "1";
        styleInput(searchInput, activeTheme);

        const prevMatchBtn = document.createElement("button");
        prevMatchBtn.innerText = "▲";
        styleButton(prevMatchBtn, false, activeTheme);

        const nextMatchBtn = document.createElement("button");
        nextMatchBtn.innerText = "▼";
        styleButton(nextMatchBtn, false, activeTheme);

        const replaceInput = document.createElement("input");
        replaceInput.placeholder = "Replace...";
        replaceInput.style.flex = "1";
        styleInput(replaceInput, activeTheme);

        const replaceNextBtn = document.createElement("button");
        replaceNextBtn.innerText = "Rep";
        styleButton(replaceNextBtn, false, activeTheme);

        const replaceAllBtn = document.createElement("button");
        replaceAllBtn.innerText = "All";
        styleButton(replaceAllBtn, false, activeTheme);

        function navigateMatch(direction = 1) {
            const query = searchInput.value.trim().toLowerCase();
            if (!query) return;

            if (viewMode === "tree") {
                if (searchMatches.length === 0) collectTreeMatches(query);
                if (searchMatches.length === 0) return;
                
                let nextIdx = currentMatchIndex + direction;
                if (nextIdx >= searchMatches.length) nextIdx = searchMatches.length - 1;
                else if (nextIdx < 0) nextIdx = 0;

                currentMatchIndex = nextIdx;
                highlightTreeMatch();
                setStatus(`Tree match ${currentMatchIndex + 1}/${searchMatches.length}`);
            } else {
                if (rawMatchIndices.length === 0) collectRawMatches(query);
                if (rawMatchIndices.length === 0) return;

                let nextIdx = currentMatchIndex + direction;
                if (nextIdx >= rawMatchIndices.length) nextIdx = rawMatchIndices.length - 1;
                else if (nextIdx < 0) nextIdx = 0;

                currentMatchIndex = nextIdx;
                highlightRawMatch(query.length);
                setStatus(`Raw match ${currentMatchIndex + 1}/${rawMatchIndices.length}`);
            }
        }

        function collectTreeMatches(query) {
            searchMatches = [];
            currentMatchIndex = -1;
            const rows = editorBox.querySelectorAll(".json-node-row");
            rows.forEach((row) => {
                if (row.innerText.toLowerCase().includes(query)) {
                    searchMatches.push(row);
                }
            });
        }

        function highlightTreeMatch() {
            editorBox.querySelectorAll(".json-node-row").forEach(r => r.style.backgroundColor = "transparent");
            if (currentMatchIndex >= 0 && currentMatchIndex < searchMatches.length) {
                const targetRow = searchMatches[currentMatchIndex];
                targetRow.style.backgroundColor = activeTheme.borderFocus || "#7b2cbf";
                targetRow.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }
        }

        function collectRawMatches(query) {
            rawMatchIndices = [];
            currentMatchIndex = -1;
            const text = rawTextarea.value.toLowerCase();
            let idx = text.indexOf(query);
            while (idx !== -1) {
                rawMatchIndices.push(idx);
                idx = text.indexOf(query, idx + 1);
            }
        }

        function highlightRawMatch(matchLen) {
            if (currentMatchIndex >= 0 && currentMatchIndex < rawMatchIndices.length) {
                const startPos = rawMatchIndices[currentMatchIndex];
                
                rawTextarea.focus();
                rawTextarea.setSelectionRange(startPos, startPos + matchLen);

                const textBefore = rawTextarea.value.substring(0, startPos);
                const lineCount = textBefore.split("\n").length;
                const computedLineHeight = fontSize * 1.4;
                const targetScrollTop = (lineCount - 1) * computedLineHeight;
                const visibleHeight = rawTextarea.clientHeight;
                rawTextarea.scrollTop = Math.max(0, targetScrollTop - visibleHeight / 2);
            }
        }

        prevMatchBtn.onclick = () => navigateMatch(-1);
        nextMatchBtn.onclick = () => navigateMatch(1);

        searchInput.onkeydown = (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                currentMatchIndex = -1;
                searchMatches = [];
                rawMatchIndices = [];
                navigateMatch(1);
            }
        };

        searchInput.oninput = () => {
            searchMatches = [];
            rawMatchIndices = [];
            currentMatchIndex = -1;
        };

        replaceNextBtn.onclick = () => {
            const query = searchInput.value.trim();
            const repVal = replaceInput.value;
            if (!query) return;

            if (viewMode === "tree") {
                if (searchMatches.length === 0 || currentMatchIndex === -1) {
                    navigateMatch(1);
                    if (searchMatches.length === 0) return;
                }
                const targetRow = searchMatches[currentMatchIndex];
                const inputEl = targetRow.querySelector("input");
                if (inputEl) {
                    inputEl.value = inputEl.value.replace(new RegExp(query, "gi"), repVal);
                    inputEl.dispatchEvent(new Event("change"));
                }
                renderEditor();
                collectTreeMatches(query.toLowerCase());
                navigateMatch(1);
                setStatus(`Replaced occurrence in Tree View`);
            } else {
                if (rawMatchIndices.length === 0 || currentMatchIndex === -1) {
                    navigateMatch(1);
                    if (rawMatchIndices.length === 0) return;
                }
                const startPos = rawMatchIndices[currentMatchIndex];
                const text = rawTextarea.value;

                rawTextarea.value = text.substring(0, startPos) + repVal + text.substring(startPos + query.length);
                rawTextarea.focus();
                rawTextarea.setSelectionRange(startPos, startPos + repVal.length);

                collectRawMatches(query.toLowerCase());
                const nextIdx = rawMatchIndices.findIndex(idx => idx >= startPos + repVal.length);
                currentMatchIndex = nextIdx !== -1 ? nextIdx - 1 : rawMatchIndices.length - 1;
                navigateMatch(1);
                setStatus(`Replaced occurrence in Raw view`);
            }
        };

        replaceAllBtn.onclick = () => {
            const query = searchInput.value.trim();
            const repVal = replaceInput.value;
            if (!query) return;

            let jsonStr = viewMode === "raw" ? rawTextarea.value : JSON.stringify(currentJsonData);
            jsonStr = jsonStr.replaceAll(query, repVal);

            try {
                currentJsonData = JSON.parse(jsonStr);
                rawTextarea.value = viewMode === "raw" ? jsonStr : JSON.stringify(currentJsonData, null, 2);
                if (viewMode === "tree") renderEditor();
                searchMatches = [];
                rawMatchIndices = [];
                currentMatchIndex = -1;
                setStatus(`Replaced all occurrences of '${query}'`);
            } catch (e) {
                setStatus("Replace all failed: Invalid syntax result", true);
            }
        };

        searchRow.appendChild(searchInput);
        searchRow.appendChild(prevMatchBtn);
        searchRow.appendChild(nextMatchBtn);
        searchRow.appendChild(replaceInput);
        searchRow.appendChild(replaceNextBtn);
        searchRow.appendChild(replaceAllBtn);
        container.appendChild(searchRow);

        // --- TREE VIEW BOX ---
        const editorBox = document.createElement("div");
        editorBox.style.flex = "1 1 0px";
        editorBox.style.overflowY = "auto";
        editorBox.style.backgroundColor = activeTheme.bgList;
        editorBox.style.border = `1px solid ${activeTheme.border}`;
        editorBox.style.borderRadius = "4px";
        editorBox.style.padding = "6px";
        editorBox.style.fontFamily = "monospace";
        container.appendChild(editorBox);

        // --- RAW TEXTAREA ---
        const rawTextarea = document.createElement("textarea");
        rawTextarea.style.display = "none";
        rawTextarea.style.flex = "1 1 0px";
        rawTextarea.style.overflowY = "auto";
        styleInput(rawTextarea, activeTheme);
        rawTextarea.style.fontFamily = "monospace";
        rawTextarea.style.fontSize = `${fontSize}px`;
        rawTextarea.style.resize = "none";
        container.appendChild(rawTextarea);

        container.appendChild(statusBar);

        function applyThemeAndFont() {
            container.style.backgroundColor = activeTheme.bgDark;
            container.style.color = activeTheme.textPrimary;
            container.style.border = `1px solid ${activeTheme.border}`;
            container.style.fontSize = `${fontSize}px`;

            statusBar.style.backgroundColor = activeTheme.bgCard;
            statusBar.style.borderColor = activeTheme.border;

            modalBox.style.backgroundColor = activeTheme.bgCard;
            modalBox.style.borderColor = activeTheme.borderFocus;
            styleInput(modalInput, activeTheme);
            styleButton(modalConfirmBtn, false, activeTheme);
            styleButton(modalCancelBtn, true, activeTheme);

            editorBox.style.backgroundColor = activeTheme.bgList;
            editorBox.style.borderColor = activeTheme.border;

            styleInput(fileSearchInput, activeTheme);
            styleInput(fileSelect, activeTheme);
            styleInput(searchInput, activeTheme);
            styleInput(replaceInput, activeTheme);
            styleInput(themeDropdown, activeTheme);

            styleInput(rawTextarea, activeTheme);
            rawTextarea.style.fontSize = `${fontSize}px`;

            styleButton(saveFileBtn, false, activeTheme);
            styleButton(saveAsBtn, false, activeTheme);
            styleButton(newFileBtn, false, activeTheme);
            styleButton(deleteFileBtn, true, activeTheme);
            styleButton(modeToggleBtn, false, activeTheme);
            styleButton(formatBtn, false, activeTheme);
            styleButton(fontDownBtn, false, activeTheme);
            styleButton(fontUpBtn, false, activeTheme);
            styleButton(prevMatchBtn, false, activeTheme);
            styleButton(nextMatchBtn, false, activeTheme);
            styleButton(replaceNextBtn, false, activeTheme);
            styleButton(replaceAllBtn, false, activeTheme);

            renderEditor();
        }

        function renderEditor() {
            editorBox.innerHTML = "";
            editorBox.appendChild(buildTreeNode(currentJsonData, ""));
            searchMatches = [];
            rawMatchIndices = [];
            currentMatchIndex = -1;
        }

        function buildTreeNode(data, path) {
            const wrapper = document.createElement("div");
            wrapper.style.marginLeft = path ? "14px" : "0px";

            if (typeof data === "object" && data !== null) {
                const isArray = Array.isArray(data);
                const keys = Object.keys(data);

                keys.forEach((key) => {
                    const currentPath = path ? `${path}.${key}` : key;
                    const val = data[key];
                    const isComplex = typeof val === "object" && val !== null;

                    const row = document.createElement("div");
                    row.className = "json-node-row";
                    row.style.display = "flex";
                    row.style.alignItems = "center";
                    row.style.gap = "4px";
                    row.style.margin = "2px 0";
                    row.style.padding = "2px 4px";
                    row.style.borderRadius = "3px";

                    if (isComplex) {
                        const toggle = document.createElement("span");
                        toggle.innerText = "▼ ";
                        toggle.style.cursor = "pointer";
                        toggle.style.color = activeTheme.textSource;
                        toggle.style.fontSize = `${fontSize}px`;
                        toggle.onclick = () => {
                            const childContainer = row.nextElementSibling;
                            if (childContainer) {
                                const isHidden = childContainer.style.display === "none";
                                childContainer.style.display = isHidden ? "block" : "none";
                                toggle.innerText = isHidden ? "▼ " : "▶ ";
                            }
                        };
                        row.appendChild(toggle);
                    }

                    const keySpan = document.createElement("span");
                    keySpan.innerText = isArray ? `[${key}]:` : `"${key}":`;
                    keySpan.style.color = activeTheme.textCategory;
                    keySpan.style.fontWeight = "bold";
                    keySpan.style.fontSize = `${fontSize}px`;
                    row.appendChild(keySpan);

                    if (!isComplex) {
                        const valInput = document.createElement("input");
                        valInput.value = val === null ? "null" : val;
                        styleInput(valInput, activeTheme);
                        valInput.style.padding = "1px 4px";
                        valInput.style.fontSize = `${fontSize}px`;
                        valInput.style.color = typeof val === "string" ? activeTheme.textTag : activeTheme.blueBoxTitle;

                        valInput.onchange = () => {
                            let newTypedVal = valInput.value;
                            if (newTypedVal === "true") newTypedVal = true;
                            else if (newTypedVal === "false") newTypedVal = false;
                            else if (newTypedVal === "null") newTypedVal = null;
                            else if (!isNaN(newTypedVal) && newTypedVal.trim() !== "") newTypedVal = Number(newTypedVal);

                            data[key] = newTypedVal;
                        };
                        row.appendChild(valInput);
                    }

                    const delBtn = document.createElement("span");
                    delBtn.innerText = " ✕";
                    delBtn.style.color = activeTheme.delBtnText;
                    delBtn.style.cursor = "pointer";
                    delBtn.style.fontSize = `${fontSize}px`;
                    delBtn.onclick = () => {
                        if (isArray) data.splice(Number(key), 1);
                        else delete data[key];
                        renderEditor();
                    };
                    row.appendChild(delBtn);

                    wrapper.appendChild(row);

                    if (isComplex) {
                        const childWrapper = buildTreeNode(val, currentPath);
                        wrapper.appendChild(childWrapper);
                    }
                });

                const addBtn = document.createElement("button");
                addBtn.innerText = isArray ? "+ Add Item" : "+ Add Key";
                styleButton(addBtn, false, activeTheme);
                addBtn.style.fontSize = `${Math.max(9, fontSize - 2)}px`;
                addBtn.style.marginTop = "4px";

                addBtn.onclick = () => {
                    if (isArray) {
                        data.push("new_value");
                        renderEditor();
                    } else {
                        showThemedPrompt("Enter New Key Name:", "newKey", (newKey) => {
                            if (newKey) {
                                data[newKey] = "value";
                                renderEditor();
                            }
                        });
                    }
                };
                wrapper.appendChild(addBtn);

            } else {
                const primitiveSpan = document.createElement("span");
                primitiveSpan.innerText = String(data);
                primitiveSpan.style.color = activeTheme.textPrimary;
                primitiveSpan.style.fontSize = `${fontSize}px`;
                wrapper.appendChild(primitiveSpan);
            }

            return wrapper;
        }

        function filterFileDropdown(filterQuery) {
            fileSelect.innerHTML = "";
            const filtered = filterQuery 
                ? allFileList.filter(f => f.toLowerCase().includes(filterQuery))
                : allFileList;

            filtered.forEach((f) => {
                const opt = document.createElement("option");
                opt.value = f;
                opt.innerText = `📄 ${f}`;
                if (f === activeFilename) opt.selected = true;
                fileSelect.appendChild(opt);
            });
        }

        async function updateFileList() {
            const res = await api.fetchApi("/rsl_json_editor/list_files");
            allFileList = await res.json();
            filterFileDropdown(fileSearchInput.value.trim().toLowerCase());
        }

        async function loadFileContent(filename) {
            const res = await api.fetchApi(`/rsl_json_editor/load_file?filename=${encodeURIComponent(filename)}`);
            const jsonResp = await res.json();
            if (jsonResp.status === "success") {
                try {
                    currentJsonData = JSON.parse(jsonResp.data);
                    activeFilename = jsonResp.filename;
                    hiddenFileWidget.value = activeFilename;
                    rawTextarea.value = JSON.stringify(currentJsonData, null, 2);
                    renderEditor();
                } catch (e) {}
            }
        }

        async function handleCapturedUpdate(payload) {
            if (!toggleCheck.checked) return;

            try {
                if (payload.json_data) {
                    currentJsonData = typeof payload.json_data === "string" ? JSON.parse(payload.json_data) : payload.json_data;
                    rawTextarea.value = JSON.stringify(currentJsonData, null, 2);
                    renderEditor();

                    if (payload.filename) {
                        activeFilename = payload.filename;
                        hiddenFileWidget.value = activeFilename;
                    }

                    await updateFileList();
                    setStatus(`Auto-Captured & Created: ${activeFilename}`);
                }
            } catch (e) {
                setStatus("Auto-Capture Error: Bad JSON payload", true);
            }
        }

        node.onExecuted = async function (message) {
            if (toggleCheck.checked && message?.captured_json?.[0]) {
                const capturedStr = message.captured_json[0];
                const fileTarget = message?.filename?.[0] || activeFilename;
                await handleCapturedUpdate({ json_data: capturedStr, filename: fileTarget });
            }
        };

        api.addEventListener("rsl_json_editor_captured", (evt) => {
            if (evt.detail) {
                handleCapturedUpdate(evt.detail);
            }
        });

        // --- HOOK FOR RELOADING SERIALIZED WORKFLOW PROPERTIES ---
        const origOnConfigure = node.onConfigure;
        node.onConfigure = function (info) {
            if (origOnConfigure) origOnConfigure.apply(this, arguments);
            
            const loadedTheme = this.properties?.activeTheme || "tracker";
            themeDropdown.value = loadedTheme;
            
            activeTheme = getThemePalette(loadedTheme);
            const nodeTheme = THEMES[loadedTheme] || THEMES.tracker;
            this.color = nodeTheme.color;
            this.bgcolor = nodeTheme.bgcolor;
            
            applyThemeAndFont();
            this.setDirtyCanvas(true, true);
        };

        node.addDOMWidget("json_editor_panel", "container", container);

        await updateFileList();
        await loadFileContent(activeFilename);
        setStatus("Ready");
    }
});