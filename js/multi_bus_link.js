import { app } from "../../scripts/app.js";
import { THEMES } from "./color_node.js";
import { MAX_SLOTS } from "./config.js";

if (window.LiteGraph) {
    window.LiteGraph.registered_slot_types = window.LiteGraph.registered_slot_types || {};
    window.LiteGraph.registered_slot_types["RSL_BUS_LINK"] = "#FF7A00";
    window.LiteGraph.slot_types_colors = window.LiteGraph.slot_types_colors || {};
    window.LiteGraph.slot_types_colors["RSL_BUS_LINK"] = "#FF7A00";
}

app.registerExtension({
    name: "rsl.MultiBusLinkReroute",
    async loadedGraphNode(node) {
        if (node.comfyClass === "MultiBusLinkReroute") {
            setupNodePrototype(node);
            ensureBusLinkSymmetry(node);
            applyNodeTheme(node);
        }
    },
    nodeCreated(node) {
        if (node.comfyClass === "MultiBusLinkReroute") {
            node.inputs = [];
            node.outputs = [];
            if (!node.properties) node.properties = {};
            if (!node.properties.activeTheme) node.properties.activeTheme = "buslink";
            if (!node.properties.lockedSlots) node.properties.lockedSlots = {};

            setupNodePrototype(node);
            ensureBusLinkSymmetry(node);
            applyNodeTheme(node);
        }
    }
});

function applyNodeTheme(node) {
    const themeKey = node.properties?.activeTheme || "buslink";
    const theme = THEMES[themeKey] || THEMES.buslink;
    node.color = theme.color;
    node.bgcolor = theme.bgcolor;
    node.setDirtyCanvas(true, true);
}

function ensureBusLinkSymmetry(node) {
    if (!node.inputs) node.inputs = [];
    if (!node.outputs) node.outputs = [];

    if (node.inputs.length === 0) {
        node.inputs.push({ name: "bus_link", type: "RSL_BUS_LINK", label: "bus_link" });
    } else {
        let existingIdx = node.inputs.findIndex(i => i.name === "bus_link" || i.label === "bus_link");
        if (existingIdx > 0) {
            let slot = node.inputs.splice(existingIdx, 1)[0];
            slot.name = "bus_link";
            slot.type = "RSL_BUS_LINK";
            slot.label = "bus_link";
            node.inputs.unshift(slot);
        } else if (existingIdx === -1) {
            node.inputs.unshift({ name: "bus_link", type: "RSL_BUS_LINK", label: "bus_link" });
        } else {
            node.inputs[0].name = "bus_link";
            node.inputs[0].type = "RSL_BUS_LINK";
            node.inputs[0].label = "bus_link";
        }
    }

    if (node.outputs.length === 0) {
        node.outputs.push({ name: "bus_link", type: "RSL_BUS_LINK", label: "bus_link" });
    } else {
        let existingIdx = node.outputs.findIndex(o => o.name === "bus_link" || o.label === "bus_link");
        if (existingIdx > 0) {
            let slot = node.outputs.splice(existingIdx, 1)[0];
            slot.name = "bus_link";
            slot.type = "RSL_BUS_LINK";
            slot.label = "bus_link";
            node.outputs.unshift(slot);
        } else if (existingIdx === -1) {
            node.outputs.unshift({ name: "bus_link", type: "RSL_BUS_LINK", label: "bus_link" });
        } else {
            node.outputs[0].name = "bus_link";
            node.outputs[0].type = "RSL_BUS_LINK";
            node.outputs[0].label = "bus_link";
        }
    }

    const maxSlots = Math.max(node.inputs.length, node.outputs.length);
    for (let i = 1; i < maxSlots; i++) {
        const stableName = `bus_${i}`;

        if (!node.inputs[i]) {
            node.inputs[i] = { name: stableName, type: "*", label: `slot_${i}` };
        } else {
            node.inputs[i].name = stableName;
            node.inputs[i].type = "*";
            if (!node.inputs[i].label) node.inputs[i].label = stableName;
        }

        if (!node.outputs[i]) {
            node.outputs[i] = { name: stableName, type: "*", label: node.inputs[i].label };
        } else {
            node.outputs[i].name = stableName;
            node.outputs[i].type = "*";
            node.outputs[i].label = node.inputs[i].label;
        }
    }

    node.size = node.computeSize();
}

