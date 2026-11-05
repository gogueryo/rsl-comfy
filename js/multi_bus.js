import { app } from "../../scripts/app.js";
import { THEMES, getThemePalette, createThemeDropdown } from "./color_node.js";
import { MAX_SLOTS } from "./config.js";

app.registerExtension({
    name: "rsl.MultiBusReroute",
    async loadedGraphNode(node) {
        if (node.comfyClass === "MultiBusReroute") {
            setupNodePrototype(node);
            ensureSlots(node);
            applyNodeTheme(node);
        }
    },
    nodeCreated(node) {
        if (node.comfyClass === "MultiBusReroute") {
            node.inputs = [];
            node.outputs = [];
            node.size = node.computeSize();
            if (!node.properties) node.properties = {};
            if (!node.properties.activeTheme) node.properties.activeTheme = "bus";
            if (!node.properties.lockedSlots) node.properties.lockedSlots = {};

            setupNodePrototype(node);
            applyNodeTheme(node);
        }
    }
});

function applyNodeTheme(node) {
    const themeKey = node.properties?.activeTheme || "bus";
    const theme = THEMES[themeKey] || THEMES.bus;
    node.color = theme.color;
    node.bgcolor = theme.bgcolor;
    node.setDirtyCanvas(true, true);
}

function setupNodePrototype(node) {
    if (node._rslInitialized) return;
    node._rslInitialized = true;

    if (!node.properties) node.properties = {};
    if (!node.properties.lockedSlots) node.properties.lockedSlots = {};

    const originalGetExtraMenuOptions = node.getExtraMenuOptions;
    node.getExtraMenuOptions = function (_, options) {
        if (originalGetExtraMenuOptions) {
            originalGetExtraMenuOptions.apply(this, arguments);
        }

        // Listed in reverse order so unshift() places them top-to-bottom at the top:

        options.unshift({
            content: "⚡ Spawn BusLink to Right",
            callback: () => inlineSpawnCounterpart(this, "after")
        });
        options.unshift({
            content: "⚡ Spawn BusLink to Left",
            callback: () => inlineSpawnCounterpart(this, "before")
        });
        options.unshift({
            content: "⚡ Spawn BusLink...",
            callback: () => spawnCounterpartBus(this, false)
        });

        options.unshift({
            content: "📦 Clone to Right",
            callback: () => inlineCloneNode(this, "after")
        });
        options.unshift({
            content: "📦 Clone to Left",
            callback: () => inlineCloneNode(this, "before")
        });
        options.unshift({
            content: "📦 Clone Bus Node...",
            callback: () => spawnCounterpartBus(this, true)
        });

        options.unshift({
            content: "⚙️ Manage Bus Slots...",
            callback: () => openBusFloatingMenu(this)
        });
    };

    const origOnConfigure = node.onConfigure;
    node.onConfigure = function (info) {
        if (origOnConfigure) origOnConfigure.apply(this, arguments);
        applyNodeTheme(this);
    };
}

function ensureSlots(node) {
    if (!node.inputs) node.inputs = [];
    if (!node.outputs) node.outputs = [];
    const max = Math.max(node.inputs.length, node.outputs.length);
    while (node.inputs.length < max) {
        const idx = node.inputs.length + 1;
        node.addInput(`bus_${idx}`, "*");
        node.addOutput(`bus_${idx}`, "*");
    }
    for (let i = 0; i < max; i++) {
        const stable = `bus_${i + 1}`;
        if (node.inputs[i]) {
            node.inputs[i].name = stable;
            if (!node.inputs[i].label) node.inputs[i].label = stable;
        }
        if (node.outputs[i]) {
            node.outputs[i].name = stable;
            if (!node.outputs[i].label) node.outputs[i].label = stable;
        }
    }
    node.size = node.computeSize();
}

