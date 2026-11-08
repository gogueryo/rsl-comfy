import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
  name: "RSL.LoraStackerUI",
  async nodeCreated(node) {
    if (node.comfyClass !== "RSLLoraStackerNode") return;

    try {
      // Find the native loras_json widget (must be in "required" or "optional")
      let jsonWidget = node.widgets ? node.widgets.find(w => w.name === "loras_json") : null;
      if (!jsonWidget) {
        console.warn("[RSL Stacker] loras_json widget not found. Define it in required/optional, not hidden.");
        return;
      }

      // State
      let loras = [];
      let loraFileList = [];

      function loadStateFromWidget() {
        try {
          const raw = jsonWidget.value || "[]";
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            loras = parsed;
          }
        } catch (e) {
          loras = [];
        }
      }

      loadStateFromWidget();

      // Make the native widget always return the latest state at serialize time
      jsonWidget.serialize = true;
      jsonWidget.serializeValue = () => JSON.stringify(loras);

      // Hide the native text widget visually
      jsonWidget.computeSize = () => [0, -4];
      jsonWidget.draw = () => { };

      // Restoration hook
      const origOnConfigure = node.onConfigure;
      node.onConfigure = function (o) {
        if (origOnConfigure) origOnConfigure.apply(this, arguments);
        loadStateFromWidget();
        renderList();
        updateUIState();
      };

      // Fetch available LoRA files
      api.fetchApi("/object_info").then(async (res) => {
        try {
          const data = await res.json();
          if (data.LoraLoader && data.LoraLoader.input.required.lora_name) {
            loraFileList = data.LoraLoader.input.required.lora_name[0] || [];
          } else if (data.RSLLoraLoader && data.RSLLoraLoader.input.required.lora_name) {
            loraFileList = data.RSLLoraLoader.input.required.lora_name[0] || [];
          } else {
            for (const key of Object.keys(data)) {
              const nodeInfo = data[key];
              if (nodeInfo?.input?.required?.lora_name?.[0]) {
                loraFileList = nodeInfo.input.required.lora_name[0];
                break;
              }
            }
          }
        } catch (err) {
          console.error("Failed to parse lora list", err);
        }
      }).catch(err => console.error("Failed to fetch lora list", err));

      // --- UI CONTAINER ---
      const container = document.createElement("div");
      container.style.position = "relative";
      container.style.display = "flex";
      container.style.flexDirection = "column";
      container.style.gap = "6px";
      container.style.padding = "8px";
      container.style.backgroundColor = "#121214";
      container.style.color = "#f4f4f5";
      container.style.borderRadius = "8px";
      container.style.width = "100%";
      container.style.boxSizing = "border-box";
      container.style.fontFamily = "sans-serif";
      container.style.fontSize = "12px";

      const addBtn = document.createElement("button");
      addBtn.innerText = "+ Add LoRA";
      addBtn.style.width = "100%";
      addBtn.style.padding = "8px";
      addBtn.style.backgroundColor = "#ff5722";
      addBtn.style.color = "#ffffff";
      addBtn.style.border = "none";
      addBtn.style.borderRadius = "6px";
      addBtn.style.fontWeight = "bold";
      addBtn.style.cursor = "pointer";
      addBtn.style.fontSize = "13px";

      const headerRow = document.createElement("div");
      headerRow.style.display = "flex";
      headerRow.style.justifyContent = "space-between";
      headerRow.style.alignItems = "center";
      headerRow.style.backgroundColor = "#1e1e24";
      headerRow.style.padding = "6px 10px";
      headerRow.style.borderRadius = "6px";
      headerRow.style.border = "1px solid #2a2a32";

      const globalToggleLabel = document.createElement("div");
      globalToggleLabel.style.display = "flex";
      globalToggleLabel.style.alignItems = "center";
      globalToggleLabel.style.gap = "8px";

      const updateSwitchVisual = (sw, checked) => {
        sw.style.backgroundColor = checked ? "#ff5722" : "#3f3f46";
      };

      const globalSwitch = document.createElement("input");
      globalSwitch.type = "checkbox";
      globalSwitch.checked = true;
      globalSwitch.style.appearance = "none";
      globalSwitch.style.width = "28px";
      globalSwitch.style.height = "14px";
      globalSwitch.style.borderRadius = "7px";
      globalSwitch.style.position = "relative";
      globalSwitch.style.cursor = "pointer";
      globalSwitch.style.outline = "none";
      globalSwitch.style.transition = "background-color 0.2s";
      updateSwitchVisual(globalSwitch, true);

      globalSwitch.onchange = () => {
        const state = globalSwitch.checked;
        updateSwitchVisual(globalSwitch, state);
        loras.forEach(l => l.enabled = state);
        renderList();
        commit();
      };

      const globalText = document.createElement("span");
      globalText.innerText = "0 / 0 on";
      globalText.style.fontWeight = "bold";
      globalText.style.fontSize = "11px";

      globalToggleLabel.appendChild(globalSwitch);
      globalToggleLabel.appendChild(globalText);

      const globalGearBtn = document.createElement("button");
      globalGearBtn.innerText = "⚙️";
      globalGearBtn.style.background = "none";
      globalGearBtn.style.border = "none";
      globalGearBtn.style.cursor = "pointer";
      globalGearBtn.style.fontSize = "13px";

      headerRow.appendChild(globalToggleLabel);
      headerRow.appendChild(globalGearBtn);

      const listArea = document.createElement("div");
      listArea.style.display = "flex";
      listArea.style.flexDirection = "column";
      listArea.style.gap = "6px";
      listArea.style.maxHeight = "280px";
      listArea.style.overflowY = "auto";

      const emptyNotice = document.createElement("div");
      emptyNotice.innerText = "No LoRAs yet — click + Add LoRA to stack your first one.";
      emptyNotice.style.color = "#71717a";
      emptyNotice.style.textAlign = "center";
      emptyNotice.style.padding = "16px";
      emptyNotice.style.border = "1px dashed #2a2a32";
      emptyNotice.style.borderRadius = "6px";
      emptyNotice.style.fontSize = "11px";

      container.appendChild(addBtn);
      container.appendChild(headerRow);
      container.appendChild(emptyNotice);
      container.appendChild(listArea);

      function updateUIState() {
        const activeCount = loras.filter(l => l.enabled).length;
        globalText.innerText = `${activeCount} / ${loras.length} on`;
        emptyNotice.style.display = loras.length === 0 ? "block" : "none";
        headerRow.style.display = loras.length === 0 ? "none" : "flex";
      }

      // --- COMMIT ---
      function commit() {
        const newValue = JSON.stringify(loras);
        if (jsonWidget) {
          jsonWidget.value = newValue;
          if (typeof jsonWidget.callback === "function") {
            jsonWidget.callback(newValue);
          }
        }
        node.setDirtyCanvas(true, true);
        if (app.graph) {
          app.graph.setDirtyCanvas(true, true);
          app.graph.change();
        }
        updateUIState();
      }

      // --- SEARCH MODAL ---
      const searchModal = document.createElement("div");
      searchModal.style.position = "absolute";
      searchModal.style.top = "45px";
      searchModal.style.left = "10px";
      searchModal.style.right = "10px";
      searchModal.style.backgroundColor = "#18181b";
      searchModal.style.border = "1px solid #3f3f46";
      searchModal.style.borderRadius = "8px";
      searchModal.style.padding = "10px";
      searchModal.style.zIndex = "100";
      searchModal.style.display = "none";
      searchModal.style.boxShadow = "0 10px 25px rgba(0,0,0,0.8)";
      searchModal.style.maxHeight = "240px";
      searchModal.style.overflowY = "auto";

      const searchInput = document.createElement("input");
      searchInput.placeholder = "🔍 Search LoRAs...";
      searchInput.style.width = "100%";
      searchInput.style.padding = "6px";
      searchInput.style.backgroundColor = "#27272a";
      searchInput.style.border = "1px solid #3f3f46";
      searchInput.style.color = "#fff";
      searchInput.style.borderRadius = "4px";
      searchInput.style.boxSizing = "border-box";

      const searchResultsList = document.createElement("div");
      searchResultsList.style.marginTop = "8px";
      searchResultsList.style.display = "flex";
      searchResultsList.style.flexDirection = "column";
      searchResultsList.style.gap = "4px";

      searchModal.appendChild(searchInput);
      searchModal.appendChild(searchResultsList);
      container.appendChild(searchModal);

      let activeSelectCallback = null;

      function openSearchModal(onSelectCallback) {
        activeSelectCallback = onSelectCallback;
        searchModal.style.display = "block";
        searchInput.value = "";
        renderSearchResults("");
        searchInput.focus();

        const closeOnClickOutside = (e) => {
          if (!searchModal.contains(e.target) && e.target !== addBtn) {
            searchModal.style.display = "none";
            document.removeEventListener("click", closeOnClickOutside);
          }
        };
        setTimeout(() => document.addEventListener("click", closeOnClickOutside), 10);
      }

      searchInput.oninput = () => renderSearchResults(searchInput.value.toLowerCase());

      function renderSearchResults(filter) {
        searchResultsList.innerHTML = "";
        const filtered = loraFileList.filter(f => f.toLowerCase().includes(filter));

        if (filtered.length === 0) {
          const noRes = document.createElement("div");
          noRes.innerText = "No matching LoRAs found";
          noRes.style.color = "#71717a";
          noRes.style.padding = "6px 8px";
          searchResultsList.appendChild(noRes);
          return;
        }

        filtered.forEach(filename => {
          const row = document.createElement("div");
          row.innerText = filename;
          row.style.padding = "6px 8px";
          row.style.cursor = "pointer";
          row.style.borderRadius = "4px";
          row.style.backgroundColor = "#27272a";
          row.style.fontSize = "11px";
          row.onmouseenter = () => row.style.backgroundColor = "#3f3f46";
          row.onmouseleave = () => row.style.backgroundColor = "#27272a";
          row.onclick = () => {
            if (activeSelectCallback) activeSelectCallback(filename);
            searchModal.style.display = "none";
          };
          searchResultsList.appendChild(row);
        });
      }

      // --- RENDER LIST ---
      function renderList() {
        listArea.innerHTML = "";
        loras.forEach((lora, idx) => {
          const itemBox = document.createElement("div");
          itemBox.style.backgroundColor = "#1e1e24";
          itemBox.style.border = "1px solid #2a2a32";
          itemBox.style.borderRadius = "6px";
          itemBox.style.padding = "6px 8px";
          itemBox.style.display = "flex";
          itemBox.style.flexDirection = "column";
          itemBox.style.gap = "6px";
          itemBox.style.cursor = "grab";
          itemBox.draggable = true;

          itemBox.ondragstart = (e) => {
            e.dataTransfer.setData("text/plain", idx);
            itemBox.style.opacity = "0.4";
          };
          itemBox.ondragend = () => {
            itemBox.style.opacity = "1";
          };
          itemBox.ondragover = (e) => e.preventDefault();
          itemBox.ondrop = (e) => {
            e.preventDefault();
            const fromIdx = parseInt(e.dataTransfer.getData("text/plain"), 10);
            if (isNaN(fromIdx) || fromIdx === idx) return;
            const movedItem = loras.splice(fromIdx, 1)[0];
            loras.splice(idx, 0, movedItem);
            renderList();
            commit();
          };

          const mainRow = document.createElement("div");
          mainRow.style.display = "flex";
          mainRow.style.alignItems = "center";
          mainRow.style.gap = "6px";

          const nameBtn = document.createElement("button");
          nameBtn.innerText = lora.name || "Select LoRA...";
          nameBtn.style.flex = "1";
          nameBtn.style.textAlign = "left";
          nameBtn.style.padding = "4px 8px";
          nameBtn.style.backgroundColor = "#141416";
          nameBtn.style.color = "#f4f4f5";
          nameBtn.style.border = "1px solid #2a2a32";
          nameBtn.style.borderRadius = "4px";
          nameBtn.style.cursor = "pointer";
          nameBtn.style.overflow = "hidden";
          nameBtn.style.textOverflow = "ellipsis";
          nameBtn.style.whiteSpace = "nowrap";
          nameBtn.style.fontSize = "11px";
          nameBtn.onclick = () => {
            openSearchModal((selectedName) => {
              lora.name = selectedName;
              nameBtn.innerText = selectedName;
              commit();
            });
          };

          const modelInput = document.createElement("input");
          modelInput.type = "number";
          modelInput.step = "0.05";
          modelInput.value = Number(lora.strength_model || 1.0).toFixed(2);
          modelInput.style.width = "55px";
          modelInput.style.backgroundColor = "#141416";
          modelInput.style.border = "1px solid #2a2a32";
          modelInput.style.color = "#fff";
          modelInput.style.borderRadius = "4px";
          modelInput.style.padding = "3px 4px";
          modelInput.style.fontSize = "11px";
          modelInput.style.textAlign = "center";
          modelInput.title = "LoRA Strength";
          modelInput.oninput = () => {
            lora.strength_model = parseFloat(modelInput.value) || 0;
            commit();
          };
          modelInput.onchange = () => {
            modelInput.value = Number(lora.strength_model).toFixed(2);
            commit();
          };

          const deleteBtn = document.createElement("button");
          deleteBtn.innerText = "🗑️";
          deleteBtn.style.background = "none";
          deleteBtn.style.border = "none";
          deleteBtn.style.cursor = "pointer";
          deleteBtn.title = "Delete LoRA";
          deleteBtn.style.fontSize = "11px";
          deleteBtn.style.opacity = "0.7";
          deleteBtn.onclick = () => {
            loras.splice(idx, 1);
            renderList();
            commit();
          };

          const itemSwitch = document.createElement("input");
          itemSwitch.type = "checkbox";
          itemSwitch.checked = lora.enabled !== false;
          itemSwitch.style.appearance = "none";
          itemSwitch.style.width = "28px";
          itemSwitch.style.height = "14px";
          itemSwitch.style.borderRadius = "7px";
          itemSwitch.style.cursor = "pointer";
          itemSwitch.style.outline = "none";
          itemSwitch.style.transition = "background-color 0.2s";
          updateSwitchVisual(itemSwitch, itemSwitch.checked);

          itemSwitch.onchange = () => {
            lora.enabled = itemSwitch.checked;
            updateSwitchVisual(itemSwitch, lora.enabled);
            commit();
          };

          mainRow.appendChild(nameBtn);
          mainRow.appendChild(modelInput);
          mainRow.appendChild(deleteBtn);
          mainRow.appendChild(itemSwitch);

          itemBox.appendChild(mainRow);
          listArea.appendChild(itemBox);
        });
      }

      addBtn.onclick = () => {
        openSearchModal((selectedName) => {
          loras.push({ name: selectedName, strength_model: 1.0, enabled: true });
          renderList();
          commit();
        });
      };

      // DOM widget is visual only — do not serialize it
      node.addDOMWidget("lora_stacker_panel", "custom", container, {
        getValue() {
          return JSON.stringify(loras);
        },
        setValue(v) {
          try {
            const parsed = JSON.parse(v || "[]");
            if (Array.isArray(parsed)) {
              loras = parsed;
              renderList();
              updateUIState();
            }
          } catch (e) { }
        },
        serialize: false,
      });

      renderList();
      updateUIState();
      node.setSize([380, 240]);

    } catch (err) {
      console.error("RSL Stacker UI initialization error:", err);
    }
  }
});