function updateSlotMapWidget(node) {
    let widget = node.widgets.find(w => w.name === "slot_map_json");
    if (!widget) {
        widget = node.addWidget("text", "slot_map_json", "{}", () => { });
    }

    widget.type = "hidden";
    widget.computeSize = () => [0, -4];
    widget.draw = function () { };

    const map = {};
    const busInputs = node.inputs.filter(i => i.name !== "bus_link");
    busInputs.forEach((inp, idx) => {
        const stableKey = `bus_${idx + 1}`;
        map[stableKey] = inp.label || inp.name;
    });

    widget.value = JSON.stringify(map);
}

function setupNodePrototype(node) {
    if (node._rslInitialized) return;
    node._rslInitialized = true;

    if (!node.widgets) node.widgets = [];
    if (!node.properties) node.properties = {};
    if (!node.properties.lockedSlots) node.properties.lockedSlots = {};

    updateSlotMapWidget(node);

    const originalSerialize = node.serialize;
    node.serialize = function () {
        updateSlotMapWidget(this);
        if (originalSerialize) return originalSerialize.apply(this, arguments);
        return {};
    };

    const originalGetExtraMenuOptions = node.getExtraMenuOptions;
    node.getExtraMenuOptions = function (_, options) {
        if (originalGetExtraMenuOptions) {
            originalGetExtraMenuOptions.apply(this, arguments);
        }

        options.unshift({
            content: "⚡ Spawn Bus...",
            callback: () => executeSpawnBlueprint(this)
        });
        options.unshift({
            content: "📦 Clone...",
            callback: () => executeCloneBlueprint(this)
        });
        options.unshift({
            content: "⚙️ Manage Bus Slots...",
            callback: () => executeManageBusSlots(this)
        });
    };

    const origOnConfigure = node.onConfigure;
    node.onConfigure = function (info) {
        if (origOnConfigure) origOnConfigure.apply(this, arguments);
        applyNodeTheme(this);
        if (this.inputs?.some(i => i.name === "bus_link" || i.type === "RSL_BUS_LINK")) {
            ensureBusLinkSymmetry(this);
        }
        updateSlotMapWidget(this);
    };

    node.onConnectInput = function (target_slot, type, output_info, node_from, slot_from) {
        const hasBusLink = this.inputs?.some(i => i.name === "bus_link" || i.type === "RSL_BUS_LINK");
        if (hasBusLink && target_slot === 0) {
            return type === "RSL_BUS_LINK";
        }
        return true;
    };

    node.onConnectOutput = function (slot, type, input_info, target_node, target_slot) {
        const hasBusLink = this.outputs?.some(o => o.name === "bus_link" || o.type === "RSL_BUS_LINK");
        if (hasBusLink && slot === 0) {
            return type === "RSL_BUS_LINK";
        }
        return true;
    };

    node.getConnectionColor = function (is_input, slot_index, link_info, node_slot) {
        const hasBusLink = (is_input ? this.inputs : this.outputs)?.some(s => s.name === "bus_link" || s.type === "RSL_BUS_LINK");
        if (hasBusLink && (slot_index === 0 || node_slot?.type === "RSL_BUS_LINK" || link_info?.type === "RSL_BUS_LINK")) {
            return "#FF7A00";
        }
        return null;
    };
}

// =========================================================================
// ISOLATED PLACEMENT HANDLER FUNCTIONS
// =========================================================================