function inlineCloneNode(sourceNode, inlineMode) {
    const modalTitle = inlineMode === "before" ? "Clone to Left (Inline)" : "Clone to Right (Inline)";

    showAdvancedSlotModal(sourceNode, modalTitle, "Clone Node", (reorderedSlots, globalCopyInputs, globalCopyOutputs) => {
        const targetClass = sourceNode.comfyClass;
        const counterpartNode = LiteGraph.createNode(targetClass);
        if (!counterpartNode) return;

        const targetGraph = sourceNode.graph || app.graph;
        const spacingX = 260;

        if (inlineMode === "before") {
            counterpartNode.pos = [sourceNode.pos[0] - spacingX, sourceNode.pos[1]];
        } else {
            counterpartNode.pos = [sourceNode.pos[0] + spacingX, sourceNode.pos[1]];
        }

        if (sourceNode.title) counterpartNode.title = sourceNode.title;
        targetGraph.add(counterpartNode);

        if (!counterpartNode.properties) counterpartNode.properties = {};
        if (sourceNode.properties) {
            counterpartNode.properties.slot_labels = JSON.parse(JSON.stringify(sourceNode.properties.slot_labels || {}));
            counterpartNode.properties.slots_locked = sourceNode.properties.slots_locked || false;
            counterpartNode.properties.lockedSlots = JSON.parse(JSON.stringify(sourceNode.properties.lockedSlots || {}));
        }

        // Filter only the slots checked to be included
        const activeSlots = reorderedSlots.filter(slotInfo => slotInfo.copy);

        // Build active custom slots with their configured labels
        activeSlots.forEach((slotInfo, i) => {
            const stable = `bus_${i + 1}`;
            counterpartNode.addInput(stable, "*");
            counterpartNode.addOutput(stable, "*");
            const addedIn = counterpartNode.inputs[counterpartNode.inputs.length - 1];
            const addedOut = counterpartNode.outputs[counterpartNode.outputs.length - 1];
            if (addedIn) addedIn.label = slotInfo.label;
            if (addedOut) addedOut.label = slotInfo.label;
        });
        counterpartNode.size = counterpartNode.computeSize();

        if (inlineMode === "after") {
            // Clone is to the right: Source -> Clone, and downstream links move to Clone
            activeSlots.forEach((slotInfo, newIdx) => {
                const origInputIdx = sourceNode.inputs?.findIndex(i => i.name === slotInfo.originalName);
                const origOutputIdx = sourceNode.outputs?.findIndex(o => o.name === slotInfo.originalName);

                if (origOutputIdx !== -1) {
                    sourceNode.connect(origOutputIdx, counterpartNode, newIdx);

                    const origOutput = sourceNode.outputs?.[origOutputIdx];
                    if (globalCopyOutputs && origOutput && origOutput.links) {
                        [...origOutput.links].forEach(linkId => {
                            const linkObj = targetGraph.links[linkId];
                            if (linkObj && linkObj.target_id !== counterpartNode.id) {
                                const targetNode = targetGraph.getNodeById(linkObj.target_id);
                                if (targetNode) {
                                    targetNode.disconnectInput(linkObj.target_slot);
                                    counterpartNode.connect(newIdx, targetNode, linkObj.target_slot);
                                }
                            }
                        });
                    }
                }
            });
        } else if (inlineMode === "before") {
            // Clone is to the left: Upstream -> Clone -> Source
            activeSlots.forEach((slotInfo, newIdx) => {
                const origInputIdx = sourceNode.inputs?.findIndex(i => i.name === slotInfo.originalName);

                if (origInputIdx !== -1) {
                    const origInput = sourceNode.inputs?.[origInputIdx];
                    if (globalCopyInputs && origInput && origInput.link != null) {
                        const linkObj = targetGraph.links[origInput.link];
                        if (linkObj) {
                            const originNode = targetGraph.getNodeById(linkObj.origin_id);
                            if (originNode) {
                                const originSlot = linkObj.origin_slot;
                                sourceNode.disconnectInput(origInputIdx);
                                originNode.connect(originSlot, counterpartNode, newIdx);
                            }
                        }
                    }
                    counterpartNode.connect(newIdx, sourceNode, origInputIdx);
                }
            });
        }

        applyNodeTheme(counterpartNode);
        targetGraph.setDirtyCanvas(true, true);
    });
}
function openBusFloatingMenu(node) {
    const existing = document.getElementById("rsl-bus-menu");
    if (existing) existing.remove();

    if (!node.properties.lockedSlots) {
        node.properties.lockedSlots = {};
    }

    const menu = document.createElement("div");
    menu.id = "rsl-bus-menu";

    menu.style.cssText = `
        position: fixed;
        top: ${window.innerHeight / 2 - 150}px;
        left: ${window.innerWidth / 2 - 140}px;
        background: #18122B;
        border: 2px solid #632EE3;
        border-radius: 10px;
        padding: 14px;
        color: #fff;
        z-index: 10000;
        min-width: 280px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.7);
        font-family: sans-serif;
        font-size: 12px;
    `;

    const title = document.createElement("div");
    title.id = "rsl-bus-menu-header";
    title.style.cssText = "font-weight: bold; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #432C7A; padding-bottom: 8px; color: #E2D9F3; cursor: move; user-select: none;";
    title.innerHTML = `<span>Manage Bus Slots</span>`;

    const titleControls = document.createElement("div");
    titleControls.style.cssText = "display: flex; gap: 6px; align-items: center;";

    const globalLockBtn = document.createElement("button");
    globalLockBtn.title = "Toggle Lock / Unlock All Slots";
    globalLockBtn.style.cssText = "background: #231B3A; border: 1px solid #523996; color: #fff; padding: 2px 6px; border-radius: 4px; cursor: pointer; font-size: 11px;";

    function updateGlobalLockIcon() {
        if (!node.inputs) return;
        const count = Math.max(node.inputs.length, node.outputs.length);
        if (count === 0) return;
        let allLocked = true;
        for (let i = 0; i < count; i++) {
            const stableKey = `bus_${i + 1}`;
            if (node.properties.lockedSlots[stableKey] === false) {
                allLocked = false;
                break;
            }
        }
        globalLockBtn.textContent = allLocked ? "🔓 Unlock All" : "🔒 Lock All";
    }
    updateGlobalLockIcon();

    globalLockBtn.onclick = (e) => {
        e.stopPropagation();
        if (!node.inputs) return;
        const count = Math.max(node.inputs.length, node.outputs.length);
        let allLocked = true;
        for (let i = 0; i < count; i++) {
            const stableKey = `bus_${i + 1}`;
            if (node.properties.lockedSlots[stableKey] === false) {
                allLocked = false;
                break;
            }
        }
        const newState = !allLocked;
        for (let i = 0; i < count; i++) {
            const stableKey = `bus_${i + 1}`;
            node.properties.lockedSlots[stableKey] = newState;
        }
        updateGlobalLockIcon();
        renderRows();
    };

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "×";
    closeBtn.style.cssText = "background: #432C7A; border: none; color: #fff; width: 20px; height: 20px; border-radius: 50%; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center;";
    closeBtn.onclick = () => menu.remove();

    titleControls.appendChild(globalLockBtn);
    titleControls.appendChild(closeBtn);
    title.appendChild(titleControls);
    menu.appendChild(title);

    let isDragging = false;
    let startX = 0, startY = 0;

    title.onmousedown = (e) => {
        if (e.target.tagName === 'BUTTON') return;
        isDragging = true;
        startX = e.clientX - menu.offsetLeft;
        startY = e.clientY - menu.offsetTop;
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
    };

    function onMouseMove(e) {
        if (!isDragging) return;
        menu.style.left = `${e.clientX - startX}px`;
        menu.style.top = `${e.clientY - startY}px`;
    }

    function onMouseUp() {
        isDragging = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
    }

    const listContainer = document.createElement("div");
    listContainer.style.cssText = "max-height: 220px; overflow-y: auto; margin-bottom: 10px; padding-right: 2px;";
    menu.appendChild(listContainer);

    function renderRows() {
        listContainer.innerHTML = "";
        if (!node.inputs || !node.outputs) return;
        const count = Math.max(node.inputs.length, node.outputs.length);
        if (count === 0) {
            const empty = document.createElement("div");
            empty.textContent = "No slots yet";
            empty.style.color = "#888";
            listContainer.appendChild(empty);
            updateGlobalLockIcon();
            return;
        }

        for (let i = 0; i < count; i++) {
            const stableKey = `bus_${i + 1}`;
            if (node.properties.lockedSlots[stableKey] === undefined) {
                node.properties.lockedSlots[stableKey] = true;
            }
            const isLocked = node.properties.lockedSlots[stableKey];

            const row = document.createElement("div");
            row.style.cssText = "display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 6px 8px; margin-bottom: 6px; background: #231B3A; border: 1px solid #432C7A; border-radius: 6px;";

            const nameInput = document.createElement("input");
            nameInput.type = "text";
            nameInput.value = node.inputs[i]?.label || node.inputs[i]?.name || stableKey;
            nameInput.disabled = isLocked;
            nameInput.style.cssText = `flex-grow: 1; background: ${isLocked ? '#120D21' : '#1e1b2e'}; border: 1px solid ${isLocked ? '#322552' : '#523996'}; color: ${isLocked ? '#8e82b0' : '#fff'}; padding: 4px 8px; border-radius: 4px; font-size: 12px;`;

            nameInput.addEventListener("mousedown", (e) => e.stopPropagation());
            nameInput.addEventListener("input", (e) => {
                if (isLocked) return;
                const newLabel = e.target.value;
                if (node.inputs[i]) node.inputs[i].label = newLabel;
                if (node.outputs[i]) node.outputs[i].label = newLabel;
                node.size = node.computeSize();
                const g = node.graph || app.graph;
                if (g) { g._version++; g.setDirtyCanvas(true, true); }
            });

            const lockBtn = document.createElement("button");
            lockBtn.textContent = isLocked ? "🔒" : "🔓";
            lockBtn.title = isLocked ? "Locked (Click to unlock)" : "Unlocked (Click to lock)";
            lockBtn.style.cssText = "background: #120D21; border: 1px solid #523996; border-radius: 4px; cursor: pointer; padding: 4px 6px; font-size: 11px;";
            lockBtn.onclick = (e) => {
                e.stopPropagation();
                node.properties.lockedSlots[stableKey] = !isLocked;
                updateGlobalLockIcon();
                renderRows();
            };

            row.appendChild(nameInput);
            row.appendChild(lockBtn);
            listContainer.appendChild(row);
        }
        updateGlobalLockIcon();
    }

    renderRows();

    const addBtn = document.createElement("button");
    addBtn.textContent = "+ Add Bus Slot";
    addBtn.style.cssText = "width: 100%; background: #632EE3; color: white; border: none; border-radius: 6px; padding: 8px; cursor: pointer; font-weight: bold; margin-top: 4px;";
    addBtn.onclick = () => {
        const currentCount = Math.max(node.inputs.length, node.outputs.length);
        if (currentCount >= MAX_SLOTS) return;

        const newIdx = currentCount + 1;
        const stable = `bus_${newIdx}`;
        node.addInput(stable, "*");
        node.addOutput(stable, "*");
        node.properties.lockedSlots[stable] = true;

        const lastIn = node.inputs[node.inputs.length - 1];
        const lastOut = node.outputs[node.outputs.length - 1];
        if (lastIn) lastIn.label = stable;
        if (lastOut) lastOut.label = stable;
        ensureSlots(node);
        node.size = node.computeSize();
        const g = node.graph || app.graph;
        if (g) { g._version++; g.setDirtyCanvas(true, true); }
        renderRows();
    };
    menu.appendChild(addBtn);

    document.body.appendChild(menu);
}

