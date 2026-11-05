import { app } from "../../scripts/app.js";
import { openFolderPickerModal } from "./rsl_ui_utils.js";

app.registerExtension({
    name: "rsl.DatasetYAMLViewer",
    beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "DatasetYAMLViewer") {
            const origNodeCreated = nodeType.prototype.onNodeCreated;
            
            nodeType.prototype.onNodeCreated = function () {
                if (origNodeCreated) {
                    origNodeCreated.apply(this, arguments);
                }

                const pathWidget = this.widgets.find(w => w.name === "dataset_path");
                if (pathWidget) {
                    if (pathWidget.value) {
                        pathWidget.value = pathWidget.value.replace(/\\/g, "/");
                    }

                    this.addWidget("button", "📁 Browse Directory...", null, () => {
                        const currentPath = pathWidget.value || "D:/datasets";
                        openFolderPickerModal(currentPath, (selectedPath) => {
                            const normalizedPath = (selectedPath || "").replace(/\\/g, "/");
                            pathWidget.value = normalizedPath;
                            if (pathWidget.callback) {
                                pathWidget.callback(normalizedPath);
                            }
                            this.setDirtyCanvas(true, true);
                        });
                    });
                }

                this.addWidget("button", "⚙️ Manage AI-Toolkit Presets...", null, () => {
                    openPresetManagerModal(this);
                });
            };
        }
    }
});

