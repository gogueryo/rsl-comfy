import { app } from "../../scripts/app.js";
import { THEMES } from "./color_node.js";

app.registerExtension({
    name: "RSL.SwitchBusLinkUI",
    async loadedGraphNode(node) {
        if (node.comfyClass === "SwitchBusLink") {
            setupSwitchBusNode(node);
            if (!node.inputs) {
                node.inputs = [{ name: "select", type: "COMBO", widget: { name: "select" } }];
            }
            updateSelectWidget(node);
        }
    },
    nodeCreated(node) {
        if (node.comfyClass === "SwitchBusLink") {
            if (!node.properties) node.properties = {};

            node.inputs = [
                { name: "select", type: "COMBO", widget: { name: "select" } }
            ];

            setupSwitchBusNode(node);
            updateSelectWidget(node);
        }
    }
});

function applyNodeTheme(node) {
    const theme = THEMES.utils || THEMES.bus;
    node.color = theme.color;
    node.bgcolor = theme.bgcolor;
    node.setDirtyCanvas(true, true);
}

function getBusInputs(node) {
    return (node.inputs || []).filter(inp => inp.name && inp.name !== "select");
}

function updateSelectWidget(node, oldName = null, newName = null) {
    const selectWidget = node.widgets?.find(w => w.name === "select");
    if (!selectWidget) return;

    const busInputs = getBusInputs(node).filter(inp => inp.name);
    const busNames = busInputs.map(inp => inp.name);

    selectWidget.type = "combo";
    selectWidget.options = selectWidget.options || {};
    selectWidget.options.values = [...busNames];

    if (oldName && selectWidget.value === oldName) {
        selectWidget.value = newName;
    }

    if (!busNames.includes(selectWidget.value)) {
        selectWidget.value = busNames.length > 0 ? busNames[0] : "";
    }

    node.size = node.computeSize();
    node.setDirtyCanvas(true, true);
}

function setupSwitchBusNode(node) {
    if (node._rslInitialized) return;
    node._rslInitialized = true;

    if (!node.properties) node.properties = {};

    applyNodeTheme(node);

    // Ensure outputs are strictly defined as RSL_BUS_LINK on creation if not already set
    if (node.outputs) {
        node.outputs.forEach(out => {
            if (out.name === "bus_output") {
                out.type = "RSL_BUS_LINK";
            }
        });
    }

    // Strictly enforce RSL_BUS_LINK type for all INPUT connections
    const originalOnConnectInput = node.onConnectInput;
    node.onConnectInput = function (target_slot, type, output, counterpart_node, counterpart_slot) {
        if (output && output.type !== "RSL_BUS_LINK") {
            return false;
        }

        if (originalOnConnectInput) {
            const res = originalOnConnectInput.apply(this, arguments);
            if (res === false) return false;
        }

        const busInputs = getBusInputs(this);
        const lastInput = busInputs[busInputs.length - 1];
        if (!lastInput || (lastInput.link !== null && lastInput.link !== undefined)) {
            let counter = busInputs.length + 1;
            let finalName = `bus_${counter}`;
            while (this.inputs.some(i => i.name === finalName)) {
                counter++;
                finalName = `bus_${counter}`;
            }
            this.inputs.push({ name: finalName, type: "RSL_BUS_LINK" });
            updateSelectWidget(this);
        }
        return true;
    };

    // Strictly enforce RSL_BUS_LINK type for all OUTPUT connections (e.g., bus_output)
    const originalOnConnectOutput = node.onConnectOutput;
    node.onConnectOutput = function (slot, type, input_slot, target_node, target_slot) {
        const output = this.outputs[slot];
        if (output && output.name === "bus_output") {
            if (type !== "RSL_BUS_LINK") {
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
            content: "⚙️ Manage Switch Bus Inputs...",
            callback: () => openSwitchBusFloatingMenu(this)
        });
    };

    const origOnConfigure = node.onConfigure;
    node.onConfigure = function (info) {
        if (origOnConfigure) origOnConfigure.apply(this, arguments);
        applyNodeTheme(this);
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

function openSwitchBusFloatingMenu(node) {
    const existing = document.getElementById("rsl-switch-bus-menu");
    if (existing) existing.remove();

    const menu = document.createElement("div");
    menu.id = "rsl-switch-bus-menu";
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
    title.innerHTML = `<span>Manage Switch Bus Inputs</span>`;

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
        const busInputs = getBusInputs(node);

        if (busInputs.length === 0) {
            const empty = document.createElement("div");
            empty.textContent = "No input slots";
            empty.style.color = "#888";
            listContainer.appendChild(empty);
            return;
        }

        busInputs.forEach((inp, index) => {
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
                    const currentNames = getBusInputs(node).map(i => i.name);
                    const isDuplicate = busInputs.some((otherInp, otherIdx) => otherIdx !== index && otherInp.name === newName);

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

            const isLastItem = (index === busInputs.length - 1);
            if (!isLastItem || busInputs.length <= 1) {
                delBtn.disabled = true;
                delBtn.style.opacity = 0.3;
                delBtn.style.cursor = "not-allowed";
            }

            delBtn.onclick = () => {
                if (!delBtn.disabled) {
                    const nodeIndex = node.inputs.indexOf(inp);
                    if (nodeIndex !== -1) {
                        node.inputs.splice(nodeIndex, 1);
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
        const busInputs = getBusInputs(node);
        let counter = busInputs.length + 1;
        let finalName = `bus_${counter}`;

        while (node.inputs.some(i => i.name === finalName)) {
            counter++;
            finalName = `bus_${counter}`;
        }

        node.inputs.push({ name: finalName, type: "RSL_BUS_LINK" });
        updateSelectWidget(node);
        renderRows();
    };
    menu.appendChild(addBtn);

    document.body.appendChild(menu);
}