import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "rsl.PromptDriver",
    async loadedGraphNode(node) {
        if (node.comfyClass === "PromptDriverNode") {
            if (node.widgets) {
                node.widgets.forEach(w => {
                    if (["active_db", "master_root"].includes(w.name)) {
                        w.type = "hidden";
                        w.computeSize = () => [0, -4];
                        w.draw = function () { };
                    }
                });
            }
        }
    },
    async nodeCreated(node) {
        if (node.comfyClass !== "PromptDriverNode") return;

        if (!node.properties) node.properties = {};
        if (!node.properties.selected_database) node.properties.selected_database = "prompts_db";
        if (!node.properties.master_root) node.properties.master_root = "";

        if (node.widgets) {
            node.widgets.forEach(w => {
                if (["active_db", "master_root"].includes(w.name)) {
                    w.type = "hidden";
                    w.computeSize = () => [0, -4];
                    w.draw = function () { };
                }
            });
        }

        const container = document.createElement("div");
        container.style.display = "flex";
        container.style.flexDirection = "column";
        container.style.gap = "6px";
        container.style.padding = "10px";
        container.style.backgroundColor = "#022c22";
        container.style.color = "#ecfdf5";
        container.style.fontSize = "12px";
        container.style.boxSizing = "border-box";
        container.style.borderRadius = "8px";
        container.style.border = "1px solid #059669";
        container.style.width = "100%";
        container.style.height = "100%";
        container.style.flex = "1";
        container.style.position = "relative";
        container.style.overflow = "hidden";

        function updateBackendWidgets() {
            if (!node.widgets) return;
            node.widgets.forEach(w => {
                if (w.name === "active_db") w.value = node.properties.selected_database;
                if (w.name === "master_root") w.value = node.properties.master_root;
            });
        }

        // --- DIRECTORY SELECTION MODAL ---
        const dirModalOverlay = document.createElement("div");
        dirModalOverlay.style.position = "absolute";
        dirModalOverlay.style.top = "0";
        dirModalOverlay.style.left = "0";
        dirModalOverlay.style.width = "100%";
        dirModalOverlay.style.height = "100%";
        dirModalOverlay.style.backgroundColor = "rgba(2, 44, 34, 0.95)";
        dirModalOverlay.style.backdropFilter = "blur(3px)";
        dirModalOverlay.style.display = "none";
        dirModalOverlay.style.flexDirection = "column";
        dirModalOverlay.style.justifyContent = "center";
        dirModalOverlay.style.alignItems = "center";
        dirModalOverlay.style.zIndex = "40";
        dirModalOverlay.style.borderRadius = "8px";
        dirModalOverlay.style.padding = "12px";
        dirModalOverlay.style.boxSizing = "border-box";

        const dirModalBox = document.createElement("div");
        dirModalBox.style.backgroundColor = "#064e3b";
        dirModalBox.style.border = "1.5px solid #059669";
        dirModalBox.style.borderRadius = "8px";
        dirModalBox.style.padding = "12px";
        dirModalBox.style.display = "flex";
        dirModalBox.style.flexDirection = "column";
        dirModalBox.style.gap = "8px";
        dirModalBox.style.width = "100%";
        dirModalBox.style.maxWidth = "380px";
        dirModalBox.style.height = "340px";
        dirModalBox.style.boxShadow = "0 8px 24px rgba(0,0,0,0.7)";

        const dirModalHeader = document.createElement("div");
        dirModalHeader.style.display = "flex";
        dirModalHeader.style.justifyContent = "space-between";
        dirModalHeader.style.alignItems = "center";

        const dirModalTitle = document.createElement("div");
        dirModalTitle.innerText = "Select Instance Root Directory";
        dirModalTitle.style.fontWeight = "bold";
        dirModalTitle.style.fontSize = "12px";
        dirModalTitle.style.color = "#facc15";

        const drivesBtn = document.createElement("button");
        drivesBtn.innerText = "💻 Drives";
        drivesBtn.style.background = "#022c22";
        drivesBtn.style.color = "#ecfdf5";
        drivesBtn.style.border = "1px solid #047857";
        drivesBtn.style.borderRadius = "4px";
        drivesBtn.style.cursor = "pointer";
        drivesBtn.style.padding = "3px 8px";
        drivesBtn.style.fontSize = "11px";

        dirModalHeader.appendChild(dirModalTitle);
        dirModalHeader.appendChild(drivesBtn);

        const dirPathInput = document.createElement("input");
        dirPathInput.style.width = "100%";
        dirPathInput.style.backgroundColor = "#022c22";
        dirPathInput.style.color = "#a7f3d0";
        dirPathInput.style.border = "1px solid #047857";
        dirPathInput.style.borderRadius = "4px";
        dirPathInput.style.padding = "4px";
        dirPathInput.style.fontSize = "11px";
        dirPathInput.style.boxSizing = "border-box";

        const dirListContainer = document.createElement("div");
        dirListContainer.style.flex = "1";
        dirListContainer.style.overflowY = "auto";
        dirListContainer.style.border = "1px solid #047857";
        dirListContainer.style.borderRadius = "4px";
        dirListContainer.style.padding = "6px";
        dirListContainer.style.backgroundColor = "#022c22";
        dirListContainer.style.display = "flex";
        dirListContainer.style.flexDirection = "column";
        dirListContainer.style.gap = "3px";

        const dirModalBtnGroup = document.createElement("div");
        dirModalBtnGroup.style.display = "flex";
        dirModalBtnGroup.style.gap = "8px";
        dirModalBtnGroup.style.justifyContent = "flex-end";

        const dirCancelBtn = document.createElement("button");
        dirCancelBtn.innerText = "Cancel";
        dirCancelBtn.style.background = "#022c22";
        dirCancelBtn.style.color = "#ecfdf5";
        dirCancelBtn.style.border = "1px solid #047857";
        dirCancelBtn.style.borderRadius = "4px";
        dirCancelBtn.style.cursor = "pointer";
        dirCancelBtn.style.padding = "4px 8px";
        dirCancelBtn.style.fontSize = "11px";

        const dirSelectBtn = document.createElement("button");
        dirSelectBtn.innerText = "Select This Folder";
        dirSelectBtn.style.background = "#22c55e";
        dirSelectBtn.style.color = "#ffffff";
        dirSelectBtn.style.border = "1px solid #16a34a";
        dirSelectBtn.style.borderRadius = "4px";
        dirSelectBtn.style.cursor = "pointer";
        dirSelectBtn.style.padding = "4px 8px";
        dirSelectBtn.style.fontSize = "11px";
        dirSelectBtn.style.fontWeight = "bold";

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
                if (data.error) return;
                browsingPath = data.current;
                dirPathInput.value = browsingPath;
                dirListContainer.innerHTML = "";

                if (!data.is_drive_list && browsingPath) {
                    const parentRow = document.createElement("div");
                    parentRow.innerText = "📁 .. (Parent Directory)";
                    parentRow.style.padding = "5px 8px";
                    parentRow.style.cursor = "pointer";
                    parentRow.style.borderRadius = "4px";
                    parentRow.style.color = "#facc15";
                    parentRow.style.fontWeight = "bold";
                    parentRow.onmouseenter = () => parentRow.style.backgroundColor = "#047857";
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
                    row.style.padding = "5px 8px";
                    row.style.cursor = "pointer";
                    row.style.borderRadius = "4px";
                    row.style.fontSize = "11px";
                    row.onmouseenter = () => row.style.backgroundColor = "#047857";
                    row.onmouseleave = () => row.style.backgroundColor = "transparent";

                    const fullSubPath = data.is_drive_list ? dirName : (browsingPath.endsWith("/") || browsingPath.endsWith("\\") ? browsingPath + dirName : browsingPath + (window.navigator.platform.includes("Win") ? "\\" : "/") + dirName);

                    row.onclick = () => loadDirectory(fullSubPath);
                    row.ondblclick = () => loadDirectory(fullSubPath);
                    dirListContainer.appendChild(row);
                });
            } catch (err) {
                console.error("Failed to load directory", err);
            }
        }

        drivesBtn.onclick = (e) => { e.stopPropagation(); loadDirectory(""); };
        dirCancelBtn.onclick = (e) => { e.stopPropagation(); dirModalOverlay.style.display = "none"; };

        dirSelectBtn.onclick = async (e) => {
            e.stopPropagation();
            const chosenPath = dirPathInput.value.trim();
            if (!chosenPath) return;

            node.properties.master_root = chosenPath;
            masterPathInput.value = chosenPath;
            masterPathInput.title = chosenPath;
            dirModalOverlay.style.display = "none";
            updateBackendWidgets();
            await updateDbDropdown();
        };

        const masterRow = document.createElement("div");
        masterRow.style.display = "flex";
        masterRow.style.gap = "4px";
        masterRow.style.alignItems = "center";
        masterRow.style.flexShrink = "0";

        const masterBtn = document.createElement("button");
        masterBtn.innerText = "📁 Root";
        masterBtn.style.background = "#064e3b";
        masterBtn.style.color = "#ecfdf5";
        masterBtn.style.border = "1px solid #047857";
        masterBtn.style.borderRadius = "4px";
        masterBtn.style.cursor = "pointer";
        masterBtn.style.padding = "4px 8px";
        masterBtn.style.fontWeight = "bold";
        masterBtn.style.fontSize = "10px";

        masterBtn.onclick = async (e) => {
            e.stopPropagation();
            dirModalOverlay.style.display = "flex";
            await loadDirectory(masterPathInput.value || node.properties.master_root || "");
        };

        const masterPathInput = document.createElement("input");
        masterPathInput.readOnly = true;
        masterPathInput.style.flex = "1";
        masterPathInput.style.backgroundColor = "#064e3b";
        masterPathInput.style.color = "#a7f3d0";
        masterPathInput.style.border = "1px solid #047857";
        masterPathInput.style.borderRadius = "4px";
        masterPathInput.style.padding = "3px 6px";
        masterPathInput.style.fontSize = "11px";

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
        dbSelect.style.backgroundColor = "#064e3b";
        dbSelect.style.color = "#ecfdf5";
        dbSelect.style.border = "1px solid #047857";
        dbSelect.style.borderRadius = "4px";
        dbSelect.style.padding = "4px";
        dbSelect.style.fontSize = "12px";

        const refreshBtn = document.createElement("button");
        refreshBtn.innerText = "🔄";
        refreshBtn.style.background = "#064e3b";
        refreshBtn.style.color = "#ecfdf5";
        refreshBtn.style.border = "1px solid #047857";
        refreshBtn.style.borderRadius = "4px";
        refreshBtn.style.cursor = "pointer";
        refreshBtn.style.padding = "4px 8px";

        let loadedEntries = [];

        async function updateDbDropdown() {
            try {
                const res = await api.fetchApi("/prompt_driver/list_dbs", {
                    method: "POST",
                    body: JSON.stringify({ master_root: node.properties.master_root })
                });
                const dbs = await res.json();
                dbSelect.innerHTML = "";
                
                const targetDb = node.properties.selected_database || "prompts_db";

                dbs.forEach(db => {
                    const opt = document.createElement("option");
                    opt.value = db;
                    opt.innerText = `📂 ${db}`;
                    if (db === targetDb) opt.selected = true;
                    dbSelect.appendChild(opt);
                });

                if (!dbs.includes(targetDb) && dbs.length > 0) {
                    node.properties.selected_database = dbs[0];
                    dbSelect.value = dbs[0];
                }

                updateBackendWidgets();
                await fetchDatabaseEntries(dbSelect.value);
            } catch (err) {
                console.error("Failed to load driver databases", err);
            }
        }

        async function fetchDatabaseEntries(dbName) {
            try {
                const masterRoot = node.properties.master_root || "";
                const res = await api.fetchApi(`/prompt_tracker/get?db=${encodeURIComponent(dbName)}&master_root=${encodeURIComponent(masterRoot)}`);
                loadedEntries = await res.json();
                updateDisplayState();
            } catch (err) {
                loadedEntries = [];
            }
        }

        dbSelect.onchange = async (e) => {
            e.stopPropagation();
            node.properties.selected_database = dbSelect.value;
            updateBackendWidgets();
            await fetchDatabaseEntries(dbSelect.value);
        };

        refreshBtn.onclick = async (e) => {
            e.stopPropagation();
            await updateDbDropdown();
        };

        dbRow.appendChild(dbSelect);
        dbRow.appendChild(refreshBtn);
        container.appendChild(dbRow);

        const statusRow = document.createElement("div");
        statusRow.style.display = "flex";
        statusRow.style.justifyContent = "space-between";
        statusRow.style.fontSize = "11px";
        statusRow.style.color = "#34d399";
        statusRow.style.fontWeight = "bold";
        statusRow.style.flexShrink = "0";

        const statusLabel = document.createElement("span");
        statusLabel.innerText = "Status: Idle";
        statusRow.appendChild(statusLabel);
        container.appendChild(statusRow);

        const promptPreviewBox = document.createElement("textarea");
        promptPreviewBox.readOnly = true;
        promptPreviewBox.placeholder = "Loaded prompt will appear here...";
        promptPreviewBox.style.width = "100%";
        promptPreviewBox.style.flex = "1";
        promptPreviewBox.style.minHeight = "50px";
        promptPreviewBox.style.backgroundColor = "#064e3b";
        promptPreviewBox.style.color = "#a7f3d0";
        promptPreviewBox.style.border = "1px solid #047857";
        promptPreviewBox.style.borderRadius = "4px";
        promptPreviewBox.style.padding = "5px";
        promptPreviewBox.style.fontSize = "11px";
        promptPreviewBox.style.resize = "none";
        promptPreviewBox.style.boxSizing = "border-box";
        container.appendChild(promptPreviewBox);

        let liveIndex = 0;

        function updateDisplayState() {
            if (node.inputs && node.inputs[1] && node.inputs[1].link != null) {
                const link = app.graph.links[node.inputs[1].link];
                if (link) {
                    const originNode = app.graph.getNodeById(link.origin_id);
                    if (originNode) {
                        const numWidget = originNode.widgets?.find(w => 
                            w.name === "index" || w.name === "value" || w.name === "seed" || w.type === "number"
                        );
                        if (numWidget && typeof numWidget.value === "number") {
                            liveIndex = numWidget.value;
                        }
                    }
                }
            } else {
                const indexWidget = node.widgets.find(w => w.name === "entry_index");
                if (indexWidget) {
                    liveIndex = indexWidget.value;
                }
            }

            const total = loadedEntries.length;

            if (total > 0) {
                const displayNum = Math.max(1, Math.min(parseInt(liveIndex) || 1, total));
                const safeIdx = displayNum - 1;

                statusLabel.innerText = `🟢 Processing item [${displayNum} / ${total}]`;
                promptPreviewBox.value = loadedEntries[safeIdx]?.prompt || "";
            } else {
                statusLabel.innerText = `⚠️ Database Empty [0 / 0]`;
                promptPreviewBox.value = "";
            }
        }

        setInterval(() => {
            updateDisplayState();
        }, 200);

        // Helper to sync widget or saved properties into the UI DOM elements immediately
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
                dbSelect.value = node.properties.selected_database;
            }
        }

        node.onConfigure = async function (o) {
            if (o && o.properties) {
                node.properties = Object.assign({}, node.properties, o.properties);
            }
            syncFromProperties();
            updateBackendWidgets();
            await updateDbDropdown();
        };

        node.addDOMWidget("prompt_driver_panel", "container", container);
        node.setSize([400, 200]);

        syncFromProperties();
        updateBackendWidgets();
        await updateDbDropdown();
    }
});