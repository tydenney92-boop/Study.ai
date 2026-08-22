const materialContext = StudyAI.courseContext.normalizeMaterialUrl();
const courseId = materialContext.courseId;
const materialId = materialContext.materialId;
const title = document.querySelector("#material-title");
const subtitle = document.querySelector("#material-subtitle");
const content = document.querySelector("#material-content");
const status = document.querySelector("#content-status");
const errorBox = document.querySelector("#material-error");
const deleteMaterialModal = document.querySelector("#delete-material-modal");
const editMaterialModal = document.querySelector("#edit-material-modal");
let loadedMaterial = null;
let courseUnits = [];

if (!courseId || !materialId) {
    StudyAI.courseContext.goToMyCourses("Choose a material from a course first.");
}

function formatFileSize(bytes) {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value) {
    if (!value) return "—";
    const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
    return new Date(normalized).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
    });
}

function showError(message) {
    errorBox.style.display = "block";
    errorBox.querySelector("p").textContent = message;
    document.querySelector(".material-content-panel").style.display = "none";
}

function setLinks(course) {
    const materialsUrl = StudyAI.courseContext.url("materials.html", { courseId });
    const materialUrlValues = { courseId, materialId };
    const backLink = document.querySelector("#material-back-link");
    backLink.href = materialsUrl;
    backLink.textContent = `← ${course.courseCode} Materials`;
    document.querySelector("#material-error-back-link").href = materialsUrl;
    document.querySelector("#material-quiz-link").href =
        StudyAI.courseContext.url("quiz.html", materialUrlValues);
    document.querySelector("#material-study-guide-link").href =
        StudyAI.courseContext.url("study-guide.html", materialUrlValues);
    document.querySelector("#material-flashcards-link").href =
        StudyAI.courseContext.url("flashcards.html", materialUrlValues);
}

function disableStudyActions(message) {
    [
        "#material-quiz-link",
        "#material-study-guide-link",
        "#material-flashcards-link"
    ].forEach(selector => {
        const link = document.querySelector(selector);
        link.removeAttribute("href");
        link.classList.add("disabled");
        link.setAttribute("aria-disabled", "true");
        link.title = message;
    });
}

async function loadMaterial() {
    if (!courseId || !materialId) {
        return;
    }

    try {
        const [course, material, units] = await Promise.all([
            StudyAI.api.get(`/api/courses/${courseId}`),
            StudyAI.api.get(`/api/courses/${courseId}/materials/${materialId}`),
            StudyAI.api.get(`/api/courses/${courseId}/units`)
        ]);
        loadedMaterial = material;
        courseUnits = units;
        setLinks(course);
        document.title = `${material.displayName} | Study Signal`;
        title.textContent = material.displayName;
        subtitle.textContent = `${course.courseCode} · ${material.unitName || "No unit"}`;
        document.querySelector("#material-type").textContent =
            material.materialType.toUpperCase();
        document.querySelector("#material-unit").textContent = material.unitName || "—";
        document.querySelector("#material-size").textContent = formatFileSize(material.fileSize);
        document.querySelector("#material-date").textContent = formatDate(material.createdAt);
        document.querySelector("#material-management-actions").hidden = false;
        document.querySelector("#view-original-link").href = StudyAI.apiUrl(
            `/api/courses/${courseId}/materials/${materialId}/file`
        );
        document.querySelector("#download-original-link").href = StudyAI.apiUrl(
            `/api/courses/${courseId}/materials/${materialId}/file?download=1`
        );
        document.querySelector("#material-status-panel").hidden = false;
        const extractionLabels = {
            extracted: "Extracted and AI-ready",
            no_text: "No extractable text",
            unsupported: "Unsupported for AI",
            failed: "Extraction failed"
        };
        document.querySelector("#material-extraction-status").textContent =
            extractionLabels[material.extractionStatus] || "Unknown";
        document.querySelector("#material-extraction-error").textContent =
            material.extractionError || "No extraction errors.";

        if (material.extractionStatus === "extracted" &&
            material.extractedText && material.extractedText.trim()) {
            content.textContent = material.extractedText;
            status.textContent = "Text extracted";
        } else {
            const statusContent = {
                no_text: {
                    label: "No extractable text",
                    message: "This file does not contain enough readable text. Scanned PDFs require OCR, which is not currently supported."
                },
                unsupported: {
                    label: "Unsupported format",
                    message: "Legacy DOC and PPT files are stored but cannot be used with AI. Re-upload as DOCX, PPTX, PDF, or TXT."
                },
                failed: {
                    label: "Extraction failed",
                    message: material.extractionError || "Text extraction failed. Try re-uploading a valid PDF, TXT, DOCX, or PPTX file."
                }
            }[material.extractionStatus] || {
                label: "No text available",
                message: "This file does not contain readable text yet."
            };
            content.innerHTML = `
                <div class="empty-content">
                    <div>—</div><h3>No extracted text</h3>
                    <p></p>
                </div>
            `;
            content.querySelector("p").textContent = statusContent.message;
            status.textContent = statusContent.label;
            disableStudyActions(
                "This material does not contain extractable text yet. Try a typed PDF, DOCX, PPTX, or TXT file."
            );
        }
    } catch (error) {
        if (error.code === "COURSE_NOT_FOUND") {
            StudyAI.courseContext.goToMyCourses("That course is unavailable.");
            return;
        }
        showError(error.message);
    }
}

