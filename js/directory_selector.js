import { app } from "../../scripts/app.js";
import { openFolderPickerModal } from "./rsl_ui_utils.js";

function hideDirectoryWidgetOnly(node) {
    if (!node.widgets) return;
    node.widgets.forEach(w => {
        if (w.name === "directory_path") {
            w.type = "hidden";
            w.computeSize = () => [0, -4];
            w.draw = function() {};
        }
    });
}

app.registerExtension({
    name: "RSL.DirectorySelector",
    async loadedGraphNode(node) {
        if (node.comfyClass === "RSLDirectorySelector") {
            hideDirectoryWidgetOnly(node);
        }
    },
    async nodeCreated(node) {
        if (node.comfyClass !== "RSLDirectorySelector") return;

        if (!node.properties) node.properties = {};
        if (!node.properties.nodeSize) node.properties.nodeSize = [460, 344];

        // --- GREEN THEME STYLING ---
        node.color = "#1b4d32";
        node.bgcolor = "#113822";
        
        node.size = node.properties.nodeSize;
        node.minSize = [440, 324];

        hideDirectoryWidgetOnly(node);

        if (node.widgets) {
            const existingDomWidget = node.widgets.find(w => w.name === "selector_dom");
            if (existingDomWidget && existingDomWidget.element) {
                existingDomWidget.element.remove();
                node.widgets = node.widgets.filter(w => w.name !== "selector_dom");
            }
        }

        const container = document.createElement("div");
        container.style.width = "100%";
        container.style.display = "flex";
        container.style.flexDirection = "column";
        container.style.boxSizing = "border-box";
        container.style.gap = "4px";
        container.style.padding = "4px 0";
        container.style.background = "#113822";
        container.style.color = "#2ecc71";
        container.style.fontFamily = "sans-serif";
        container.style.fontSize = "12px";
        container.style.overflow = "hidden";

        const pathWidget = node.widgets?.find(w => w.name === "directory_path");

        function syncWidget(widget, val) {
            if (widget) {
                widget.value = val;
                if (widget.callback) widget.callback(widget.value);
            }
        }

        const header = document.createElement("div");
        header.innerText = "📁 Directory Selector";
        header.style.fontWeight = "bold";
        header.style.fontSize = "11px";
        header.style.color = "#2ecc71";
        container.appendChild(header);

        const dirRow = document.createElement("div");
        dirRow.style.display = "flex";
        dirRow.style.gap = "6px";
        dirRow.style.width = "100%";
        dirRow.style.alignItems = "center";

        const dirLbl = document.createElement("span");
        dirLbl.innerText = "Path:";
        dirLbl.style.width = "35px";
        dirLbl.style.fontSize = "10px";
        dirLbl.style.fontWeight = "bold";
        dirLbl.style.color = "#a3e4d7";
        dirLbl.style.flexShrink = "0";

        const dirInput = document.createElement("input");
        dirInput.type = "text";
        dirInput.placeholder = "Enter or browse directory path...";
        dirInput.style.flex = "1";
        dirInput.style.padding = "5px";
        dirInput.style.boxSizing = "border-box";
        dirInput.style.background = "#0b2617";
        dirInput.style.border = "1px solid #2ecc71";
        dirInput.style.color = "#fff";
        dirInput.style.borderRadius = "4px";

        const savedDir = localStorage.getItem("RSL_DirectorySelector_lastDir");
        if (pathWidget && pathWidget.value) {
            dirInput.value = pathWidget.value;
        } else if (savedDir) {
            dirInput.value = savedDir;
            syncWidget(pathWidget, savedDir);
        }

        dirInput.oninput = () => {
            syncWidget(pathWidget, dirInput.value);
            localStorage.setItem("RSL_DirectorySelector_lastDir", dirInput.value.trim());
        };

        const browseBtn = document.createElement("button");
        browseBtn.innerText = "📁 Browse";
        browseBtn.style.background = "#2ecc71";
        browseBtn.style.color = "#113822";
        browseBtn.style.border = "none";
        browseBtn.style.padding = "5px 10px";
        browseBtn.style.borderRadius = "4px";
        browseBtn.style.cursor = "pointer";
        browseBtn.style.fontWeight = "bold";
        browseBtn.style.flexShrink = "0";

        browseBtn.onclick = () => {
            openFolderPickerModal(dirInput.value.trim(), (selectedPath) => {
                dirInput.value = selectedPath;
                syncWidget(pathWidget, selectedPath);
                localStorage.setItem("RSL_DirectorySelector_lastDir", selectedPath);
            });
        };

        dirRow.appendChild(dirLbl);
        dirRow.appendChild(dirInput);
        dirRow.appendChild(browseBtn);
        container.appendChild(dirRow);

        const domWidget = node.addDOMWidget("selector_dom", "editor", container);
        domWidget.computeSize = () => [0, 69];

        const domIndex = node.widgets.indexOf(domWidget);
        if (domIndex > 0) {
            node.widgets.splice(domIndex, 1);
            node.widgets.unshift(domWidget);
        }

        const applySizing = (size) => {
            const w = size[0];
            container.style.width = `${w - 12}px`;
        };

        applySizing(node.size);

        node.onResize = function(size) {
            if (this.properties) {
                this.properties.nodeSize = [size[0], size[1]];
            }
            applySizing(size);
        };

        const origOnConfigure = node.onConfigure;
        node.onConfigure = function(info) {
            if (origOnConfigure) origOnConfigure.apply(this, arguments);
            hideDirectoryWidgetOnly(this);
            if (this.properties?.nodeSize && Array.isArray(this.properties.nodeSize)) {
                this.setSize(this.properties.nodeSize);
                applySizing(this.properties.nodeSize);
            }
            if (pathWidget && pathWidget.value) {
                dirInput.value = pathWidget.value;
            }
        };
    }
});