async function openPresetManagerModal(nodeInstance) {
    let existingModal = document.getElementById("rsl-preset-manager-modal");
    if (existingModal) existingModal.remove();

    let presets = {};
    try {
        const res = await fetch("/rsl/get_presets");
        presets = await res.json();
    } catch (e) {
        console.error("[RSL] Failed to fetch presets:", e);
    }

    const modal = document.createElement("div");
    modal.id = "rsl-preset-manager-modal";
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(10, 5, 18, 0.88); z-index: 10000; display: flex;
        align-items: center; justify-content: center; font-family: sans-serif;
    `;

    modal.innerHTML = `
        <div style="background: #1b1128; border: 2px solid #9b59b6; border-radius: 10px; padding: 20px; width: 720px; max-height: 90vh; overflow-y: auto; color: #f1c40f; box-shadow: 0 15px 35px rgba(0,0,0,0.8); box-sizing: border-box;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #9b59b6; padding-bottom: 10px; margin-bottom: 15px;">
                <h3 style="margin: 0; color: #f1c40f; font-size: 18px;">⚙️ AI-Toolkit Training Preset Manager</h3>
                <div style="display: flex; gap: 8px;">
                    <select id="rsl-preset-select" style="padding: 6px; background: #0f0718; border: 1px solid #9b59b6; color: #fff; border-radius: 4px; font-size: 13px; font-weight: bold; width: 220px;"></select>
                    <button id="rsl-btn-new" style="padding: 6px 10px; background: #3b82f6; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 11px;">➕ New</button>
                    <button id="rsl-btn-delete" style="padding: 6px 10px; background: #e74c3c; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 11px;">🗑️ Delete</button>
                </div>
            </div>

            <!-- JOB & MODEL -->
            <div style="background: #0f0718; border: 1px solid #3b0764; border-radius: 6px; padding: 12px; margin-bottom: 12px;">
                <h4 style="margin: 0 0 10px 0; color: #9b59b6; font-size: 12px;">JOB & MODEL CONFIG</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
                    <div>
                        <label style="font-size: 10px; color: #aaa;">Training Name (LoRa):</label>
                        <input type="text" id="rsl-p-lora" style="width: 100%; padding: 5px; background: #1b1128; border: 1px solid #9b59b6; color: #fff; border-radius: 4px; box-sizing: border-box;" />
                    </div>
                    <div>
                        <label style="font-size: 10px; color: #aaa;">Trigger Word:</label>
                        <input type="text" id="rsl-p-trigger" style="width: 100%; padding: 5px; background: #1b1128; border: 1px solid #9b59b6; color: #fff; border-radius: 4px; box-sizing: border-box;" />
                    </div>
                    <div>
                        <label style="font-size: 10px; color: #aaa;">Model Architecture:</label>
                        <select id="rsl-p-model" style="width: 100%; padding: 5px; background: #1b1128; border: 1px solid #9b59b6; color: #fff; border-radius: 4px;">
                            <option value="krea/Krea-2-Raw">krea/Krea-2-Raw</option>
                            <option value="krea/Krea-2-Turbo">krea/Krea-2-Turbo</option>
                            <option value="flux_dev">Flux.1 Dev</option>
                            <option value="flux_schnell">Flux.1 Schnell</option>
                            <option value="sdxl_base">SDXL Base</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- QUANTIZATION & LOW VRAM OPTIMIZATIONS -->
            <div style="background: #0f0718; border: 1px solid #3b0764; border-radius: 6px; padding: 12px; margin-bottom: 12px;">
                <h4 style="margin: 0 0 10px 0; color: #9b59b6; font-size: 12px;">QUANTIZATION & LOW VRAM OPTIMIZATIONS</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                    <div>
                        <label style="font-size: 10px; color: #aaa;">Transformer Quantize:</label>
                        <select id="rsl-p-qtrans" style="width: 100%; padding: 5px; background: #1b1128; border: 1px solid #9b59b6; color: #fff; border-radius: 4px;">
                            <option value="qfloat8">qfloat8 (default)</option>
                            <option value="float8">float8_e4m3fn</option>
                            <option value="none">bf16 / none</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-size: 10px; color: #aaa;">Text Encoder Quantize:</label>
                        <select id="rsl-p-qte" style="width: 100%; padding: 5px; background: #1b1128; border: 1px solid #9b59b6; color: #fff; border-radius: 4px;">
                            <option value="qfloat8">qfloat8 (default)</option>
                            <option value="float8">float8_e4m3fn</option>
                            <option value="none">bf16 / none</option>
                        </select>
                    </div>
                    <div>
                        <label style="font-size: 10px; color: #aaa;">Optimizer:</label>
                        <select id="rsl-p-opt" style="width: 100%; padding: 5px; background: #1b1128; border: 1px solid #9b59b6; color: #fff; border-radius: 4px;">
                            <option value="AdamW8Bit">AdamW8Bit</option>
                            <option value="AdamW">AdamW</option>
                            <option value="Prodigy">Prodigy</option>
                        </select>
                    </div>
                </div>

                <div style="display: flex; gap: 18px; font-size: 11px; color: #fff; flex-wrap: wrap;">
                    <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                        <input type="checkbox" id="rsl-p-lowvram" /> Low VRAM Mode
                    </label>
                    <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                        <input type="checkbox" id="rsl-p-cache-latents" /> Cache Latents
                    </label>
                    <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                        <input type="checkbox" id="rsl-p-cache-te" /> Cache Text Embeddings
                    </label>
                    <label style="display: flex; align-items: center; gap: 4px; cursor: pointer;">
                        <input type="checkbox" id="rsl-p-unload-te" /> Unload TE
                    </label>
                </div>
            </div>

            <!-- TRAINING & TARGET -->
            <div style="background: #0f0718; border: 1px solid #3b0764; border-radius: 6px; padding: 12px; margin-bottom: 15px;">
                <h4 style="margin: 0 0 10px 0; color: #9b59b6; font-size: 12px;">TRAINING STEPS & NETWORK TARGET</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 10px;">
                    <div>
                        <label style="font-size: 10px; color: #aaa;">Total Steps:</label>
                        <input type="number" id="rsl-p-steps" style="width: 100%; padding: 5px; background: #1b1128; border: 1px solid #9b59b6; color: #fff; border-radius: 4px; box-sizing: border-box;" />
                    </div>
                    <div>
                        <label style="font-size: 10px; color: #aaa;">Learning Rate:</label>
                        <input type="text" id="rsl-p-lr" style="width: 100%; padding: 5px; background: #1b1128; border: 1px solid #9b59b6; color: #fff; border-radius: 4px; box-sizing: border-box;" />
                    </div>
                    <div>
                        <label style="font-size: 10px; color: #aaa;">Linear Rank:</label>
                        <input type="number" id="rsl-p-rank" style="width: 100%; padding: 5px; background: #1b1128; border: 1px solid #9b59b6; color: #fff; border-radius: 4px; box-sizing: border-box;" />
                    </div>
                    <div>
                        <label style="font-size: 10px; color: #aaa;">Linear Alpha:</label>
                        <input type="number" id="rsl-p-alpha" style="width: 100%; padding: 5px; background: #1b1128; border: 1px solid #9b59b6; color: #fff; border-radius: 4px; box-sizing: border-box;" />
                    </div>
                    <div>
                        <label style="font-size: 10px; color: #aaa;">Batch Size:</label>
                        <input type="number" id="rsl-p-batch" style="width: 100%; padding: 5px; background: #1b1128; border: 1px solid #9b59b6; color: #fff; border-radius: 4px; box-sizing: border-box;" />
                    </div>
                    <div>
                        <label style="font-size: 10px; color: #aaa;">Grad Accumulation:</label>
                        <input type="number" id="rsl-p-gradaccum" style="width: 100%; padding: 5px; background: #1b1128; border: 1px solid #9b59b6; color: #fff; border-radius: 4px; box-sizing: border-box;" />
                    </div>
                    <div>
                        <label style="font-size: 10px; color: #aaa;">Dataset Repeats:</label>
                        <input type="number" id="rsl-p-repeats" style="width: 100%; padding: 5px; background: #1b1128; border: 1px solid #9b59b6; color: #fff; border-radius: 4px; box-sizing: border-box;" />
                    </div>
                    <div>
                        <label style="font-size: 10px; color: #aaa;">Save Every (Steps):</label>
                        <input type="number" id="rsl-p-save" style="width: 100%; padding: 5px; background: #1b1128; border: 1px solid #9b59b6; color: #fff; border-radius: 4px; box-sizing: border-box;" />
                    </div>
                </div>
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid #9b59b6; padding-top: 15px;">
                <button id="rsl-btn-cancel" style="padding: 8px 16px; background: #2a1b3d; color: #fff; border: 1px solid #9b59b6; border-radius: 4px; cursor: pointer;">Cancel</button>
                <button id="rsl-btn-update" style="padding: 8px 18px; background: #2ecc71; color: #150b22; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">💾 Save Preset Configuration</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const selectEl = document.getElementById("rsl-preset-select");
    const mLora = document.getElementById("rsl-p-lora");
    const mTrigger = document.getElementById("rsl-p-trigger");
    const mModel = document.getElementById("rsl-p-model");
    const mQTrans = document.getElementById("rsl-p-qtrans");
    const mQTe = document.getElementById("rsl-p-qte");
    const mOpt = document.getElementById("rsl-p-opt");
    const mLowVram = document.getElementById("rsl-p-lowvram");
    const mCacheLatents = document.getElementById("rsl-p-cache-latents");
    const mCacheTe = document.getElementById("rsl-p-cache-te");
    const mUnloadTe = document.getElementById("rsl-p-unload-te");
    const mSteps = document.getElementById("rsl-p-steps");
    const mLr = document.getElementById("rsl-p-lr");
    const mRank = document.getElementById("rsl-p-rank");
    const mAlpha = document.getElementById("rsl-p-alpha");
    const mBatch = document.getElementById("rsl-p-batch");
    const mGradAccum = document.getElementById("rsl-p-gradaccum");
    const mRepeats = document.getElementById("rsl-p-repeats");
    const mSave = document.getElementById("rsl-p-save");

    function populateDropdown() {
        selectEl.innerHTML = "";
        Object.keys(presets).forEach(name => {
            const opt = document.createElement("option");
            opt.value = name;
            opt.innerText = name;
            selectEl.appendChild(opt);
        });
    }

    function loadPresetValues(name) {
        const d = presets[name];
        if (!d) return;
        mLora.value = d.lora_name || "";
        mTrigger.value = d.trigger_word || "";
        mModel.value = d.model_type || "krea/Krea-2-Raw";
        mQTrans.value = d.quantize_transformer || "qfloat8";
        mQTe.value = d.quantize_text_encoder || "qfloat8";
        mOpt.value = d.optimizer || "AdamW8Bit";
        mLowVram.checked = d.low_vram !== false;
        mCacheLatents.checked = d.cache_latents !== false;
        mCacheTe.checked = d.cache_text_embeddings !== false;
        mUnloadTe.checked = d.unload_te === true;
        mSteps.value = d.steps || 3001;
        mLr.value = d.learning_rate || 0.0001;
        mRank.value = d.network_rank || 32;
        mAlpha.value = d.network_alpha || 32;
        mBatch.value = d.batch_size || 1;
        mGradAccum.value = d.gradient_accumulation_steps || 1;
        mRepeats.value = d.repeats || 1;
        mSave.value = d.save_every || 250;
    }

    populateDropdown();
    if (nodeInstance) {
        const presetWidget = nodeInstance.widgets.find(w => w.name === "preset");
        if (presetWidget && presets[presetWidget.value]) {
            selectEl.value = presetWidget.value;
        }
    }
    if (!selectEl.value && Object.keys(presets).length > 0) {
        selectEl.value = Object.keys(presets)[0];
    }
    loadPresetValues(selectEl.value);

    selectEl.onchange = () => loadPresetValues(selectEl.value);
    document.getElementById("rsl-btn-cancel").onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    document.getElementById("rsl-btn-new").onclick = () => {
        openCustomPromptModal("Create New Preset", "Enter preset name:", (newName) => {
            if (!newName) return;
            presets[newName] = {
                model_type: "krea/Krea-2-Raw",
                lora_name: newName.toLowerCase().replace(/\s+/g, "_"),
                trigger_word: "ohwxperson",
                steps: 3001,
                learning_rate: 0.0001,
                network_rank: 32,
                network_alpha: 32,
                optimizer: "AdamW8Bit",
                quantize_transformer: "qfloat8",
                quantize_text_encoder: "qfloat8",
                low_vram: true,
                cache_latents: true,
                cache_text_embeddings: true,
                unload_te: false,
                batch_size: 1,
                gradient_accumulation_steps: 1,
                repeats: 1,
                save_every: 250
            };
            populateDropdown();
            selectEl.value = newName;
            loadPresetValues(newName);
        });
    };

    document.getElementById("rsl-btn-delete").onclick = () => {
        const currentName = selectEl.value;
        if (Object.keys(presets).length <= 1) {
            openCustomAlert("Cannot delete the last remaining preset.");
            return;
        }
        openCustomConfirm(`Are you sure you want to delete preset "${currentName}"?`, async () => {
            try {
                const res = await fetch("/rsl/delete_preset", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: currentName })
                });
                if (res.ok) {
                    const result = await res.json();
                    presets = result.presets;
                    populateDropdown();
                    loadPresetValues(selectEl.value);
                    openCustomAlert(`Preset "${currentName}" deleted successfully!`);
                }
            } catch (err) {
                console.error("[RSL] Error deleting preset:", err);
            }
        });
    };

    document.getElementById("rsl-btn-update").onclick = async () => {
        const currentName = selectEl.value;
        const payloadData = {
            name: currentName,
            data: {
                lora_name: mLora.value,
                trigger_word: mTrigger.value,
                model_type: mModel.value,
                quantize_transformer: mQTrans.value,
                quantize_text_encoder: mQTe.value,
                optimizer: mOpt.value,
                low_vram: mLowVram.checked,
                cache_latents: mCacheLatents.checked,
                cache_text_embeddings: mCacheTe.checked,
                unload_te: mUnloadTe.checked,
                steps: parseInt(mSteps.value, 10) || 3001,
                learning_rate: parseFloat(mLr.value) || 0.0001,
                network_rank: parseInt(mRank.value, 10) || 32,
                network_alpha: parseInt(mAlpha.value, 10) || 32,
                batch_size: parseInt(mBatch.value, 10) || 1,
                gradient_accumulation_steps: parseInt(mGradAccum.value, 10) || 1,
                repeats: parseInt(mRepeats.value, 10) || 1,
                save_every: parseInt(mSave.value, 10) || 250
            }
        };

        try {
            const res = await fetch("/rsl/save_preset", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payloadData)
            });
            if (res.ok) {
                const result = await res.json();
                presets = result.presets;
                
                // Force cache-buster update and invalidate node canvas to ensure immediate execution re-run
                if (nodeInstance) {
                    const busterWidget = nodeInstance.widgets.find(w => w.name === "cache_buster");
                    if (busterWidget) {
                        busterWidget.value = Date.now().toString();
                    }
                    nodeInstance.setDirtyCanvas(true, true);
                }

                openCustomAlert(`Preset "${currentName}" saved and cache successfully busted! Ready to queue.`);
                modal.remove();
            } else {
                openCustomAlert("Failed to save preset.");
            }
        } catch (err) {
            console.error("[RSL] Error saving preset:", err);
        }
    };
}