function applyInplacePlacement(targetGraph, originalNode, newNode, finalSlots, copyInputFlag, copyOutputFlag, hasBusLink) {
    const targetBusInputIdx = newNode.inputs.findIndex(i => i.name === "bus_link" || i.type === "RSL_BUS_LINK");
    const targetBusOutputIdx = newNode.outputs.findIndex(o => o.name === "bus_link" || o.type === "RSL_BUS_LINK");

    if (hasBusLink) {
        const origBusInput = originalNode.inputs?.[0];
        const origBusOutput = originalNode.outputs?.[0];
        if (origBusInput && origBusInput.link != null && targetBusInputIdx !== -1) {
            const linkObj = targetGraph.links[origBusInput.link];
            if (linkObj) {
                const originNode = targetGraph.getNodeById(linkObj.origin_id);
                if (originNode) {
                    originNode.connect(linkObj.origin_slot, newNode, targetBusInputIdx);
                }
            }
        }
        if (origBusOutput && origBusOutput.links && origBusOutput.links.length > 0 && targetBusOutputIdx !== -1) {
            origBusOutput.links.forEach(linkId => {
                const linkObj = targetGraph.links[linkId];
                if (linkObj) {
                    const targetNode = targetGraph.getNodeById(linkObj.target_id);
                    if (targetNode) {
                        newNode.connect(targetBusOutputIdx, targetNode, linkObj.target_slot);
                    }
                }
            });
        }
    }

    finalSlots.forEach((slot, targetIdx) => {
        const actualSlotIdx = hasBusLink ? targetIdx + 1 : targetIdx;

        if (slot.input !== null && slot.input !== undefined && copyInputFlag) {
            const linkObj = targetGraph.links[slot.input];
            if (linkObj) {
                const originNode = targetGraph.getNodeById(linkObj.origin_id);
                if (originNode) {
                    originNode.connect(linkObj.origin_slot, newNode, actualSlotIdx);
                }
            }
        }
        if (slot.output !== null && slot.output !== undefined && copyOutputFlag) {
            const linkIds = Array.isArray(slot.output) ? slot.output : [slot.output];
            linkIds.forEach(linkId => {
                const linkObj = targetGraph.links[linkId];
                if (linkObj) {
                    const targetNode = targetGraph.getNodeById(linkObj.target_id);
                    if (targetNode) {
                        newNode.connect(actualSlotIdx, targetNode, linkObj.target_slot);
                    }
                }
            });
        }
    });
}

function applyLeftPlacement(targetGraph, originalNode, newNode, finalSlots, copyInputFlag, copyOutputFlag, hasBusLink) {
    const targetBusInputIdx = newNode.inputs.findIndex(i => i.name === "bus_link" || i.type === "RSL_BUS_LINK");
    const targetBusOutputIdx = newNode.outputs.findIndex(o => o.name === "bus_link" || o.type === "RSL_BUS_LINK");

    if (hasBusLink) {
        const origBusInput = originalNode.inputs?.[0];
        const hasSourceBusLink = origBusInput && (origBusInput.type === "RSL_BUS_LINK" || origBusInput.name === "bus_link") && origBusInput.link != null;
        if (hasSourceBusLink) {
            if (origBusInput.link != null && targetBusInputIdx !== -1) {
                const linkObj = targetGraph.links[origBusInput.link];
                if (linkObj) {
                    const originNode = targetGraph.getNodeById(linkObj.origin_id);
                    if (originNode) {
                        targetGraph.removeLink(origBusInput.link);
                        originNode.connect(linkObj.origin_slot, newNode, targetBusInputIdx);
                    }
                }
            }
            if (targetBusOutputIdx !== -1) {
                newNode.connect(targetBusOutputIdx, originalNode, 0);
            }
        }
    }

    finalSlots.forEach((slot, targetIdx) => {
        const actualSlotIdx = hasBusLink ? targetIdx + 1 : targetIdx;

        if (slot.input !== null && slot.input !== undefined && copyInputFlag) {
            const linkObj = targetGraph.links[slot.input];
            if (linkObj) {
                const originNode = targetGraph.getNodeById(linkObj.origin_id);
                if (originNode) {
                    const origSlot = linkObj.origin_slot;
                    targetGraph.removeLink(slot.input);
                    originNode.connect(origSlot, newNode, actualSlotIdx);
                }
            }
        }
        if (copyOutputFlag && slot.input !== null && slot.input !== undefined) {
            let origInputIdx = originalNode.inputs.findIndex(inp => (inp.label || inp.name) === slot.slot_name);
            if (origInputIdx === -1) {
                origInputIdx = hasBusLink ? targetIdx + 1 : targetIdx;
            }
            if (origInputIdx !== -1) {
                newNode.connect(actualSlotIdx, originalNode, origInputIdx);
            }
        }
    });
}

