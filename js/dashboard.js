const courseList = document.querySelector("#course-list");
const addCourseButton = document.querySelector("#add-course-button");
const courseModal = document.querySelector("#course-modal");
const courseForm = document.querySelector("#course-form");
const courseFormError = document.querySelector("#course-form-error");

function createCourseCard(course, index) {
    const link = document.createElement("a");
    link.className = "course-card";
    link.href = StudyAI.courseContext.url("course.html", {
        courseId: course.id
    });

    const colors = ["blue", "purple", "green", "orange"];
    const color = colors[index % colors.length];
    link.innerHTML = `
        <div class="course-color ${color}"></div>
        <div class="course-info">
            <span class="course-code"></span>
            <h3></h3>
            <div class="course-meta-line"></div>
        </div>
        <span class="course-arrow">→</span>
    `;
    link.querySelector(".course-code").textContent = course.courseCode;
    link.querySelector("h3").textContent = course.courseName;
    link.querySelector(".course-meta-line").textContent =
        course.semester || "Semester not specified";
    return link;
}

async function loadDashboard() {
    try {
        const courses = await StudyAI.api.get("/api/courses");
        courseList.innerHTML = "";

        if (courses.length === 0) {
            courseList.innerHTML = `
                <div class="friendly-empty">
                    <strong>Create your first course</strong>
                    <span>Add a course to begin organizing study materials.</span>
                </div>
            `;
        } else {
            courses.forEach((course, index) => {
                courseList.appendChild(createCourseCard(course, index));
            });
        }

        const summaries = await Promise.all(courses.map(async course => {
            const [units, materials] = await Promise.all([
                StudyAI.api.get(`/api/courses/${course.id}/units`),
                StudyAI.api.get(`/api/courses/${course.id}/materials`)
            ]);
            return { units, materials };
        }));
        const unitCount = summaries.reduce((sum, value) => sum + value.units.length, 0);
        const materials = summaries.flatMap(value => value.materials);

        document.querySelector("#course-count").textContent = courses.length;
        document.querySelector("#unit-count").textContent = unitCount;
        document.querySelector("#material-count").textContent = materials.length;
        document.querySelector("#ready-count").textContent =
            materials.filter(material => material.uploadStatus === "ready").length;
    } catch (error) {
        courseList.innerHTML = `<div class="friendly-empty error-state"></div>`;
        courseList.querySelector("div").textContent = error.message;
    }
}

function openCourseModal() {
    courseModal.classList.add("open");
    document.querySelector("#course-name").focus();
}

function closeCourseModal() {
    courseModal.classList.remove("open");
    courseForm.reset();
    courseFormError.textContent = "";
}

addCourseButton.addEventListener("click", openCourseModal);
document.querySelector("#close-course-modal").addEventListener("click", closeCourseModal);
document.querySelector("#cancel-course").addEventListener("click", closeCourseModal);
courseModal.addEventListener("click", event => {
    if (event.target === courseModal) closeCourseModal();
});

courseForm.addEventListener("submit", async event => {
    event.preventDefault();
    const submitButton = courseForm.querySelector("button[type='submit']");
    submitButton.disabled = true;
    courseFormError.textContent = "";

    try {
        const course = await StudyAI.api.post("/api/courses", {
            courseName: document.querySelector("#course-name").value,
            courseCode: document.querySelector("#course-code").value,
            semester: document.querySelector("#course-semester").value
        });
        window.location.href = StudyAI.courseContext.url("course.html", {
            courseId: course.id
        });
    } catch (error) {
        courseFormError.textContent = error.message;
        submitButton.disabled = false;
    }
});

loadDashboard();