function spawnCounterpartBus(sourceNode, isClone = false) {
    const targetClass = isClone ? sourceNode.comfyClass : "MultiBusLinkReroute";
    const modalTitle = isClone ? "Clone Bus Node" : "Configure Counterpart & Links";
    const confirmButtonText = isClone ? "Clone Node" : "Spawn Counterpart";

    showAdvancedSlotModal(sourceNode, modalTitle, confirmButtonText, (reorderedSlots, globalCopyInputs, globalCopyOutputs) => {
        const counterpartNode = LiteGraph.createNode(targetClass);
        if (!counterpartNode) {
            console.error(`[MultiBus] Failed to create node for type: ${targetClass}`);
            return;
        }

        counterpartNode.pos = [sourceNode.pos[0] + 260, sourceNode.pos[1]];

        if (sourceNode.title) {
            counterpartNode.title = sourceNode.title;
        }

        const targetGraph = sourceNode.graph || app.graph;
        targetGraph.add(counterpartNode);

        if (!counterpartNode.properties) counterpartNode.properties = {};
        if (sourceNode.properties) {
            counterpartNode.properties.slot_labels = JSON.parse(JSON.stringify(sourceNode.properties.slot_labels || {}));
            counterpartNode.properties.slots_locked = sourceNode.properties.slots_locked || false;
        }

        const activeSlots = reorderedSlots.filter(slotInfo => slotInfo.copy);

        activeSlots.forEach((slotInfo, i) => {
            const stable = `bus_${i + 1}`;
            counterpartNode.addInput(stable, "*");
            counterpartNode.addOutput(stable, "*");

            const addedIn = counterpartNode.inputs[counterpartNode.inputs.length - 1];
            const addedOut = counterpartNode.outputs[counterpartNode.outputs.length - 1];
            if (addedIn) addedIn.label = slotInfo.label;
            if (addedOut) addedOut.label = slotInfo.label;
        });
        counterpartNode.size = counterpartNode.computeSize();

        if (!isClone) {
            const senderOutputIdx = sourceNode.outputs?.findIndex(o => o.name === "bus_link");
            const receiverInputIdx = counterpartNode.inputs?.findIndex(i => i.name === "bus_link");
            if (senderOutputIdx !== -1 && receiverInputIdx !== -1) {
                sourceNode.connect(senderOutputIdx, counterpartNode, receiverInputIdx);
            }
        }

        activeSlots.forEach((slotInfo, newIdx) => {
            const origInput = sourceNode.inputs?.find(i => i.name === slotInfo.originalName);
            const origOutput = sourceNode.outputs?.find(o => o.name === slotInfo.originalName);
            const targetSlotIdx = newIdx;

            if (globalCopyInputs && origInput && origInput.link != null) {
                const linkObj = targetGraph.links[origInput.link];
                if (linkObj) {
                    const originNode = targetGraph.getNodeById(linkObj.origin_id);
                    if (originNode) {
                        originNode.connect(linkObj.origin_slot, counterpartNode, targetSlotIdx);
                    }
                }
            }

            if (globalCopyOutputs && origOutput && origOutput.links && origOutput.links.length > 0) {
                origOutput.links.forEach(linkId => {
                    const linkObj = targetGraph.links[linkId];
                    if (linkObj) {
                        const targetNode = targetGraph.getNodeById(linkObj.target_id);
                        if (targetNode) {
                            counterpartNode.connect(targetSlotIdx, targetNode, linkObj.target_slot);
                        }
                    }
                });
            }
        });

        applyNodeTheme(counterpartNode);
        targetGraph.setDirtyCanvas(true, true);
    });
}