function applyRightPlacement(targetGraph, originalNode, newNode, finalSlots, copyInputFlag, copyOutputFlag, hasBusLink) {
    const targetBusInputIdx = newNode.inputs.findIndex(i => i.name === "bus_link" || i.type === "RSL_BUS_LINK");
    const targetBusOutputIdx = newNode.outputs.findIndex(o => o.name === "bus_link" || o.type === "RSL_BUS_LINK");

    if (hasBusLink) {
        const origBusOutput = originalNode.outputs?.[0];
        if (origBusOutput && origBusOutput.links && origBusOutput.links.length > 0 && targetBusOutputIdx !== -1) {
            [...origBusOutput.links].forEach(linkId => {
                const linkObj = targetGraph.links[linkId];
                if (linkObj) {
                    const targetNode = targetGraph.getNodeById(linkObj.target_id);
                    if (targetNode && targetNode.id !== newNode.id) {
                        targetGraph.removeLink(linkId);
                        newNode.connect(targetBusOutputIdx, targetNode, linkObj.target_slot);
                    }
                }
            });
        }
        const origOutputBusIdx = originalNode.outputs?.findIndex(o => o.name === "bus_link" || o.type === "RSL_BUS_LINK") ?? 0;
        if (targetBusInputIdx !== -1) {
            originalNode.connect(origOutputBusIdx, newNode, targetBusInputIdx);
        }
    }

    finalSlots.forEach((slot, targetIdx) => {
        const actualSlotIdx = hasBusLink ? targetIdx + 1 : targetIdx;

        if (slot.output !== null && slot.output !== undefined) {
            if (copyOutputFlag) {
                const linkIds = Array.isArray(slot.output) ? slot.output : [slot.output];
                linkIds.forEach(linkId => {
                    const linkObj = targetGraph.links[linkId];
                    if (linkObj) {
                        const targetNode = targetGraph.getNodeById(linkObj.target_id);
                        if (targetNode && targetNode.id !== newNode.id) {
                            targetGraph.removeLink(linkId);
                            newNode.connect(actualSlotIdx, targetNode, linkObj.target_slot);
                        }
                    }
                });
            }

            if (copyInputFlag) {
                let origOutputIdx = originalNode.outputs.findIndex(out => (out.label || out.name) === slot.slot_name);
                if (origOutputIdx === -1) {
                    origOutputIdx = hasBusLink ? targetIdx + 1 : targetIdx;
                }
                if (origOutputIdx !== -1) {
                    originalNode.connect(origOutputIdx, newNode, actualSlotIdx);
                }
            }
        }
    });
}

// =========================================================================
// MANAGE BUS SLOTS IMPLEMENTATION
// =========================================================================

function executeManageBusSlots(node) {
    const hasBusLink = node.inputs?.some(i => i.name === "bus_link" || i.type === "RSL_BUS_LINK");
    const customInputs = node.inputs ? node.inputs.filter(i => i.name !== "bus_link") : [];
    const customOutputs = node.outputs ? node.outputs.filter(o => o.name !== "bus_link") : [];

    let slotArray = customInputs.map((inp, idx) => {
        const out = customOutputs[idx];
        return {
            slot_name: inp.label || inp.name || `bus_${idx + 1}`,
            label: inp.label || inp.name || `bus_${idx + 1}`,
            input: inp.link != null ? inp.link : null,
            output: out && out.links && out.links.length > 0 ? out.links : null,
            included: true
        };
    });

    showPopupModal(node, slotArray, "manage", (finalSlots) => {
        const targetGraph = node.graph || app.graph;

        if (hasBusLink) {
            ensureBusLinkSymmetry(node);
            node.inputs = [node.inputs[0]];
            node.outputs = [node.outputs[0]];
        } else {
            node.inputs = [];
            node.outputs = [];
        }

        finalSlots.forEach(slot => {
            node.inputs.push({ name: slot.slot_name, type: "*", label: slot.label || slot.slot_name });
            node.outputs.push({ name: slot.slot_name, type: "*", label: slot.label || slot.slot_name });
        });

        node.size = node.computeSize();
        updateSlotMapWidget(node);
        targetGraph.setDirtyCanvas(true, true);
    });
}

// =========================================================================
// SPAWN BLUEPRINT IMPLEMENTATION
// =========================================================================

