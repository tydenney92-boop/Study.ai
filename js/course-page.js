const courseId = StudyAI.courseContext.getCourseId();
const unitsList = document.querySelector("#course-units-list");
const unitModal = document.querySelector("#unit-modal");
const unitForm = document.querySelector("#unit-form");
const unitFormError = document.querySelector("#unit-form-error");

function courseUrl(page, values = {}) {
    return StudyAI.courseContext.url(page, { courseId, ...values });
}

function renderUnit(unit, materialCount) {
    const link = document.createElement("a");
    link.className = "course-card";
    link.href = courseUrl("materials.html", { unitId: unit.id });
    link.innerHTML = `
        <div class="course-color blue"></div>
        <div class="course-info">
            <span class="course-code"></span>
            <h3></h3>
            <div class="course-meta-line"></div>
        </div>
        <span class="course-arrow">→</span>
    `;
    link.querySelector(".course-code").textContent =
        `UNIT ${String(unit.unitNumber).padStart(2, "0")}`;
    link.querySelector("h3").textContent = unit.name;
    link.querySelector(".course-meta-line").textContent =
        `${materialCount} material${materialCount === 1 ? "" : "s"}`;
    return link;
}

async function loadCourse() {
    if (!courseId) {
        unitsList.innerHTML = `
            <div class="friendly-empty">
                <strong>No course selected</strong>
                <a class="text-link" href="index.html#courses">Choose a course →</a>
            </div>
        `;
        return;
    }

    try {
        const [course, units, materials] = await Promise.all([
            StudyAI.api.get(`/api/courses/${courseId}`),
            StudyAI.api.get(`/api/courses/${courseId}/units`),
            StudyAI.api.get(`/api/courses/${courseId}/materials`)
        ]);

        document.title = `${course.courseCode} | Study AI`;
        document.querySelector("#course-code-title").textContent = course.courseCode;
        document.querySelector("#course-name-subtitle").textContent = course.courseName;
        document.querySelector("#course-semester").textContent = course.semester;
        document.querySelector("#course-unit-count").textContent = units.length;
        document.querySelector("#course-material-count").textContent = materials.length;
        document.querySelector("#course-pdf-count").textContent =
            materials.filter(material => material.materialType === "pdf").length;
        document.querySelector("#course-other-count").textContent =
            materials.filter(material => material.materialType !== "pdf").length;

        document.querySelectorAll("[data-course-page]").forEach(link => {
            link.href = courseUrl(link.dataset.coursePage);
        });

        unitsList.innerHTML = "";
        if (units.length === 0) {
            unitsList.innerHTML = `
                <div class="friendly-empty">
                    <strong>No units yet</strong>
                    <span>Create a unit to organize this course.</span>
                </div>
            `;
        } else {
            units.forEach(unit => {
                const count = materials.filter(material => material.unitId === unit.id).length;
                unitsList.appendChild(renderUnit(unit, count));
            });
        }
    } catch (error) {
        unitsList.innerHTML = `<div class="friendly-empty error-state"></div>`;
        unitsList.querySelector("div").textContent = error.message;
    }
}

function closeUnitModal() {
    unitModal.classList.remove("open");
    unitForm.reset();
    unitFormError.textContent = "";
}

document.querySelector("#add-unit-button").addEventListener("click", () => {
    if (!courseId) return;
    unitModal.classList.add("open");
    document.querySelector("#unit-name").focus();
});
document.querySelector("#close-unit-modal").addEventListener("click", closeUnitModal);
document.querySelector("#cancel-unit").addEventListener("click", closeUnitModal);

unitForm.addEventListener("submit", async event => {
    event.preventDefault();
    const submitButton = unitForm.querySelector("button[type='submit']");
    submitButton.disabled = true;
    unitFormError.textContent = "";

    try {
        await StudyAI.api.post(`/api/courses/${courseId}/units`, {
            name: document.querySelector("#unit-name").value,
            unitNumber: Number(document.querySelector("#unit-number").value)
        });
        closeUnitModal();
        await loadCourse();
    } catch (error) {
        unitFormError.textContent = error.message;
    } finally {
        submitButton.disabled = false;
    }
});

loadCourse();
