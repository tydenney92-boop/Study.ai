const courseId = StudyAI.courseContext.getCourseId();
const materialId = StudyAI.courseContext.getMaterialId();
const title = document.querySelector("#material-title");
const subtitle = document.querySelector("#material-subtitle");
const content = document.querySelector("#material-content");
const status = document.querySelector("#content-status");
const errorBox = document.querySelector("#material-error");
const deleteMaterialModal = document.querySelector("#delete-material-modal");

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

async function loadMaterial() {
    if (!courseId || !materialId) {
        return;
    }

    try {
        const [course, material] = await Promise.all([
            StudyAI.api.get(`/api/courses/${courseId}`),
            StudyAI.api.get(`/api/courses/${courseId}/materials/${materialId}`)
        ]);
        setLinks(course);
        document.title = `${material.originalFilename} | Study AI`;
        title.textContent = material.originalFilename;
        subtitle.textContent = `${course.courseCode} · ${material.unitName || "No unit"}`;
        document.querySelector("#material-type").textContent =
            material.materialType.toUpperCase();
        document.querySelector("#material-unit").textContent = material.unitName || "—";
        document.querySelector("#material-size").textContent = formatFileSize(material.fileSize);
        document.querySelector("#material-date").textContent = formatDate(material.createdAt);
        document.querySelector("#delete-material-button").hidden = false;

        if (material.extractedText && material.extractedText.trim()) {
            content.textContent = material.extractedText;
            status.textContent = "Text extracted";
        } else {
            content.innerHTML = `
                <div class="empty-content">
                    <div>—</div><h3>No extracted text</h3>
                    <p>This file does not contain readable text yet.</p>
                </div>
            `;
            status.textContent = "No text available";
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
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Deleting…";
    try {
        await StudyAI.api.delete(`/api/courses/${courseId}/materials/${materialId}`);
        StudyAI.courseContext.setNotice("Material deleted successfully.");
        window.location.replace(StudyAI.courseContext.url("materials.html", { courseId }));
    } catch (error) {
        document.querySelector("#delete-material-error").textContent = error.message;
        button.disabled = false;
        button.textContent = "Yes, Delete Material";
    }
});
