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
            <div class="course-card-stats">
                <span class="unit-total"></span>
                <span class="material-total"></span>
            </div>
        </div>
        <span class="course-arrow">→</span>
    `;
    link.querySelector(".course-code").textContent = course.courseCode;
    link.querySelector("h3").textContent = course.courseName;
    link.querySelector(".course-meta-line").textContent =
        course.semester || "Semester not specified";
    link.querySelector(".unit-total").textContent =
        `${course.unitCount} unit${course.unitCount === 1 ? "" : "s"}`;
    link.querySelector(".material-total").textContent =
        `${course.materialCount} material${course.materialCount === 1 ? "" : "s"}`;
    return link;
}

function createAddCourseCard() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "add-course-card";
    button.innerHTML = `<span class="add-course-icon">＋</span><strong>Add Course</strong><small>Create another course workspace</small>`;
    button.addEventListener("click", openCourseModal);
    return button;
}

async function loadDashboard() {
    try {
        const courses = await StudyAI.api.get("/api/courses/summary");
        courseList.innerHTML = "";

        courses.forEach((course, index) => {
            courseList.appendChild(createCourseCard(course, index));
        });
        courseList.appendChild(createAddCourseCard());

        document.querySelector("#course-count").textContent = courses.length;
        document.querySelector("#unit-count").textContent = courses.reduce((sum, course) => sum + course.unitCount, 0);
        document.querySelector("#material-count").textContent = courses.reduce((sum, course) => sum + course.materialCount, 0);
        document.querySelector("#ready-count").textContent =
            courses.reduce((sum, course) => sum + course.readyMaterialCount, 0);
    } catch (error) {
        courseList.innerHTML = `<div class="friendly-empty error-state"></div>`;
        courseList.querySelector("div").textContent = error.message;
    }
}

function openCourseModal() {
    courseModal.classList.add("open");
}

function closeCourseModal() {
    courseModal.classList.remove("open");
    courseForm.reset();
    courseFormError.textContent = "";
}

addCourseButton.addEventListener("click", openCourseModal);
if (new URLSearchParams(window.location.search).get("newCourse") === "1") {
    openCourseModal();
}
const dashboardNotice = sessionStorage.getItem("studyai:notice");
if (dashboardNotice) {
    sessionStorage.removeItem("studyai:notice");
    const notice = document.createElement("div");
    notice.className = "friendly-empty success-state";
    notice.textContent = dashboardNotice;
    courseList.parentElement.prepend(notice);
}
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