loadMaterial();

function closeEditMaterialModal() {
    editMaterialModal.classList.remove("open");
    document.querySelector("#edit-material-error").textContent = "";
}

document.querySelector("#edit-material-button").addEventListener("click", () => {
    if (!loadedMaterial) return;
    const select = document.querySelector("#edit-material-unit");
    select.innerHTML = '<option value="">No unit</option>';
    courseUnits.forEach(unit => {
        const option = document.createElement("option");
        option.value = unit.id;
        option.textContent = `Unit ${unit.unitNumber} — ${unit.name}`;
        select.appendChild(option);
    });
    select.value = loadedMaterial.unitId === null ? "" : String(loadedMaterial.unitId);
    document.querySelector("#edit-material-name").value = loadedMaterial.displayName;
    document.querySelector("#original-file-name").textContent = loadedMaterial.originalFilename;
    editMaterialModal.classList.add("open");
});
document.querySelector("#close-edit-material-modal").addEventListener("click", closeEditMaterialModal);
document.querySelector("#cancel-edit-material").addEventListener("click", closeEditMaterialModal);
document.querySelector("#edit-material-form").addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type='submit']");
    button.disabled = true;
    try {
        await StudyAI.api.patch(
            `/api/courses/${courseId}/materials/${materialId}`,
            {
                displayName: document.querySelector("#edit-material-name").value,
                unitId: document.querySelector("#edit-material-unit").value || null
            }
        );
        closeEditMaterialModal();
        await loadMaterial();
        StudyAI.ui.notify("Material details updated.", { type: "success" });
    } catch (error) {
        document.querySelector("#edit-material-error").textContent = error.message;
    } finally {
        button.disabled = false;
    }
});

function closeDeleteMaterialModal() {
    deleteMaterialModal.classList.remove("open");
    document.querySelector("#delete-material-error").textContent = "";
}

document.querySelector("#delete-material-button").addEventListener("click", () => {
    deleteMaterialModal.classList.add("open");
});
document.querySelector("#close-delete-material-modal").addEventListener("click", closeDeleteMaterialModal);
document.querySelector("#cancel-delete-material").addEventListener("click", closeDeleteMaterialModal);
document.querySelector("#confirm-delete-material").addEventListener("click", async event => {
    if (!loadedMaterial) return;
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Deleting…";
    try {
        const result = await StudyAI.api.delete(
            `/api/courses/${loadedMaterial.courseId}/materials/${loadedMaterial.id}`
        );
        StudyAI.courseContext.setNotice(result?.cleanup?.pending
            ? "Material deleted. Stored-file cleanup is queued and will be retried."
            : "Material deleted successfully.");
        window.location.replace(
            StudyAI.courseContext.url("materials.html", {
                courseId: loadedMaterial.courseId
            })
        );
    } catch (error) {
        document.querySelector("#delete-material-error").textContent = error.message;
        button.disabled = false;
        button.textContent = "Yes, Delete Material";
    }
});