function showAdvancedSlotModal(sourceNode, titleText, confirmButtonText, onConfirm) {
    const existing = document.getElementById("rsl-advanced-spawn-modal");
    if (existing) existing.remove();

    const customInputs = sourceNode.inputs ? sourceNode.inputs.filter(i => i.name !== "bus_link") : [];

    let slotItems = customInputs.map((inp, idx) => ({
        originalName: inp.name || `bus_${idx + 1}`,
        label: inp.label || inp.name || `bus_${idx + 1}`,
        copy: true
    }));

    const panel = document.createElement("div");
    panel.id = "rsl-advanced-spawn-modal";

    panel.style.cssText = `
        position: fixed;
        top: ${window.innerHeight / 2 - 170}px;
        left: ${window.innerWidth / 2 - 170}px;
        background: #18122B;
        border: 2px solid #632EE3;
        border-radius: 10px;
        padding: 16px;
        width: 340px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.7);
        display: flex;
        flex-direction: column;
        gap: 12px;
        z-index: 10001;
        font-family: sans-serif;
        font-size: 12px;
        color: #fff;
        pointer-events: auto;
    `;

    panel.innerHTML = `
        <div id="rsl-modal-header" style="font-weight: bold; font-size: 13px; border-bottom: 1px solid #432C7A; padding-bottom: 6px; color: #E2D9F3; display: flex; justify-content: space-between; align-items: center; cursor: move; user-select: none;">
            <span>${titleText || "Configure Slots & Links"}</span>
            <button id="rsl-spawn-close" style="background: #432C7A; border: none; color: #fff; width: 20px; height: 20px; border-radius: 50%; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center;">×</button>
        </div>
        
        <div style="display: flex; gap: 12px; background: #231B3A; padding: 8px; border-radius: 6px; border: 1px solid #432C7A;">
            <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; color: #E2D9F3;">
                <input type="checkbox" id="rsl-global-inputs" checked style="cursor: pointer;"> Copy Inputs
            </label>
            <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; color: #E2D9F3;">
                <input type="checkbox" id="rsl-global-outputs" checked style="cursor: pointer;"> Copy Outputs
            </label>
        </div>

        <div style="font-size: 11px; color: #b1a5d6;">Drag ⠿ to rearrange, edit name, or uncheck to omit:</div>
        <div id="rsl-slot-list-container" style="max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding-right: 2px;"></div>
        
        <div style="display: flex; gap: 8px; margin-top: 4px;">
            <button id="rsl-spawn-confirm" style="flex: 1; background: #632EE3; color: white; border: none; border-radius: 6px; padding: 6px; cursor: pointer; font-weight: bold;">${confirmButtonText || "Confirm"}</button>
            <button id="rsl-spawn-cancel" style="flex: 1; background: #231B3A; color: #ccc; border: none; border-radius: 6px; padding: 6px; cursor: pointer;">Cancel</button>
        </div>
    `;

    document.body.appendChild(panel);

    const header = panel.querySelector("#rsl-modal-header");
    let isDragging = false, startX = 0, startY = 0;
    header.onmousedown = (e) => {
        isDragging = true;
        startX = e.clientX - panel.offsetLeft;
        startY = e.clientY - panel.offsetTop;
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
    };
    function onMouseMove(e) {
        if (!isDragging) return;
        panel.style.left = `${e.clientX - startX}px`;
        panel.style.top = `${e.clientY - startY}px`;
    }
    function onMouseUp() {
        isDragging = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
    }

    const listContainer = panel.querySelector("#rsl-slot-list-container");

    function renderList() {
        listContainer.innerHTML = "";
        if (slotItems.length === 0) {
            listContainer.innerHTML = `<div style="color: #888; text-align: center; padding: 12px;">No custom slots to configure</div>`;
            return;
        }

        slotItems.forEach((item, index) => {
            const row = document.createElement("div");
            row.draggable = true;
            row.dataset.index = index;
            row.style.cssText = `
                display: flex; align-items: center; gap: 6px; background: #231B3A;
                border: 1px solid #432C7A; border-radius: 6px; padding: 6px 8px;
                cursor: grab; user-select: none;
            `;

            row.innerHTML = `
                <span style="cursor: grab; color: #E2D9F3; font-weight: bold; font-size: 14px;">⠿</span>
                <input type="text" class="rsl-slot-label-input" value="${item.label}" style="flex-grow: 1; background: #120D21; border: 1px solid #523996; color: #fff; padding: 3px 6px; border-radius: 4px; font-size: 11px;">
                <label style="display: flex; align-items: center; gap: 3px; font-size: 11px; cursor: pointer; color: #E2D9F3;" onclick="event.stopPropagation()">
                    <input type="checkbox" class="rsl-slot-copy-cb" ${item.copy ? "checked" : ""} style="cursor: pointer;"> Include
                </label>
            `;

            const labelInput = row.querySelector(".rsl-slot-label-input");
            labelInput.addEventListener("mousedown", (e) => e.stopPropagation());
            labelInput.addEventListener("input", (e) => {
                slotItems[index].label = e.target.value;
            });

            const cb = row.querySelector(".rsl-slot-copy-cb");
            cb.onchange = (e) => {
                slotItems[index].copy = e.target.checked;
            };

            row.ondragstart = (e) => {
                e.dataTransfer.setData("text/plain", index);
                row.style.opacity = "0.4";
            };
            row.ondragend = () => { row.style.opacity = "1"; };
            row.ondragover = (e) => { e.preventDefault(); };
            row.ondrop = (e) => {
                e.preventDefault();
                const draggedIdx = parseInt(e.dataTransfer.getData("text/plain"), 10);
                const targetIdx = index;
                if (draggedIdx !== targetIdx) {
                    const movedItem = slotItems.splice(draggedIdx, 1)[0];
                    slotItems.splice(targetIdx, 0, movedItem);
                    renderList();
                }
            };

            listContainer.appendChild(row);
        });
    }

    renderList();

    panel.querySelector("#rsl-spawn-confirm").onclick = () => {
        const globalCopyInputs = panel.querySelector("#rsl-global-inputs").checked;
        const globalCopyOutputs = panel.querySelector("#rsl-global-outputs").checked;
        panel.remove();
        onConfirm(slotItems, globalCopyInputs, globalCopyOutputs);
    };

    panel.querySelector("#rsl-spawn-cancel").onclick = () => panel.remove();
    panel.querySelector("#rsl-spawn-close").onclick = () => panel.remove();
}