function executeSpawnBlueprint(originalNode) {
    const sourceClass = originalNode.comfyClass;
    const targetClass = sourceClass === "MultiBusLinkReroute" ? "MultiBusReroute" : "MultiBusLinkReroute";
    const targetHasBusLink = targetClass === "MultiBusLinkReroute";

    const hasBusLink = originalNode.inputs?.some(i => i.name === "bus_link" || i.type === "RSL_BUS_LINK");
    
    let slotArray = [];
    const sourceInputs = originalNode.inputs || [];
    const sourceOutputs = originalNode.outputs || [];

    sourceInputs.forEach((inp, idx) => {
        if (hasBusLink && (inp.name === "bus_link" || inp.type === "RSL_BUS_LINK")) return;
        const out = sourceOutputs[idx];
        slotArray.push({
            slot_name: inp.label || inp.name || `bus_${idx}`,
            label: inp.label || inp.name || `bus_${idx}`,
            input: inp.link != null ? inp.link : null,
            output: out && out.links && out.links.length > 0 ? out.links : null,
            included: true
        });
    });

    showPopupModal(originalNode, slotArray, "spawn", (finalSlots, copyInputFlag, copyOutputFlag, placement) => {
        const targetGraph = originalNode.graph || app.graph;

        const newNode = LiteGraph.createNode(targetClass);
        if (!newNode) return;

        let newPos = [...originalNode.pos];
        const offsetWidth = (originalNode.size && originalNode.size[0] ? originalNode.size[0] : 220) + 60;

        newPos[1] += 50;
        if (placement === "left") {
            newPos[0] -= offsetWidth;
        } else if (placement === "right") {
            newPos[0] += offsetWidth;
        } else {
            newPos[0] += 25;
        }
        newNode.pos = newPos;

        if (originalNode.title) newNode.title = originalNode.title;
        targetGraph.add(newNode);

        if (!newNode.properties) newNode.properties = {};
        if (originalNode.properties) {
            newNode.properties.slot_labels = JSON.parse(JSON.stringify(originalNode.properties.slot_labels || {}));
            newNode.properties.slots_locked = originalNode.properties.slots_locked || false;
            newNode.properties.lockedSlots = JSON.parse(JSON.stringify(originalNode.properties.lockedSlots || {}));
        }

        newNode.properties.activeTheme = "bus";

        if (targetHasBusLink) {
            ensureBusLinkSymmetry(newNode);
            newNode.inputs = [newNode.inputs[0]];
            newNode.outputs = [newNode.outputs[0]];
        } else {
            newNode.inputs = [];
            newNode.outputs = [];
        }

        finalSlots.forEach(slot => {
            newNode.inputs.push({ name: slot.slot_name, type: "*", label: slot.label || slot.slot_name });
            newNode.outputs.push({ name: slot.slot_name, type: "*", label: slot.label || slot.slot_name });
        });
        newNode.size = newNode.computeSize();

        if (placement === "inplace") {
            applyInplacePlacement(targetGraph, originalNode, newNode, finalSlots, copyInputFlag, copyOutputFlag, targetHasBusLink);
        } else if (placement === "left") {
            applyLeftPlacement(targetGraph, originalNode, newNode, finalSlots, copyInputFlag, copyOutputFlag, targetHasBusLink);
        } else if (placement === "right") {
            applyRightPlacement(targetGraph, originalNode, newNode, finalSlots, copyInputFlag, copyOutputFlag, targetHasBusLink);
        }

        updateSlotMapWidget(newNode);
        applyNodeTheme(newNode);
        targetGraph.setDirtyCanvas(true, true);
    });
}

// =========================================================================
// CLONE BLUEPRINT IMPLEMENTATION
// =========================================================================

