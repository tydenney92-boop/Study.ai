const courseId = StudyAI.courseContext.getCourseId();
const initialUnitId = Number(new URLSearchParams(window.location.search).get("unitId")) || null;
const container = document.querySelector("#materials-container");
const emptyState = document.querySelector("#empty-materials");
const searchInput = document.querySelector("#material-search");
const unitFilter = document.querySelector("#unit-filter");
const typeFilter = document.querySelector("#type-filter");
const modal = document.querySelector("#upload-modal");
const fileInput = document.querySelector("#file-input");
const selectedFileLabel = document.querySelector("#selected-file");
const uploadUnit = document.querySelector("#upload-unit-modal");
const uploadError = document.querySelector("#upload-error");
const confirmUpload = document.querySelector("#confirm-upload");
const emptyTitle = document.querySelector("#empty-materials-title");
const emptyMessage = document.querySelector("#empty-materials-message");
const emptyAction = document.querySelector("#empty-materials-action");

let course = null;
let units = [];
let materials = [];
let selectedFile = null;
let searchTimer = null;
let searchRequest = 0;

if (!courseId) {
    StudyAI.courseContext.goToMyCourses("Choose a course to view its materials.");
}

const materialsNotice = sessionStorage.getItem("studyai:notice");
if (materialsNotice) {
    sessionStorage.removeItem("studyai:notice");
    const notice = document.createElement("div");
    notice.className = "friendly-empty success-state";
    notice.textContent = materialsNotice;
    document.querySelector(".materials-header").insertAdjacentElement("afterend", notice);
}

function formatSize(bytes) {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function materialCard(material) {
    const card = document.createElement("article");
    card.className = "material-card";
    card.tabIndex = 0;
    card.innerHTML = `
        <div class="material-icon ${material.materialType}"></div>
        <div class="material-info">
            <h3></h3>
            <p></p>
            <span class="material-metadata"></span>
            <span class="extraction-badge" hidden></span>
        </div>
        <span class="material-arrow">→</span>
    `;
    card.querySelector(".material-icon").textContent =
        material.materialType === "pdf" ? "PDF" :
            material.materialType === "slides" ? "PPT" : "TXT";
    card.querySelector("h3").textContent = material.displayName;
    card.querySelector("p").textContent = material.unitName || "No unit";
    card.querySelector(".material-metadata").textContent =
        `${material.materialType.toUpperCase()} • ${formatSize(material.fileSize)}`;
    const extractionBadge = card.querySelector(".extraction-badge");
    const statusLabels = {
        no_text: "No extractable text",
        unsupported: "Unsupported for AI",
        failed: "Extraction failed"
    };
    if (statusLabels[material.extractionStatus]) {
        extractionBadge.hidden = false;
        extractionBadge.textContent = statusLabels[material.extractionStatus];
        extractionBadge.classList.add(material.extractionStatus);
    }

    const openMaterial = () => {
        window.location.href = StudyAI.courseContext.url("material.html", {
            courseId,
            materialId: material.id
        });
    };
    card.addEventListener("click", openMaterial);
    card.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") openMaterial();
    });
    return card;
}

function renderMaterials() {
    const selectedUnit = unitFilter.value;
    const selectedType = typeFilter.value;
    const filtered = materials.filter(material => {
        const matchesUnit = selectedUnit === "all" ||
            (selectedUnit === "none" && material.unitId === null) ||
            String(material.unitId) === selectedUnit;
        const matchesType = selectedType === "all" || material.materialType === selectedType;
        return matchesUnit && matchesType;
    });

    container.innerHTML = "";
    emptyState.style.display = filtered.length ? "none" : "block";
    if (!filtered.length) {
        const hasQuery = searchInput.value.trim().length > 0;
        const hasFilter = unitFilter.value !== "all" || typeFilter.value !== "all";
        if (hasQuery || hasFilter) {
            emptyTitle.textContent = "No matching materials";
            emptyMessage.textContent = "Try a different search or clear the active filters.";
            emptyAction.textContent = "Clear Search & Filters";
            emptyAction.dataset.action = "clear";
        } else {
            emptyTitle.textContent = "No materials yet";
            emptyMessage.textContent = "Upload the first PDF, TXT, DOCX, or PPTX for this course.";
            emptyAction.textContent = "Upload Material";
            emptyAction.dataset.action = "upload";
        }
    }

    const groups = new Map();
    filtered.forEach(material => {
        const key = material.unitId === null ? "none" : String(material.unitId);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(material);
    });

    const orderedKeys = [
        ...units.map(unit => String(unit.id)),
        "none"
    ].filter(key => groups.has(key));

    orderedKeys.forEach(key => {
        const groupMaterials = groups.get(key);
        const unit = units.find(value => String(value.id) === key);
        const section = document.createElement("section");
        section.className = "material-unit";
        section.innerHTML = `
            <div class="unit-header">
                <div><span class="unit-number"></span><h2></h2></div>
                <span class="unit-count"></span>
            </div>
            <div class="materials-grid"></div>
        `;
        section.querySelector(".unit-number").textContent = unit
            ? `UNIT ${unit.unitNumber}`
            : "UNASSIGNED";
        section.querySelector("h2").textContent = unit ? unit.name : "Other Course Materials";
        section.querySelector(".unit-count").textContent =
            `${groupMaterials.length} material${groupMaterials.length === 1 ? "" : "s"}`;
        const grid = section.querySelector(".materials-grid");
        groupMaterials.forEach(material => grid.appendChild(materialCard(material)));
        container.appendChild(section);
    });
}

