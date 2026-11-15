import { app } from "../../scripts/app.js";
import { THEMES } from "./color_node.js";

app.registerExtension({
    name: "RSL.SwitchAnyUI",
    async loadedGraphNode(node) {
        if (node.comfyClass === "SwitchAny") {
            node._isWorkflowLoad = true;
            setupSwitchAnyNode(node);
            ensureSelectSlotAndWidget(node);
            updateSelectWidget(node);
            syncNodeTypes(node);
        }
    },
    nodeCreated(node) {
        if (node.comfyClass === "SwitchAny") {
            if (!node.properties) node.properties = {};

            node._isWorkflowLoad = false;
            ensureSelectSlotAndWidget(node);
            setupSwitchAnyNode(node);

            Promise.resolve().then(() => {
                if (!node._isWorkflowLoad) {
                    const dynamicInputs = getDynamicInputs(node);
                    if (dynamicInputs.length === 0) {
                        node.inputs.push({ name: "input_1", type: "*" });
                        updateSelectWidget(node);
                    }
                }
            });
        }
    }
});

function applyNodeTheme(node) {
    const theme = THEMES.utils || THEMES.bus;
    node.color = theme.color;
    node.bgcolor = theme.bgcolor;
    node.setDirtyCanvas(true, true);
}

function getDynamicInputs(node) {
    return (node.inputs || []).filter(inp => inp.name && inp.name !== "select");
}

function getDetectedType(node) {
    const dynamicInputs = getDynamicInputs(node);
    for (const inp of dynamicInputs) {
        if (inp.link !== null && inp.link !== undefined) {
            const link = app.graph?.links?.[inp.link];
            if (link && link.type && link.type !== "*") {
                return link.type;
            }
            if (inp.type && inp.type !== "*") {
                return inp.type;
            }
        }
    }
    return "*";
}

function syncNodeTypes(node) {
    const detectedType = getDetectedType(node);

    const dynamicInputs = getDynamicInputs(node);
    dynamicInputs.forEach(inp => {
        inp.type = detectedType;
    });

    if (node.outputs) {
        node.outputs.forEach(out => {
            if (out.name === "output") {
                out.type = detectedType;
            }
        });
    }

    node.setDirtyCanvas(true, true);
}

function ensureSelectSlotAndWidget(node) {
    if (!node.inputs) node.inputs = [];
    let selectSlot = node.inputs.find(i => i.name === "select");
    if (!selectSlot) {
        node.inputs.unshift({ name: "select", type: "STRING", link: null });
    } else {
        selectSlot.type = "STRING";
    }

    if (!node.widgets) node.widgets = [];
    let selectWidget = node.widgets.find(w => w.name === "select");
    if (!selectWidget) {
        node.widgets.unshift({
            name: "select",
            type: "combo",
            value: "input_1",
            options: { values: ["input_1"] }
        });
    }
}

function updateSelectWidget(node, oldName = null, newName = null) {
    const selectWidget = node.widgets?.find(w => w.name === "select");
    if (!selectWidget) return;

    const dynamicInputs = getDynamicInputs(node).filter(inp => inp.name);
    const inputNames = dynamicInputs.map(inp => inp.name);

    if (inputNames.length === 0) {
        inputNames.push("input_1");
    }

    selectWidget.type = "combo";
    selectWidget.options = selectWidget.options || {};
    selectWidget.options.values = [...inputNames];

    if (oldName && selectWidget.value === oldName) {
        selectWidget.value = newName;
    }

    if (!inputNames.includes(selectWidget.value)) {
        selectWidget.value = inputNames[0];
    }

    node.size = node.computeSize();
    node.setDirtyCanvas(true, true);
}