function executeCloneBlueprint(originalNode) {
    const customInputs = originalNode.inputs ? originalNode.inputs.filter(i => i.name !== "bus_link") : [];
    const customOutputs = originalNode.outputs ? originalNode.outputs.filter(o => o.name !== "bus_link") : [];

    let slotArray = customInputs.map((inp, idx) => {
        const out = customOutputs[idx];
        return {
            slot_name: inp.label || inp.name || `bus_${idx + 1}`,
            label: inp.label || inp.name || `bus_${idx + 1}`,
            input: inp.link != null ? inp.link : null,
            output: out && out.links && out.links.length > 0 ? out.links : null,
            included: true
        };
    });

    showPopupModal(originalNode, slotArray, "clone", (finalSlots, copyInputFlag, copyOutputFlag, placement, copyBusLink) => {
        const targetGraph = originalNode.graph || app.graph;
        const targetClass = originalNode.comfyClass;

        const newNode = LiteGraph.createNode(targetClass);
        if (!newNode) return;

        let newPos = [...originalNode.pos];
        const offsetWidth = (originalNode.size && originalNode.size[0] ? originalNode.size[0] : 220) + 60;

        newPos[1] += 50;
        if (placement === "left") {
            newPos[0] -= offsetWidth;
        } else if (placement === "right") {
            newPos[0] += offsetWidth;
        } else {
            newPos[0] += 25;
        }
        newNode.pos = newPos;

        if (originalNode.title) newNode.title = originalNode.title;
        targetGraph.add(newNode);

        if (!newNode.properties) newNode.properties = {};
        if (originalNode.properties) {
            newNode.properties.slot_labels = JSON.parse(JSON.stringify(originalNode.properties.slot_labels || {}));
            newNode.properties.slots_locked = originalNode.properties.slots_locked || false;
            newNode.properties.lockedSlots = JSON.parse(JSON.stringify(originalNode.properties.lockedSlots || {}));
        }

        ensureBusLinkSymmetry(newNode);

        newNode.inputs = [newNode.inputs[0]]; 
        newNode.outputs = [newNode.outputs[0]]; 

        finalSlots.forEach(slot => {
            newNode.inputs.push({ name: slot.slot_name, type: "*", label: slot.label || slot.slot_name });
            newNode.outputs.push({ name: slot.slot_name, type: "*", label: slot.label || slot.slot_name });
        });
        newNode.size = newNode.computeSize();

        if (placement === "inplace") {
            applyInplacePlacement(targetGraph, originalNode, newNode, finalSlots, copyInputFlag, copyOutputFlag, copyBusLink);
        } else if (placement === "left") {
            applyLeftPlacement(targetGraph, originalNode, newNode, finalSlots, copyInputFlag, copyOutputFlag, copyBusLink);
        } else if (placement === "right") {
            applyRightPlacement(targetGraph, originalNode, newNode, finalSlots, copyInputFlag, copyOutputFlag, copyBusLink);
        }

        updateSlotMapWidget(newNode);
        applyNodeTheme(newNode);
        targetGraph.setDirtyCanvas(true, true);
    });
}

// =========================================================================
// UNIFIED POPUP MODAL (Reordering enabled for Spawn/Clone, disabled for Manage)
// =========================================================================

