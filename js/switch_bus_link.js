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

        // Helper to retrieve all valid bus input slots (ignoring internal widgets like 'select')
        const getBusInputs = () => {
            return (node.inputs || []).filter(inp => inp.name && inp.name !== "select");
        };

        // Synchronize the dropdown widget values with all current input names in exact order
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

            // Preserve current selection if valid, otherwise fallback to the first item
            if (!busNames.includes(selectWidget.value)) {
                selectWidget.value = busNames[0];
            }
        };

        // Check if all existing bus inputs are actively connected
        const areAllBusInputsConnected = () => {
            const inputs = getBusInputs();
            if (inputs.length === 0) return false;
            return inputs.every(inp => inp.link !== null && inp.link !== undefined);
        };

        // Add a new sequential bus input slot
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

        // Monitor connection changes to auto-add inputs when needed
        const originalOnConnectionsChange = node.onConnectionsChange;
        node.onConnectionsChange = function (type, index, connected, link_info) {
            if (originalOnConnectionsChange) {
                originalOnConnectionsChange.apply(this, arguments);
            }

            if (type === 1) { // Input connection change
                const input = node.inputs[index];
                if (input && input.name !== "select") {
                    if (connected && areAllBusInputsConnected()) {
                        addNewBusInput();
                    }
                    updateSelectWidget();
                }
            }
        };

        // Intercept input modifications to keep dropdown synchronized instantly
        const originalAddInput = node.addInput;
        node.addInput = function () {
            const res = originalAddInput.apply(this, arguments);
            updateSelectWidget();
            node.setDirtyCanvas(true, true);
            return res;
        };

        const originalRemoveInput = node.removeInput;
        node.removeInput = function (index) {
            const res = originalRemoveInput ? originalRemoveInput.apply(this, arguments) : null;
            updateSelectWidget();
            node.setDirtyCanvas(true, true);
            return res;
        };

        const originalRenameInput = node.renameInput;
        node.renameInput = function (index, newName) {
            const res = originalRenameInput ? originalRenameInput.apply(this, arguments) : null;
            updateSelectWidget();
            node.setDirtyCanvas(true, true);
            return res;
        };

        // Provide the Subgraph-style Slot Context Menu on right-clicking an input slot
        const originalGetSlotMenuOptions = node.getSlotMenuOptions;
        node.getSlotMenuOptions = function (slot) {
            let options = originalGetSlotMenuOptions ? originalGetSlotMenuOptions.apply(this, arguments) : [];

            // Check if right-clicked slot is a valid dynamic input slot (type 1 = input)
            if (slot && slot.type === 1 && slot.name !== "select") {
                const slotIndex = node.inputs.indexOf(slot);

                // Add explicit slot manipulation options matching subgraphs
                options.push({
                    content: "Rename Slot",
                    callback: () => {
                        const newName = prompt("Enter new slot name:", slot.name);
                        if (newName && newName.trim() && newName.trim() !== slot.name) {
                            node.renameInput(slotIndex, newName.trim());
                        }
                    }
                });

                // Only allow removal if there's more than one input slot left
                if (getBusInputs().length > 1) {
                    options.push({
                        content: "Remove Slot",
                        callback: () => {
                            node.removeInput(slotIndex);
                        }
                    });
                }
            }
            return options;
        };

        // Initial setup update
        setTimeout(() => {
            updateSelectWidget();
        }, 50);
    }
});