function setupSwitchAnyNode(node) {
    if (node._rslInitialized) return;
    node._rslInitialized = true;

    if (!node.properties) node.properties = {};

    applyNodeTheme(node);
    ensureSelectSlotAndWidget(node);

    const originalOnConnectionsChange = node.onConnectionsChange;
    node.onConnectionsChange = function (type, index, connected, link_info) {
        if (originalOnConnectionsChange) {
            originalOnConnectionsChange.apply(this, arguments);
        }
        syncNodeTypes(this);
        updateSelectWidget(this);
    };

    const originalOnConnectInput = node.onConnectInput;
    node.onConnectInput = function (target_slot, type, output, counterpart_node, counterpart_slot) {
        const targetInput = this.inputs[target_slot];
        if (targetInput && targetInput.name === "select") {
            return output && (output.type === "STRING" || output.type === "*");
        }

        // Enforce consistent type across inputs once a concrete type is connected
        const currentType = getDetectedType(this);
        if (currentType !== "*" && output && output.type !== "*" && output.type !== currentType) {
            return false;
        }

        if (originalOnConnectInput) {
            const res = originalOnConnectInput.apply(this, arguments);
            if (res === false) return false;
        }

        const dynamicInputs = getDynamicInputs(this);
        const lastInput = dynamicInputs[dynamicInputs.length - 1];

        if (!lastInput || target_slot === this.inputs.indexOf(lastInput) || (lastInput.link !== null && lastInput.link !== undefined)) {
            let counter = dynamicInputs.length + 1;
            let finalName = `input_${counter}`;
            while (this.inputs.some(i => i.name === finalName)) {
                counter++;
                finalName = `input_${counter}`;
            }
            const slotType = (output && output.type) ? output.type : currentType;
            this.inputs.push({ name: finalName, type: slotType });
            updateSelectWidget(this);
        }
        return true;
    };

    const originalOnConnectOutput = node.onConnectOutput;
    node.onConnectOutput = function (slot, type, input_slot, target_node, target_slot) {
        const output = this.outputs[slot];
        if (output && output.name === "output") {
            const currentType = getDetectedType(this);
            if (currentType !== "*" && type !== "*" && type !== currentType) {
                return false;
            }
        }

        if (originalOnConnectOutput) {
            return originalOnConnectOutput.apply(this, arguments);
        }
        return true;
    };

    const originalGetExtraMenuOptions = node.getExtraMenuOptions;
    node.getExtraMenuOptions = function (_, options) {
        if (originalGetExtraMenuOptions) {
            originalGetExtraMenuOptions.apply(this, arguments);
        }

        options.unshift({
            content: "⚙️ Manage Switch Inputs...",
            callback: () => openSwitchAnyFloatingMenu(this)
        });
    };

    const origOnConfigure = node.onConfigure;
    node.onConfigure = function (info) {
        this._isWorkflowLoad = true;
        if (origOnConfigure) origOnConfigure.apply(this, arguments);
        applyNodeTheme(this);
        ensureSelectSlotAndWidget(this);
        syncNodeTypes(this);
        updateSelectWidget(this);
    };
}

function showCustomWarning(message) {
    document.getElementById("rsl-warning-modal")?.remove();

    const warnModal = document.createElement("div");
    warnModal.id = "rsl-warning-modal";
    warnModal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0,0,0,0.5); z-index: 20000;
        display: flex; align-items: center; justify-content: center;
        font-family: sans-serif;
    `;

    const warnContent = document.createElement("div");
    warnContent.style.cssText = `
        background: #1e1535; color: #fff; padding: 20px; border-radius: 8px;
        width: 300px; text-align: center; border: 2px solid #a83232;
        box-shadow: 0 4px 20px rgba(0,0,0,0.8); font-size: 13px;
    `;

    warnContent.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 10px; color: #ff6b6b; font-size: 14px;">⚠️ Warning</div>
        <div style="margin-bottom: 15px; color: #e2d9f3;">${message}</div>
        <button id="rsl-warn-ok" style="background: #632EE3; color: white; border: none; padding: 6px 16px; border-radius: 4px; cursor: pointer; font-weight: bold;">OK</button>
    `;

    warnModal.appendChild(warnContent);
    document.body.appendChild(warnModal);

    warnContent.querySelector("#rsl-warn-ok").onclick = () => warnModal.remove();
    warnModal.onclick = (e) => { if (e.target === warnModal) warnModal.remove(); };
}

