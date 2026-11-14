import { app } from "../../scripts/app.js";
import { THEMES } from "./color_node.js";

app.registerExtension({
    name: "RSL.SwitchBusLinkUI",
    async nodeCreated(node) {
        if (node.comfyClass !== "SwitchBusLink") return;

        // Apply THEMES.utils styling
        const utilsTheme = THEMES.utils;
        node.color = utilsTheme.color;
        node.bgcolor = utilsTheme.bgcolor;

        // Helper to get all valid bus input slots (ignoring the 'select' widget)
        const getBusInputs = () => {
            return (node.inputs || []).filter(inp => inp.name && inp.name !== "select");
        };

        // Synchronize dropdown values with input names in exact order
        const updateSelectWidget = () => {
            const selectWidget = node.widgets?.find(w => w.name === "select");
            if (!selectWidget) return;

            const busNames = getBusInputs().map(inp => inp.name);
            if (busNames.length === 0) {
                busNames.push("bus_0");
            }

            selectWidget.type = "combo";
            selectWidget.options = selectWidget.options || {};
            selectWidget.options.values = busNames;

            // Keep current selection valid, or fallback to the first item
            if (!busNames.includes(selectWidget.value)) {
                selectWidget.value = busNames[0];
            }
        };

        // Check if all existing bus inputs are connected
        const areAllBusInputsConnected = () => {
            const inputs = getBusInputs();
            if (inputs.length === 0) return false;
            return inputs.every(inp => inp.link !== null && inp.link !== undefined);
        };

        // Add a new sequential bus input
        const addNewBusInput = () => {
            const inputs = getBusInputs();
            const newIndex = inputs.length;
            let newName = `bus_${newIndex}`;

            const existingNames = new Set(inputs.map(i => i.name));
            while (existingNames.has(newName)) {
                newName = `bus_${Math.floor(Math.random() * 1000)}`;
            }

            node.addInput(newName, "RSL_BUS_LINK");
            updateSelectWidget();
            node.setDirtyCanvas(true, true);
        };

        // Auto-add input when all existing ones are connected
        const originalOnConnectionsChange = node.onConnectionsChange;
        node.onConnectionsChange = function (type, index, connected, link_info) {
            if (originalOnConnectionsChange) {
                originalOnConnectionsChange.apply(this, arguments);
            }

            if (type === 1) {
                const input = node.inputs[index];
                if (input && input.name !== "select") {
                    if (connected && areAllBusInputsConnected()) {
                        addNewBusInput();
                    }
                    updateSelectWidget();
                }
            }
        };

        // Hook into input mutations
        node.onInputAdded = function () {
            updateSelectWidget();
            node.setDirtyCanvas(true, true);
        };

        node.onInputRemoved = function () {
            updateSelectWidget();
            node.setDirtyCanvas(true, true);
        };

        node.onInputRenamed = function () {
            updateSelectWidget();
            node.setDirtyCanvas(true, true);
        };

        const originalAddInput = node.addInput;
        node.addInput = function () {
            const res = originalAddInput.apply(this, arguments);
            updateSelectWidget();
            node.setDirtyCanvas(true, true);
            return res;
        };

        const originalRemoveInput = node.removeInput;
        node.removeInput = function (index) {
            const res = originalRemoveInput.apply(this, arguments);
            updateSelectWidget();
            node.setDirtyCanvas(true, true);
            return res;
        };

        const originalRenameInput = node.renameInput;
        node.renameInput = function (index, newName) {
            const res = originalRenameInput.apply(this, arguments);
            updateSelectWidget();
            node.setDirtyCanvas(true, true);
            return res;
        };

        // Continuous check to guarantee sync with renames
        setInterval(() => {
            if (node.graph) {
                updateSelectWidget();
            }
        }, 200);

        // Initial setup
        setTimeout(() => {
            if (getBusInputs().length === 0) {
                node.addInput("bus_0", "RSL_BUS_LINK");
            }
            updateSelectWidget();
        }, 50);
    }
});