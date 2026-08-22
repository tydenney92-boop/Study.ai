const courseId = StudyAI.courseContext.getCourseId();
const unitsList = document.querySelector("#course-units-list");
const unitModal = document.querySelector("#unit-modal");
const unitForm = document.querySelector("#unit-form");
const unitFormError = document.querySelector("#unit-form-error");
const deleteModal = document.querySelector("#delete-course-modal");
const editCourseModal = document.querySelector("#edit-course-modal");
const deleteUnitModal = document.querySelector("#delete-unit-modal");
let loadedCourse = null;
let units = [];
let materials = [];
let editingUnit = null;
let pendingDeleteUnit = null;
let reorderPending = false;

if (!courseId) StudyAI.courseContext.goToMyCourses("Choose a course to continue.");

function courseUrl(page, values = {}) {
    return StudyAI.courseContext.url(page, { courseId, ...values });
}

function unitMaterialCount(unitId) {
    return materials.filter(material => material.unitId === unitId).length;
}

function renderUnit(unit, index) {
    const card = document.createElement("article");
    card.className = "course-card unit-management-card";
    card.innerHTML = `
        <div class="course-color blue"></div>
        <a class="unit-main-link"><div class="course-info">
            <span class="course-code"></span><h3></h3>
            <div class="course-meta-line"></div>
        </div></a>
        <div class="unit-management-actions">
            <button type="button" class="icon-button unit-up" aria-label="Move unit up">↑</button>
            <button type="button" class="icon-button unit-down" aria-label="Move unit down">↓</button>
            <button type="button" class="text-button unit-edit">Edit</button>
            <button type="button" class="text-button destructive unit-delete">Delete</button>
        </div>
    `;
    card.querySelector(".unit-main-link").href = courseUrl("materials.html", { unitId: unit.id });
    card.querySelector(".course-code").textContent = `UNIT ${String(unit.unitNumber).padStart(2, "0")}`;
    card.querySelector("h3").textContent = unit.name;
    const count = unitMaterialCount(unit.id);
    card.querySelector(".course-meta-line").textContent = `${count} material${count === 1 ? "" : "s"}`;
    const up = card.querySelector(".unit-up");
    const down = card.querySelector(".unit-down");
    up.disabled = reorderPending || index === 0;
    down.disabled = reorderPending || index === units.length - 1;
    up.addEventListener("click", () => moveUnit(index, -1));
    down.addEventListener("click", () => moveUnit(index, 1));
    card.querySelector(".unit-edit").addEventListener("click", () => openUnitModal(unit));
    card.querySelector(".unit-delete").addEventListener("click", () => openDeleteUnit(unit));
    return card;
}

function renderUnits() {
    unitsList.innerHTML = "";
    if (!units.length) {
        unitsList.innerHTML = '<div class="friendly-empty"><strong>No units yet</strong><span>Create a unit to organize this course.</span></div>';
        return;
    }
    units.forEach((unit, index) => unitsList.appendChild(renderUnit(unit, index)));
}

async function loadCourse() {
    if (!courseId) return;
    try {
        [loadedCourse, units, materials] = await Promise.all([
            StudyAI.api.get(`/api/courses/${courseId}`),
            StudyAI.api.get(`/api/courses/${courseId}/units`),
            StudyAI.api.get(`/api/courses/${courseId}/materials`)
        ]);
        document.title = `${loadedCourse.courseCode} | Study Signal`;
        document.querySelector("#course-code-title").textContent = loadedCourse.courseCode;
        document.querySelector("#course-name-subtitle").textContent = loadedCourse.courseName;
        document.querySelector("#course-semester").textContent = loadedCourse.semester || "No semester";
        document.querySelector("#course-danger-zone").hidden = false;
        document.querySelector("#edit-course-button").hidden = false;
        document.querySelectorAll("[data-course-page]").forEach(link => {
            link.href = courseUrl(link.dataset.coursePage, link.dataset.openUpload ? { upload: 1 } : {});
        });
        document.querySelector("#course-unit-count").textContent = units.length;
        document.querySelector("#course-material-count").textContent = materials.length;
        document.querySelector("#course-pdf-count").textContent = materials.filter(material => material.materialType === "pdf").length;
        document.querySelector("#course-other-count").textContent = materials.filter(material => material.materialType !== "pdf").length;
        renderUnits();
    } catch (error) {
        if (error.status === 404) {
            StudyAI.courseContext.goToMyCourses("That course is unavailable.");
            return;
        }
        unitsList.innerHTML = '<div class="friendly-empty error-state"></div>';
        unitsList.querySelector("div").textContent = error.message;
    }
}

function openUnitModal(unit = null) {
    if (!courseId) return;
    editingUnit = unit;
    unitForm.reset();
    unitFormError.textContent = "";
    document.querySelector("#unit-modal-title").textContent = unit ? "Rename Unit" : "Add a Unit";
    document.querySelector("#save-unit-button").textContent = unit ? "Save Name" : "Create Unit";
    if (unit) document.querySelector("#unit-name").value = unit.name;
    unitModal.classList.add("open");
}

function closeUnitModal() {
    unitModal.classList.remove("open");
    unitForm.reset();
    unitFormError.textContent = "";
    editingUnit = null;
}