function showPopupModal(originalNode, initialSlots, mode, onComplete) {
    const existing = document.getElementById("rsl-popup-modal");
    if (existing) existing.remove();

    let slotArray = JSON.parse(JSON.stringify(initialSlots));
    let selectedPlacement = "inplace";

    const isSpawn = mode === "spawn";
    const isManage = mode === "manage";
    const allowReorder = !isManage; // Reordering allowed for spawn & clone, disabled for manage

    const bgPrimary = isManage ? "#0f172a" : (isSpawn ? "#3b0764" : "#082f49");
    const borderPrimary = isManage ? "#475569" : (isSpawn ? "#a855f7" : "#0284c7");
    const titleText = isManage ? "Manage Bus Slots" : (isSpawn ? "Spawn Multi-Bus Counterpart" : "Clone & Configure Node");
    const accentText = isManage ? "#94a3b8" : (isSpawn ? "#c084fc" : "#38bdf8");
    const btnBg = isManage ? "#334155" : (isSpawn ? "#9333ea" : "#0284c7");
    const boxBg = isManage ? "#1e293b" : (isSpawn ? "#581c87" : "#0c4a6e");

    const panel = document.createElement("div");
    panel.id = "rsl-popup-modal";
    panel.style.cssText = `
        position: fixed;
        top: ${window.innerHeight / 2 - 220}px;
        left: ${window.innerWidth / 2 - 180}px;
        background: ${bgPrimary};
        border: 2px solid ${borderPrimary};
        border-radius: 10px;
        padding: 16px;
        width: 360px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.7);
        display: flex;
        flex-direction: column;
        gap: 12px;
        z-index: 10001;
        font-family: sans-serif;
        font-size: 12px;
        color: #fff;
    `;

    panel.innerHTML = `
        <div id="rsl-modal-titlebar" style="font-weight: bold; font-size: 13px; border-bottom: 1px solid ${borderPrimary}; padding-bottom: 6px; color: ${accentText}; display: flex; justify-content: space-between; align-items: center; cursor: move; user-select: none;">
            <span>${titleText}</span>
            <button id="rsl-modal-close" style="background: ${boxBg}; border: none; color: #fff; width: 20px; height: 20px; border-radius: 50%; cursor: pointer;">×</button>
        </div>

        <div id="rsl-modal-error" style="display: none; background: #991b1b; color: #f87171; padding: 6px 8px; border-radius: 4px; font-size: 11px; border: 1px solid #f87171;"></div>

        ${isManage ? '' : `
        <div style="display: flex; flex-direction: column; gap: 8px; background: ${boxBg}; padding: 8px; border-radius: 6px; border: 1px solid${borderPrimary};">
            <div style="display: flex; gap: 12px;">
                <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;"><input type="checkbox" id="rsl-copy-input" checked> Copy Input</label>
                <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;"><input type="checkbox" id="rsl-copy-output" checked> Copy Output</label>
            </div>
            ${isSpawn ? '' : `
            <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                <input type="checkbox" id="rsl-copy-buslink" checked> Copy Bus Link (Slot 0 Wire)
            </label>
            `}
            
            <div style="display: flex; flex-direction: column; gap: 4px;">
                <label style="color: ${accentText}; font-weight: bold;">Placement:</label>
                <div id="rsl-placement-group" style="display: flex; gap: 4px;">
                    <button type="button" data-val="left" class="rsl-place-btn" style="flex: 1; background: #030712; color: #94a3b8; border: 1px solid ${borderPrimary}; padding: 6px; border-radius: 4px; cursor: pointer; font-weight: bold;">Left</button>
                    <button type="button" data-val="inplace" class="rsl-place-btn" style="flex: 1; background: ${btnBg}; color: #fff; border: 1px solid ${borderPrimary}; padding: 6px; border-radius: 4px; cursor: pointer; font-weight: bold;">Inplace</button>
                    <button type="button" data-val="right" class="rsl-place-btn" style="flex: 1; background: #030712; color: #94a3b8; border: 1px solid ${borderPrimary}; padding: 6px; border-radius: 4px; cursor: pointer; font-weight: bold;">Right</button>
                </div>
            </div>
        </div>
        `}

        <div style="font-size: 11px; color: #94a3b8;">${allowReorder ? "Drag ⠿ to rearrange, edit name, or include/exclude:" : "Edit slot names or include/exclude:"}</div>
        <div id="rsl-modal-slots-container" style="max-height: 160px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;"></div>

        <div style="display: flex; gap: 6px;">
            <input type="text" id="rsl-modal-new-slot" placeholder="New slot name..." style="flex: 1; background: #030712; border: 1px solid ${borderPrimary}; color: #fff; padding: 5px; border-radius: 4px;">
            <button id="rsl-modal-add-btn" style="background: ${btnBg}; border: none; color: white; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-weight: bold;">Add</button>
        </div>

        <div style="display: flex; gap: 8px; margin-top: 4px;">
            <button id="rsl-modal-confirm" style="flex: 1; background: ${btnBg}; color: white; border: none; border-radius: 6px; padding: 6px; cursor: pointer; font-weight: bold;">${isManage ? "Apply Changes" : (isSpawn ? "Spawn Counterpart" : "Create Node")}</button>
            <button id="rsl-modal-cancel" style="flex: 1; background: ${boxBg}; color: #ccc; border: none; border-radius: 6px; padding: 6px; cursor: pointer;">Cancel</button>
        </div>
    `;

    document.body.appendChild(panel);

    const placeButtons = panel.querySelectorAll(".rsl-place-btn");
    placeButtons.forEach(btn => {
        btn.onclick = () => {
            placeButtons.forEach(b => {
                b.style.background = "#030712";
                b.style.color = "#94a3b8";
            });
            btn.style.background = btnBg;
            btn.style.color = "#fff";
            selectedPlacement = btn.dataset.val;
        };
    });

    let isDragging = false;
    let startX, startY;
    const titleBar = panel.querySelector("#rsl-modal-titlebar");
    titleBar.onmousedown = (e) => {
        isDragging = true;
        startX = e.clientX - panel.offsetLeft;
        startY = e.clientY - panel.offsetTop;
        e.preventDefault();
    };
    document.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        panel.style.left = (e.clientX - startX) + "px";
        panel.style.top = (e.clientY - startY) + "px";
    });
    document.addEventListener("mouseup", () => {
        isDragging = false;
    });

    const slotsContainer = panel.querySelector("#rsl-modal-slots-container");
    const errorBanner = panel.querySelector("#rsl-modal-error");

    function showError(msg) {
        errorBanner.textContent = msg;
        errorBanner.style.display = "block";
        setTimeout(() => {
            if (errorBanner) errorBanner.style.display = "none";
        }, 3500);
    }

    function renderSlots() {
        slotsContainer.innerHTML = "";
        slotArray.forEach((slot, index) => {
            const row = document.createElement("div");
            if (allowReorder) {
                row.draggable = true;
                row.dataset.index = index;
            }
            row.style.cssText = `
                display: flex; align-items: center; gap: 6px; background: ${boxBg};
                border: 1px solid ${borderPrimary}; border-radius: 6px; padding: 5px 8px;
                ${allowReorder ? 'cursor: grab;' : ''} user-select: none;
            `;

            row.innerHTML = `
                ${allowReorder ? `<span style="cursor: grab; color: ${accentText}; font-weight: bold; font-size: 14px;">⠿</span>` : ''}
                <input type="checkbox" class="rsl-slot-inc" ${slot.included ? "checked" : ""} style="cursor: pointer;" onclick="event.stopPropagation()">
                <input type="text" class="rsl-slot-name-inp" value="${slot.slot_name}" style="flex: 1; background: #030712; border: 1px solid ${borderPrimary}; color: #fff; padding: 3px 6px; border-radius: 4px; font-size: 11px;">
            `;

            const nameInp = row.querySelector(".rsl-slot-name-inp");
            nameInp.addEventListener("mousedown", (e) => e.stopPropagation());
            nameInp.oninput = (e) => {
                slotArray[index].slot_name = e.target.value.trim();
                slotArray[index].label = e.target.value.trim();
            };

            row.querySelector(".rsl-slot-inc").onchange = (e) => {
                slotArray[index].included = e.target.checked;
            };

            if (allowReorder) {
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
                        const movedItem = slotArray.splice(draggedIdx, 1)[0];
                        slotArray.splice(targetIdx, 0, movedItem);
                        renderSlots();
                    }
                };
            }

            slotsContainer.appendChild(row);
        });
    }

    renderSlots();

    panel.querySelector("#rsl-modal-add-btn").onclick = () => {
        const inputField = panel.querySelector("#rsl-modal-new-slot");
        const newName = inputField.value.trim();
        if (!newName) return;

        const exists = slotArray.some(s => s.slot_name === newName || s.label === newName);
        if (exists) {
            showError(`Slot name "${newName}" already exists! Please choose a unique name.`);
            return;
        }

        slotArray.push({
            slot_name: newName,
            label: newName,
            input: null,
            output: null,
            included: true
        });
        inputField.value = "";
        renderSlots();
    };

    panel.querySelector("#rsl-modal-confirm").onclick = () => {
        panel.remove();
        const resultingSlots = slotArray.filter(s => s.included && s.slot_name.length > 0);
        
        if (isManage) {
            onComplete(resultingSlots);
        } else {
            const copyInputFlag = panel.querySelector("#rsl-copy-input").checked;
            const copyOutputFlag = panel.querySelector("#rsl-copy-output").checked;
            const copyBusLink = isSpawn ? false : panel.querySelector("#rsl-copy-buslink").checked;

            if (isSpawn) {
                onComplete(resultingSlots, copyInputFlag, copyOutputFlag, selectedPlacement);
            } else {
                onComplete(resultingSlots, copyInputFlag, copyOutputFlag, selectedPlacement, copyBusLink);
            }
        }
    };

    panel.querySelector("#rsl-modal-cancel").onclick = () => panel.remove();
    panel.querySelector("#rsl-modal-close").onclick = () => panel.remove();
}