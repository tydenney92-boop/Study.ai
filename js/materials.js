const courseId = StudyAI.courseContext.getCourseId();
const initialUnitId = Number(new URLSearchParams(window.location.search).get("unitId")) || null;
const container = document.querySelector("#materials-container");
const emptyState = document.querySelector("#empty-materials");
const searchInput = document.querySelector("#material-search");
const unitFilter = document.querySelector("#unit-filter");
const typeFilter = document.querySelector("#type-filter");
const modal = document.querySelector("#upload-modal");
const fileInput = document.querySelector("#file-input");
const selectedFilesPanel = document.querySelector("#selected-file");
const selectedFileCount = document.querySelector("#selected-file-count");
const selectedFileList = document.querySelector("#selected-file-list");
const uploadUnit = document.querySelector("#upload-unit-modal");
const uploadRole = document.querySelector("#upload-role-modal");
const uploadError = document.querySelector("#upload-error");
const confirmUpload = document.querySelector("#confirm-upload");
const batchUploadStatus = document.querySelector("#batch-upload-status");
const batchUploadSummary = document.querySelector("#batch-upload-summary");
const cancelUpload = document.querySelector("#cancel-upload");
const closeUploadButton = document.querySelector("#close-upload-modal");
const modalFileButton = document.querySelector("#modal-file-button");
const emptyTitle = document.querySelector("#empty-materials-title");
const emptyMessage = document.querySelector("#empty-materials-message");
const emptyAction = document.querySelector("#empty-materials-action");

let course = null;
let units = [];
let materials = [];
let selectedFiles = [];
let isUploading = false;
let uploadComplete = false;
let searchTimer = null;
let searchRequest = 0;
const maxBatchFiles = 10;

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
            material.materialType === "slides" ? "PPT" :
                material.materialType === "image" ? "IMG" : "TXT";
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
    } else if (material.extractionMethod === "ocr") {
        extractionBadge.hidden = false;
        extractionBadge.textContent = "Text extracted with OCR";
        extractionBadge.classList.add("ocr");
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
            emptyMessage.textContent = "Upload the first document, screenshot, or note photo for this course.";
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
        const limit = `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`;
        document.querySelector("#upload-file-help").textContent =
            `PDF, TXT, DOCX, PPTX, PNG, or JPEG · max ${limit}` +
            (clientConfig.ocrEnabled ? " · image text recognition enabled" : " · image text recognition unavailable");
        document.title = `${course.courseCode} Materials | Study Signal`;
        document.querySelector("#materials-course-name").textContent =
            `${course.courseCode} · ${course.courseName}`;
        document.querySelector("#upload-course-description").textContent =
            `Add files to ${course.courseCode} — ${course.courseName}. All files use the same unit and material role.`;
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

function uploadButtonLabel() {
    if (selectedFiles.length > 1) return `Upload ${selectedFiles.length} Materials`;
    return uploadRole.value === "syllabus" ? "Upload Syllabus" : "Upload Material";
}

function renderSelectedFiles(statuses = []) {
    selectedFilesPanel.hidden = selectedFiles.length === 0;
    selectedFileCount.textContent = selectedFiles.length
        ? `${selectedFiles.length} file${selectedFiles.length === 1 ? "" : "s"} selected`
        : "";
    selectedFileList.innerHTML = "";

    selectedFiles.forEach((file, index) => {
        const item = document.createElement("li");
        item.className = "selected-file-row";

        const copy = document.createElement("div");
        copy.className = "selected-file-copy";
        const name = document.createElement("span");
        name.className = "selected-file-name";
        name.textContent = file.name;
        const details = document.createElement("small");
        details.textContent = formatSize(file.size);
        copy.append(name, details);

        const status = statuses[index];
        if (status) {
            const statusLabel = document.createElement("span");
            statusLabel.className = `selected-file-status ${status.status}`;
            statusLabel.textContent = status.status === "success"
                ? "✓ Added"
                : `✕ ${status.error?.message || "Upload failed"}`;
            copy.appendChild(statusLabel);
        }

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "selected-file-remove";
        removeButton.textContent = "Remove";
        removeButton.dataset.fileIndex = String(index);
        removeButton.disabled = isUploading || uploadComplete;
        removeButton.setAttribute("aria-label", `Remove ${file.name}`);
        item.append(copy, removeButton);
        selectedFileList.appendChild(item);
    });

    if (!isUploading && !uploadComplete) confirmUpload.textContent = uploadButtonLabel();
}

function selectFiles(fileList) {
    const files = Array.from(fileList || []);
    uploadError.textContent = "";
    batchUploadStatus.hidden = true;
    batchUploadStatus.classList.remove("has-failures");
    if (files.length > maxBatchFiles) {
        selectedFiles = [];
        renderSelectedFiles();
        uploadError.textContent = `Choose up to ${maxBatchFiles} files at a time.`;
        fileInput.value = "";
        return;
    }
    selectedFiles = files;
    renderSelectedFiles();
}

function setUploadControlsDisabled(disabled) {
    fileInput.disabled = disabled;
    modalFileButton.disabled = disabled;
    uploadUnit.disabled = disabled;
    uploadRole.disabled = disabled;
    closeUploadButton.disabled = disabled;
    cancelUpload.disabled = disabled;
    confirmUpload.disabled = disabled;
    selectedFileList.querySelectorAll("button").forEach(button => {
        button.disabled = disabled;
    });
}

function openModal() {
    if (!courseId) return;
    modal.classList.add("active");
    uploadError.textContent = "";
    const requestedRole = new URLSearchParams(window.location.search).get("role");
    if (["general", "syllabus", "exam_review", "study_guide"].includes(requestedRole)) {
        uploadRole.value = requestedRole;
    }
    const syllabusUpload = uploadRole.value === "syllabus";
    document.querySelector("#upload-modal-title").textContent = syllabusUpload ? "Upload Syllabus" : "Upload Material";
    confirmUpload.textContent = uploadButtonLabel();
}

function closeModal() {
    if (isUploading) return;
    modal.classList.remove("active");
    selectedFiles = [];
    uploadComplete = false;
    renderSelectedFiles();
    fileInput.value = "";
    uploadError.textContent = "";
    batchUploadStatus.hidden = true;
    batchUploadSummary.textContent = "";
    cancelUpload.textContent = "Cancel";
    confirmUpload.hidden = false;
    setUploadControlsDisabled(false);
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
closeUploadButton.addEventListener("click", closeModal);
cancelUpload.addEventListener("click", closeModal);
modalFileButton.addEventListener("click", () => fileInput.click());
document.querySelector("#file-drop-zone").addEventListener("click", event => {
    if (!event.target.closest("button") && !isUploading) fileInput.click();
});
fileInput.addEventListener("change", () => selectFiles(fileInput.files));

selectedFileList.addEventListener("click", event => {
    const removeButton = event.target.closest("[data-file-index]");
    if (!removeButton || isUploading || uploadComplete) return;
    selectedFiles.splice(Number(removeButton.dataset.fileIndex), 1);
    fileInput.value = "";
    renderSelectedFiles();
});

const fileDropZone = document.querySelector("#file-drop-zone");
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
    if (!isUploading) selectFiles(event.dataTransfer.files);
});