function openSwitchAnyFloatingMenu(node) {
    const existing = document.getElementById("rsl-switch-any-menu");
    if (existing) existing.remove();

    const menu = document.createElement("div");
    menu.id = "rsl-switch-any-menu";
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
        min-width: 300px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.7);
        font-family: sans-serif;
        font-size: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
    `;

    const title = document.createElement("div");
    title.style.cssText = "font-weight: bold; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #432C7A; padding-bottom: 8px; color: #E2D9F3; cursor: move; user-select: none;";
    title.innerHTML = `<span>Manage Switch Any Inputs</span>`;

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "×";
    closeBtn.style.cssText = "background: #432C7A; border: none; color: #fff; width: 20px; height: 20px; border-radius: 50%; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center;";
    closeBtn.onclick = () => {
        updateSelectWidget(node);
        menu.remove();
    };
    title.appendChild(closeBtn);
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
    listContainer.style.cssText = "max-height: 220px; overflow-y: auto; padding-right: 2px; display: flex; flex-direction: column; gap: 6px;";
    menu.appendChild(listContainer);

    function renderRows() {
        listContainer.innerHTML = "";
        const dynamicInputs = getDynamicInputs(node);

        if (dynamicInputs.length === 0) {
            const empty = document.createElement("div");
            empty.textContent = "No input slots";
            empty.style.color = "#888";
            listContainer.appendChild(empty);
            return;
        }

        dynamicInputs.forEach((inp, index) => {
            const row = document.createElement("div");
            row.style.cssText = "display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 6px 8px; background: #231B3A; border: 1px solid #432C7A; border-radius: 6px;";

            const nameInput = document.createElement("input");
            nameInput.type = "text";
            nameInput.value = inp.name;
            nameInput.style.cssText = "flex-grow: 1; background: #120D21; border: 1px solid #523996; color: #fff; padding: 4px 8px; border-radius: 4px; font-size: 12px;";

            nameInput.addEventListener("mousedown", (e) => e.stopPropagation());

            nameInput.addEventListener("input", (e) => {
                const newName = e.target.value.trim();
                if (newName) {
                    const dynamicInputs = getDynamicInputs(node);
                    const isDuplicate = dynamicInputs.some((otherInp, otherIdx) => otherIdx !== index && otherInp.name === newName);

                    if (!isDuplicate) {
                        const targetOldName = inp.name;
                        inp.name = newName;
                        updateSelectWidget(node, targetOldName, newName);
                    } else {
                        showCustomWarning(`Input name "${newName}" already exists!`);
                    }
                }
            });

            const delBtn = document.createElement("button");
            delBtn.textContent = "🗑️";
            delBtn.title = "Delete last input slot";
            delBtn.style.cssText = "background: #d32f2f; border: none; color: #fff; padding: 4px 8px; border-radius: 4px; cursor: pointer;";

            const isLastItem = (index === dynamicInputs.length - 1);
            if (!isLastItem || dynamicInputs.length <= 1) {
                delBtn.disabled = true;
                delBtn.style.opacity = 0.3;
                delBtn.style.cursor = "not-allowed";
            }

            delBtn.onclick = () => {
                if (!delBtn.disabled) {
                    const nodeIndex = node.inputs.indexOf(inp);
                    if (nodeIndex !== -1) {
                        node.inputs.splice(nodeIndex, 1);
                        syncNodeTypes(node);
                        updateSelectWidget(node);
                        renderRows();
                    }
                }
            };

            row.appendChild(nameInput);
            row.appendChild(delBtn);
            listContainer.appendChild(row);
        });
    }

    renderRows();

    const addBtn = document.createElement("button");
    addBtn.textContent = "+ Add Input Slot";
    addBtn.style.cssText = "width: 100%; background: #632EE3; color: white; border: none; border-radius: 6px; padding: 8px; cursor: pointer; font-weight: bold;";
    addBtn.onclick = () => {
        const dynamicInputs = getDynamicInputs(node);
        let counter = dynamicInputs.length + 1;
        let finalName = `input_${counter}`;

        while (node.inputs.some(i => i.name === finalName)) {
            counter++;
            finalName = `input_${counter}`;
        }

        const currentType = getDetectedType(node);
        node.inputs.push({ name: finalName, type: currentType });
        updateSelectWidget(node);
        renderRows();
    };
    menu.appendChild(addBtn);

    document.body.appendChild(menu);
}