import { app } from "../../scripts/app.js";
import { THEMES, getThemePalette, createThemeDropdown } from "./color_node.js";

app.registerExtension({
    name: "rsl.ComboStringsUI",
    async nodeCreated(node) {
        if (node.comfyClass !== "ComboStrings") return;

        if (!node.properties) node.properties = {};
        if (!node.properties.activeTheme) node.properties.activeTheme = "utils";

        const savedThemeKey = node.properties.activeTheme;
        const initialTheme = THEMES[savedThemeKey] || THEMES.utils;
        node.color = initialTheme.color;
        node.bgcolor = initialTheme.bgcolor;

        // Add Theme Dropdown to node widgets
        const themeDropdown = createThemeDropdown(node, initialTheme.palette, (newPalette, newKey) => {
            const selectedTheme = THEMES[newKey] || THEMES.utils;
            node.color = selectedTheme.color;
            node.bgcolor = selectedTheme.bgcolor;
            node.setDirtyCanvas(true, true);
        });
        
        node.addWidget("custom", "theme_selector", themeDropdown, () => {});

        // Find widgets
        const choicesWidget = node.widgets?.find((w) => w.name === "choices");
        const choiceWidget = node.widgets?.find((w) => w.name === "choice");
        const indexWidget = node.widgets?.find((w) => w.name === "index");

        if (choiceWidget && choicesWidget) {
            const updateDropdownValues = () => {
                const items = (choicesWidget.value || "").split("\n").map(s => s.trim()).filter(Boolean);
                if (items.length === 0) items.push("option1");
                
                choiceWidget.type = "combo";
                choiceWidget.options = { values: items };
                
                if (!items.includes(choiceWidget.value)) {
                    choiceWidget.value = items[0];
                }

                if (indexWidget) {
                    const idx = items.indexOf(choiceWidget.value);
                    if (idx !== -1) indexWidget.value = idx;
                }
            };

            updateDropdownValues();

            const origChoicesCallback = choicesWidget.callback;
            choicesWidget.callback = function(val) {
                if (origChoicesCallback) origChoicesCallback.apply(this, arguments);
                updateDropdownValues();
                node.setDirtyCanvas(true, true);
            };

            const origChoiceCallback = choiceWidget.callback;
            choiceWidget.callback = function(val) {
                if (origChoiceCallback) origChoiceCallback.apply(this, arguments);
                const items = (choicesWidget.value || "").split("\n").map(s => s.trim()).filter(Boolean);
                if (indexWidget) {
                    const idx = items.indexOf(choiceWidget.value);
                    if (idx !== -1) indexWidget.value = idx;
                }
                node.setDirtyCanvas(true, true);
            };

            if (indexWidget) {
                const origIndexCallback = indexWidget.callback;
                indexWidget.callback = function(val) {
                    if (origIndexCallback) origIndexCallback.apply(this, arguments);
                    const items = (choicesWidget.value || "").split("\n").map(s => s.trim()).filter(Boolean);
                    const idx = parseInt(indexWidget.value);
                    if (!isNaN(idx) && idx >= 0 && idx < items.length) {
                        choiceWidget.value = items[idx];
                    }
                    node.setDirtyCanvas(true, true);
                };
            }
        }

        const origOnConfigure = node.onConfigure;
        node.onConfigure = function (info) {
            if (origOnConfigure) origOnConfigure.apply(this, arguments);
            const loadedTheme = this.properties?.activeTheme || "utils";
            const themeObj = THEMES[loadedTheme] || THEMES.utils;
            this.color = themeObj.color;
            this.bgcolor = themeObj.bgcolor;
            this.setDirtyCanvas(true, true);
        };
    }
});