confirmUpload.addEventListener("click", async () => {
    if (isUploading || uploadComplete) return;
    if (!selectedFiles.length) {
        uploadError.textContent = "Choose at least one file first.";
        return;
    }

    const filesToUpload = [...selectedFiles];
    const formData = new FormData();
    const isBatch = filesToUpload.length > 1;
    filesToUpload.forEach(file => formData.append(isBatch ? "files" : "file", file));
    if (uploadUnit.value) formData.append("unitId", uploadUnit.value);
    formData.append("materialRole", uploadRole.value);
    isUploading = true;
    setUploadControlsDisabled(true);
    confirmUpload.textContent = isBatch
        ? `Processing ${filesToUpload.length} files…`
        : "Processing…";
    uploadError.textContent = "";
    batchUploadStatus.hidden = false;
    batchUploadSummary.textContent = isBatch
        ? `Processing ${filesToUpload.length} files…`
        : "Processing file…";

    try {
        const response = await StudyAI.api.upload(
            `/api/courses/${courseId}/materials${isBatch ? "/batch" : ""}`,
            formData,
            { timeoutMs: 120000 * filesToUpload.length }
        );
        if (isBatch) {
            isUploading = false;
            uploadComplete = true;
            renderSelectedFiles(response.results);
            const selectedUnit = uploadUnit.value;
            const unit = units.find(value => String(value.id) === selectedUnit);
            const destination = unit ? `Unit ${unit.unitNumber}` : "this course";
            const successNoun = response.succeeded === 1 ? "material" : "materials";
            const failureSummary = response.failed
                ? ` ${response.failed} file${response.failed === 1 ? "" : "s"} failed.`
                : "";
            batchUploadSummary.textContent =
                `${response.succeeded} ${successNoun} added to ${destination}.${failureSummary}`;
            batchUploadStatus.classList.toggle("has-failures", response.failed > 0);
            confirmUpload.hidden = true;
            cancelUpload.textContent = "Done";
            cancelUpload.disabled = false;
            closeUploadButton.disabled = false;
            try {
                materials = await StudyAI.api.get(`/api/courses/${courseId}/materials`);
                unitFilter.value = selectedUnit || "none";
                searchInput.value = "";
                typeFilter.value = "all";
                renderMaterials();
            } catch (refreshError) {
                uploadError.textContent =
                    "The files were processed, but the materials list could not refresh. Reload this page to see the latest materials.";
            }
            return;
        }

        const material = response;
        const onboardingRole = new URLSearchParams(window.location.search).get("role");
        window.location.href = StudyAI.courseContext.url("material.html", {
            courseId,
            materialId: material.id,
            onboarding: uploadRole.value === "syllabus"
                ? "syllabus-ready"
                : onboardingRole === "general" ? "material-ready" : null
        });
    } catch (error) {
        uploadError.textContent = error.message;
        isUploading = false;
        batchUploadStatus.hidden = true;
        setUploadControlsDisabled(false);
        renderSelectedFiles();
    }
});
uploadRole.addEventListener("change", () => {
    const syllabusUpload = uploadRole.value === "syllabus";
    document.querySelector("#upload-modal-title").textContent = syllabusUpload ? "Upload Syllabus" : "Upload Material";
    confirmUpload.textContent = uploadButtonLabel();
});

searchInput.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(searchMaterials, 250);
});
unitFilter.addEventListener("change", renderMaterials);
typeFilter.addEventListener("change", renderMaterials);
loadPage();