function openCustomPromptModal(title, labelText, onSubmit) {
    const overlay = document.createElement("div");
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(10, 5, 18, 0.92); z-index: 11000; display: flex;
        align-items: center; justify-content: center; font-family: sans-serif;
    `;
    overlay.innerHTML = `
        <div style="background: #1b1128; border: 2px solid #9b59b6; border-radius: 8px; padding: 20px; width: 360px; color: #f1c40f; box-shadow: 0 10px 25px rgba(0,0,0,0.6);">
            <h4 style="margin-top: 0; color: #f1c40f;">${title}</h4>
            <label style="font-size: 11px; color: #9b59b6; display: block; margin-bottom: 6px;">${labelText}</label>
            <input type="text" id="rsl-prompt-input" style="width: 100%; padding: 8px; background: #0f0718; border: 1px solid #9b59b6; color: #fff; border-radius: 4px; box-sizing: border-box; margin-bottom: 15px;" />
            <div style="display: flex; justify-content: flex-end; gap: 8px;">
                <button id="rsl-p-cancel" style="padding: 6px 12px; background: #2a1b3d; color: #fff; border: 1px solid #9b59b6; border-radius: 4px; cursor: pointer;">Cancel</button>
                <button id="rsl-p-submit" style="padding: 6px 14px; background: #2ecc71; color: #150b22; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Submit</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    const input = document.getElementById("rsl-prompt-input");
    input.focus();

    document.getElementById("rsl-p-cancel").onclick = () => overlay.remove();
    document.getElementById("rsl-p-submit").onclick = () => {
        const val = input.value.trim();
        overlay.remove();
        if (val) onSubmit(val);
    };
}