function inlineSpawnCounterpart(sourceNode, inlineMode) {
    const targetClass = "MultiBusLinkReroute"; // Counterpart class
    const modalTitle = inlineMode === "before" ? "Spawn Counterpart to Left (Inline)" : "Spawn Counterpart to Right (Inline)";

    showAdvancedSlotModal(sourceNode, modalTitle, "Spawn Counterpart", (reorderedSlots, globalCopyInputs, globalCopyOutputs) => {
        const counterpartNode = LiteGraph.createNode(targetClass);
        if (!counterpartNode) return;

        const targetGraph = sourceNode.graph || app.graph;
        const spacingX = 260;

        if (inlineMode === "before") {
            counterpartNode.pos = [sourceNode.pos[0] - spacingX, sourceNode.pos[1]];
        } else {
            counterpartNode.pos = [sourceNode.pos[0] + spacingX, sourceNode.pos[1]];
        }

        if (sourceNode.title) counterpartNode.title = sourceNode.title;
        targetGraph.add(counterpartNode);

        if (!counterpartNode.properties) counterpartNode.properties = {};
        if (sourceNode.properties) {
            counterpartNode.properties.slot_labels = JSON.parse(JSON.stringify(sourceNode.properties.slot_labels || {}));
            counterpartNode.properties.slots_locked = sourceNode.properties.slots_locked || false;
            counterpartNode.properties.lockedSlots = JSON.parse(JSON.stringify(sourceNode.properties.lockedSlots || {}));
        }

        // Ensure link symmetry for the counterpart link node
        if (typeof ensureBusLinkSymmetry === "function") {
            ensureBusLinkSymmetry(counterpartNode);
        }

        const activeSlots = reorderedSlots.filter(slotInfo => slotInfo.copy);

        // Build active custom slots (offset by 1 because slot 0 is bus_link)
        activeSlots.forEach((slotInfo, i) => {
            const stable = `bus_${i + 1}`;
            counterpartNode.inputs.push({ name: stable, type: "*", label: slotInfo.label });
            counterpartNode.outputs.push({ name: stable, type: "*", label: slotInfo.label });
        });
        counterpartNode.size = counterpartNode.computeSize();

        // Wire core bus_link (Slot 0) and custom slots based on direction
        const counterpartBusOutIdx = counterpartNode.outputs?.findIndex(o => o.name === "bus_link");
        const counterpartBusInIdx = counterpartNode.inputs?.findIndex(i => i.name === "bus_link");

        if (inlineMode === "after") {
            // Source (Sender) -> Counterpart (Receiver) for bus_link
            if (counterpartBusInIdx !== -1) {
                // If source has a bus output, connect it
                const sourceBusOutIdx = sourceNode.outputs?.findIndex(o => o.name === "bus_link");
                if (sourceBusOutIdx !== -1) {
                    sourceNode.connect(sourceBusOutIdx, counterpartNode, counterpartBusInIdx);
                }
            }

            activeSlots.forEach((slotInfo, newIdx) => {
                const targetSlotIdx = newIdx + 1; // +1 offset for link node
                const origOutputIdx = sourceNode.outputs?.findIndex(o => o.name === slotInfo.originalName);

                if (origOutputIdx !== -1) {
                    sourceNode.connect(origOutputIdx, counterpartNode, targetSlotIdx);

                    const origOutput = sourceNode.outputs?.[origOutputIdx];
                    if (globalCopyOutputs && origOutput && origOutput.links) {
                        [...origOutput.links].forEach(linkId => {
                            const linkObj = targetGraph.links[linkId];
                            if (linkObj && linkObj.target_id !== counterpartNode.id) {
                                const targetNode = targetGraph.getNodeById(linkObj.target_id);
                                if (targetNode) {
                                    targetNode.disconnectInput(linkObj.target_slot);
                                    counterpartNode.connect(targetSlotIdx, targetNode, linkObj.target_slot);
                                }
                            }
                        });
                    }
                }
            });
        } else if (inlineMode === "before") {
            // Counterpart (Sender) -> Source (Receiver) for bus_link
            if (counterpartBusOutIdx !== -1) {
                const sourceBusInIdx = sourceNode.inputs?.findIndex(i => i.name === "bus_link");
                if (sourceBusInIdx !== -1) {
                    counterpartNode.connect(counterpartBusOutIdx, sourceNode, sourceBusInIdx);
                }
            }

            activeSlots.forEach((slotInfo, newIdx) => {
                const targetSlotIdx = newIdx + 1; // +1 offset for link node
                const origInputIdx = sourceNode.inputs?.findIndex(i => i.name === slotInfo.originalName);

                if (origInputIdx !== -1) {
                    const origInput = sourceNode.inputs?.[origInputIdx];
                    if (globalCopyInputs && origInput && origInput.link != null) {
                        const linkObj = targetGraph.links[origInput.link];
                        if (linkObj) {
                            const originNode = targetGraph.getNodeById(linkObj.origin_id);
                            if (originNode) {
                                const originSlot = linkObj.origin_slot;
                                sourceNode.disconnectInput(origInputIdx);
                                originNode.connect(originSlot, counterpartNode, targetSlotIdx);
                            }
                        }
                    }
                    counterpartNode.connect(targetSlotIdx, sourceNode, origInputIdx);
                }
            });
        }

        applyNodeTheme(counterpartNode);
        targetGraph.setDirtyCanvas(true, true);
    });
}