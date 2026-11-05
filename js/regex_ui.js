import { app } from "../../scripts/app.js";
import { THEMES, getThemePalette, createThemeDropdown } from "./color_node.js";

app.registerExtension({
    name: "rsl.RegExUI",
    async nodeCreated(node) {
        // Target your IfElse node classes here (adjust class name if needed, e.g., IfElseCheckInput)
        if (!node.comfyClass || !node.comfyClass.includes("Regex")) return;

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