(function() {
    async function mount({ container, courseId, initialMaterialIds = [], actionButton }) {
        const selected = new Set(initialMaterialIds.map(Number));
        const updateAction = () => {
            if (actionButton) actionButton.disabled = selected.size === 0;
        };

        if (!courseId) {
            container.innerHTML = `
                <div class="friendly-empty"><strong>No course selected</strong>
                <a class="text-link" href="index.html#courses">Choose a course →</a></div>`;
            updateAction();
            return { getSelectedIds: () => [...selected], getUsableCount: () => 0 };
        }

        container.innerHTML = '<div class="friendly-empty"><span>Loading course materials…</span></div>';
        const materials = await StudyAI.api.get(`/api/courses/${courseId}/materials`);
        if (materials.length === 0) {
            container.innerHTML = `
                <div class="friendly-empty"><strong>No materials yet</strong>
                <span>Upload a course material before generating study content.</span>
                <a class="primary-button compact-action" href="materials.html?courseId=${encodeURIComponent(courseId)}">+ Add Materials</a></div>`;
            selected.clear();
            updateAction();
            return { getSelectedIds: () => [], getUsableCount: () => 0 };
        }

        container.innerHTML = '<div class="material-choice-list"></div>';
        const list = container.firstElementChild;
        materials.forEach(material => {
            const label = document.createElement("label");
            label.className = "material-choice";
            label.innerHTML = '<input type="checkbox"><span><strong></strong><small></small></span>';
            const input = label.querySelector("input");
            input.value = material.id;
            const usable = material.extractionStatus === "extracted";
            input.disabled = !usable;
            input.checked = usable && selected.has(material.id);
            if (!usable) selected.delete(material.id);
            label.querySelector("strong").textContent = material.displayName || material.originalFilename;
            const location = material.unitName
                ? `Unit ${material.unitNumber}: ${material.unitName}`
                : "No unit assigned";
            const unavailableLabels = {
                no_text: "No extractable text",
                unsupported: "Unsupported for AI",
                failed: "Extraction failed"
            };
            label.querySelector("small").textContent = usable
                ? location
                : `${location} · ${unavailableLabels[material.extractionStatus] || "Text unavailable"}`;
            label.classList.toggle("unavailable", !usable);
            input.addEventListener("change", () => {
                if (input.checked) selected.add(material.id);
                else selected.delete(material.id);
                label.classList.toggle("selected", input.checked);
                updateAction();
            });
            label.classList.toggle("selected", input.checked);
            list.appendChild(label);
        });
        updateAction();
        const usableCount = materials.filter(
            material => material.extractionStatus === "extracted"
        ).length;
        return {
            getSelectedIds: () => [...selected],
            getUsableCount: () => usableCount
        };
    }

    window.StudyAI.materialSelection = { mount };
})();