async function searchMaterials() {
    const requestNumber = ++searchRequest;
    const query = searchInput.value.trim();
    try {
        materials = await StudyAI.api.get(
            `/api/courses/${courseId}/materials?search=${encodeURIComponent(query)}`
        );
        if (requestNumber === searchRequest) renderMaterials();
    } catch (error) {
        if (requestNumber === searchRequest) {
            StudyAI.ui.notify(error.message, { type: "error" });
        }
    }
}

function populateUnitSelects() {
    unitFilter.innerHTML = '<option value="all">All Units</option>';
    uploadUnit.innerHTML = '<option value="">No unit</option>';
    units.forEach(unit => {
        const filterOption = document.createElement("option");
        filterOption.value = unit.id;
        filterOption.textContent = `Unit ${unit.unitNumber} — ${unit.name}`;
        unitFilter.appendChild(filterOption);
        uploadUnit.appendChild(filterOption.cloneNode(true));
    });
    const noneOption = document.createElement("option");
    noneOption.value = "none";
    noneOption.textContent = "No Unit";
    unitFilter.appendChild(noneOption);
    if (initialUnitId && units.some(unit => unit.id === initialUnitId)) {
        unitFilter.value = String(initialUnitId);
        uploadUnit.value = String(initialUnitId);
    }
}

async function loadPage() {
    if (!courseId) {
        return;
    }

    try {
        const [loadedCourse, loadedUnits, loadedMaterials, clientConfig] = await Promise.all([
            StudyAI.api.get(`/api/courses/${courseId}`),
            StudyAI.api.get(`/api/courses/${courseId}/units`),
            StudyAI.api.get(`/api/courses/${courseId}/materials`),
            StudyAI.api.get("/api/client-config")
        ]);
        course = loadedCourse;
        units = loadedUnits;
        materials = loadedMaterials;
        const megabytes = clientConfig.maxUploadBytes / (1024 * 1024);
        document.querySelector("#upload-file-help").textContent =
            `PDF, TXT, DOCX, or PPTX · max ${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`;
        document.title = `${course.courseCode} Materials | Study Signal`;
        document.querySelector("#materials-course-name").textContent =
            `${course.courseCode} · ${course.courseName}`;
        document.querySelector("#upload-course-description").textContent =
            `Add a file to ${course.courseCode} — ${course.courseName}.`;
        const courseLink = document.querySelector("#materials-course-link");
        courseLink.textContent = `← ${course.courseCode}`;
        courseLink.href = StudyAI.courseContext.url("course.html", { courseId });
        populateUnitSelects();
        renderMaterials();
        if (new URLSearchParams(window.location.search).get("upload") === "1") openModal();
    } catch (error) {
        if (error.status === 404) {
            StudyAI.courseContext.goToMyCourses("That course is unavailable.");
            return;
        }
        container.innerHTML = '<div class="friendly-empty error-state"></div>';
        container.querySelector("div").textContent = error.message;
    }
}

function openModal() {
    if (!courseId) return;
    modal.classList.add("active");
    uploadError.textContent = "";
}

function closeModal() {
    modal.classList.remove("active");
    selectedFile = null;
    selectedFileLabel.textContent = "";
    fileInput.value = "";
    uploadError.textContent = "";
}

modal.addEventListener("studyai:modal-close", closeModal);

document.querySelector("#upload-button").addEventListener("click", openModal);
document.querySelector("#upload-button-bottom").addEventListener("click", openModal);
emptyAction.addEventListener("click", () => {
    if (emptyAction.dataset.action === "clear") {
        searchInput.value = "";
        unitFilter.value = "all";
        typeFilter.value = "all";
        searchMaterials();
    } else {
        openModal();
    }
});
document.querySelector("#close-upload-modal").addEventListener("click", closeModal);
document.querySelector("#cancel-upload").addEventListener("click", closeModal);
document.querySelector("#modal-file-button").addEventListener("click", () => fileInput.click());
document.querySelector("#file-drop-zone").addEventListener("click", event => {
    if (event.target.id !== "modal-file-button") fileInput.click();
});
fileInput.addEventListener("change", () => {
    selectedFile = fileInput.files[0] || null;
    selectedFileLabel.textContent = selectedFile
        ? `${selectedFile.name} · ${formatSize(selectedFile.size)}`
        : "";
});

const fileDropZone = document.querySelector("#file-drop-zone");
fileDropZone.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        fileInput.click();
    }
});
["dragenter", "dragover"].forEach(eventName => {
    fileDropZone.addEventListener(eventName, event => {
        event.preventDefault();
        fileDropZone.classList.add("dragging");
    });
});
["dragleave", "drop"].forEach(eventName => {
    fileDropZone.addEventListener(eventName, event => {
        event.preventDefault();
        fileDropZone.classList.remove("dragging");
    });
});
fileDropZone.addEventListener("drop", event => {
    selectedFile = event.dataTransfer.files[0] || null;
    selectedFileLabel.textContent = selectedFile
        ? `${selectedFile.name} · ${formatSize(selectedFile.size)}`
        : "";
});

confirmUpload.addEventListener("click", async () => {
    if (!selectedFile) {
        uploadError.textContent = "Choose a file first.";
        return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);
    if (uploadUnit.value) formData.append("unitId", uploadUnit.value);
    confirmUpload.disabled = true;
    confirmUpload.textContent = "Uploading…";
    uploadError.textContent = "";

    try {
        const material = await StudyAI.api.upload(
            `/api/courses/${courseId}/materials`,
            formData,
            { timeoutMs: 120000 }
        );
        window.location.href = StudyAI.courseContext.url("material.html", {
            courseId,
            materialId: material.id
        });
    } catch (error) {
        uploadError.textContent = error.message;
        confirmUpload.disabled = false;
        confirmUpload.textContent = "Upload Material";
    }
});

searchInput.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(searchMaterials, 250);
});
unitFilter.addEventListener("change", renderMaterials);
typeFilter.addEventListener("change", renderMaterials);
loadPage();
