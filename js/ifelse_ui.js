import { app } from "../../scripts/app.js";
import { THEMES, getThemePalette, createThemeDropdown } from "./color_node.js";

app.registerExtension({
    name: "rsl.IfElseUI",
    async nodeCreated(node) {
        if (!node.comfyClass || !node.comfyClass.includes("IfElse")) return;

        if (!node.properties) node.properties = {};
        if (!node.properties.activeTheme) {
            node.properties.activeTheme = node.comfyClass === "IfElseBusLink" ? "utils" : "logic";
        }

        const savedThemeKey = node.properties.activeTheme;
        const initialTheme = THEMES[savedThemeKey] || (node.comfyClass === "IfElseBusLink" ? THEMES.utils : THEMES.logic);
        node.color = initialTheme.color;
        node.bgcolor = initialTheme.bgcolor;

        // Add Theme Dropdown to node widgets
        const themeDropdown = createThemeDropdown(node, initialTheme.palette, (newPalette, newKey) => {
            const selectedTheme = THEMES[newKey] || THEMES.logic;
            node.color = selectedTheme.color;
            node.bgcolor = selectedTheme.bgcolor;
            node.setDirtyCanvas(true, true);
        });

        node.addWidget("custom", "theme_selector", themeDropdown, () => { });

        const origOnConfigure = node.onConfigure;
        node.onConfigure = function (info) {
            if (origOnConfigure) origOnConfigure.apply(this, arguments);
            const loadedTheme = this.properties?.activeTheme || (this.comfyClass === "IfElseBusLink" ? "utils" : "logic");
            const themeObj = THEMES[loadedTheme] || THEMES.logic;
            this.color = themeObj.color;
            this.bgcolor = themeObj.bgcolor;
            this.setDirtyCanvas(true, true);
        };
    }
});