async function moveUnit(index, offset) {
    if (reorderPending) return;
    const reordered = [...units];
    const [unit] = reordered.splice(index, 1);
    reordered.splice(index + offset, 0, unit);
    try {
        reorderPending = true;
        renderUnits();
        units = await StudyAI.api.put(`/api/courses/${courseId}/units/order`, {
            unitIds: reordered.map(item => item.id)
        });
        renderUnits();
        StudyAI.ui.notify("Unit order updated.", { type: "success" });
    } catch (error) {
        StudyAI.ui.notify(error.message, { type: "error" });
    } finally {
        reorderPending = false;
        renderUnits();
    }
}

function openDeleteUnit(unit) {
    pendingDeleteUnit = unit;
    document.querySelector("#delete-unit-modal-title").textContent = `Delete ${unit.name}?`;
    document.querySelector("#delete-unit-error").textContent = "";
    deleteUnitModal.classList.add("open");
}
function closeDeleteUnit() {
    deleteUnitModal.classList.remove("open");
    document.querySelector("#delete-unit-error").textContent = "";
    pendingDeleteUnit = null;
}

document.querySelector("#add-unit-button").addEventListener("click", () => openUnitModal());
document.querySelector("#close-unit-modal").addEventListener("click", closeUnitModal);
document.querySelector("#cancel-unit").addEventListener("click", closeUnitModal);
unitForm.addEventListener("submit", async event => {
    event.preventDefault();
    const submitButton = unitForm.querySelector("button[type='submit']");
    const wasEditing = Boolean(editingUnit);
    submitButton.disabled = true;
    unitFormError.textContent = "";
    try {
        if (editingUnit) {
            await StudyAI.api.patch(`/api/courses/${courseId}/units/${editingUnit.id}`, {
                name: document.querySelector("#unit-name").value
            });
        } else {
            await StudyAI.api.post(`/api/courses/${courseId}/units`, {
                name: document.querySelector("#unit-name").value
            });
        }
        closeUnitModal();
        await loadCourse();
        StudyAI.ui.notify(wasEditing ? "Unit renamed." : "Unit created.", { type: "success" });
    } catch (error) {
        unitFormError.textContent = error.message;
    } finally {
        submitButton.disabled = false;
    }
});

document.querySelector("#close-delete-unit-modal").addEventListener("click", closeDeleteUnit);
document.querySelector("#cancel-delete-unit").addEventListener("click", closeDeleteUnit);
document.querySelector("#confirm-delete-unit").addEventListener("click", async event => {
    if (!pendingDeleteUnit) return;
    const button = event.currentTarget;
    button.disabled = true;
    try {
        await StudyAI.api.delete(`/api/courses/${courseId}/units/${pendingDeleteUnit.id}`);
        closeDeleteUnit();
        await loadCourse();
        StudyAI.ui.notify("Unit deleted. Its materials are now unassigned.", { type: "success" });
    } catch (error) {
        document.querySelector("#delete-unit-error").textContent = error.message;
    } finally {
        button.disabled = false;
    }
});

function closeEditCourse() {
    editCourseModal.classList.remove("open");
    document.querySelector("#edit-course-error").textContent = "";
}
document.querySelector("#edit-course-button").addEventListener("click", () => {
    if (!loadedCourse) return;
    document.querySelector("#edit-course-name").value = loadedCourse.courseName;
    document.querySelector("#edit-course-code").value = loadedCourse.courseCode;
    document.querySelector("#edit-course-semester").value = loadedCourse.semester || "";
    editCourseModal.classList.add("open");
});
document.querySelector("#close-edit-course-modal").addEventListener("click", closeEditCourse);
document.querySelector("#cancel-edit-course").addEventListener("click", closeEditCourse);
document.querySelector("#edit-course-form").addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type='submit']");
    button.disabled = true;
    try {
        await StudyAI.api.patch(`/api/courses/${courseId}`, {
            courseName: document.querySelector("#edit-course-name").value,
            courseCode: document.querySelector("#edit-course-code").value,
            semester: document.querySelector("#edit-course-semester").value
        });
        closeEditCourse();
        await loadCourse();
        StudyAI.ui.notify("Course details updated.", { type: "success" });
    } catch (error) {
        document.querySelector("#edit-course-error").textContent = error.message;
    } finally {
        button.disabled = false;
    }
});

document.querySelector("#delete-course-button").addEventListener("click", () => {
    if (loadedCourse) deleteModal.classList.add("open");
});
function closeDeleteModal() {
    deleteModal.classList.remove("open");
    document.querySelector("#delete-course-error").textContent = "";
}
document.querySelector("#close-delete-course-modal").addEventListener("click", closeDeleteModal);
document.querySelector("#cancel-delete-course").addEventListener("click", closeDeleteModal);
document.querySelector("#confirm-delete-course").addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Deleting…";
    try {
        const result = await StudyAI.api.delete(`/api/courses/${courseId}`);
        document.querySelector(`.sidebar-course-link[href$="courseId=${courseId}"]`)?.remove();
        StudyAI.courseContext.setNotice(result?.cleanup?.pending
            ? "Course deleted. Stored-file cleanup is queued and will be retried."
            : "Course deleted successfully.");
        window.location.replace("index.html#courses");
    } catch (error) {
        document.querySelector("#delete-course-error").textContent = error.message;
        button.disabled = false;
        button.textContent = "Yes, Delete Course";
    }
});

loadCourse();