function openCustomConfirm(message, onConfirm) {
    const overlay = document.createElement("div");
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(10, 5, 18, 0.92); z-index: 11000; display: flex;
        align-items: center; justify-content: center; font-family: sans-serif;
    `;
    overlay.innerHTML = `
        <div style="background: #1b1128; border: 2px solid #e74c3c; border-radius: 8px; padding: 20px; width: 380px; color: #fff; box-shadow: 0 10px 25px rgba(0,0,0,0.6);">
            <h4 style="margin-top: 0; color: #e74c3c;">Confirm Action</h4>
            <p style="font-size: 13px; line-height: 1.4; margin-bottom: 20px;">${message}</p>
            <div style="display: flex; justify-content: flex-end; gap: 8px;">
                <button id="rsl-c-cancel" style="padding: 6px 12px; background: #2a1b3d; color: #fff; border: 1px solid #9b59b6; border-radius: 4px; cursor: pointer;">Cancel</button>
                <button id="rsl-c-yes" style="padding: 6px 14px; background: #e74c3c; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Confirm</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById("rsl-c-cancel").onclick = () => overlay.remove();
    document.getElementById("rsl-c-yes").onclick = () => {
        overlay.remove();
        onConfirm();
    };
}

function openCustomAlert(message) {
    const overlay = document.createElement("div");
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(10, 5, 18, 0.92); z-index: 11000; display: flex;
        align-items: center; justify-content: center; font-family: sans-serif;
    `;
    overlay.innerHTML = `
        <div style="background: #1b1128; border: 2px solid #9b59b6; border-radius: 8px; padding: 20px; width: 380px; color: #fff; box-shadow: 0 10px 25px rgba(0,0,0,0.6);">
            <h4 style="margin-top: 0; color: #f1c40f;">Notice</h4>
            <p style="font-size: 13px; line-height: 1.4; margin-bottom: 20px;">${message}</p>
            <div style="display: flex; justify-content: flex-end;">
                <button id="rsl-a-ok" style="padding: 6px 16px; background: #2ecc71; color: #150b22; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">OK</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById("rsl-a-ok").onclick = () => overlay.remove();
}