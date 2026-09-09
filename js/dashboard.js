const courseList = document.querySelector("#course-list");
const addCourseButton = document.querySelector("#add-course-button");
const courseModal = document.querySelector("#course-modal");
const courseForm = document.querySelector("#course-form");
const courseFormError = document.querySelector("#course-form-error");

function createCourseCard(course) {
    const link = document.createElement("a");
    link.className = "course-card";
    link.href = StudyAI.courseContext.url("course.html", {
        courseId: course.id
    });

    link.innerHTML = `
        <div class="course-color"></div>
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
    window.StudySignalCourseColors.applyCourseColor(link, course);
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
        const [courses, plannerTasks] = await Promise.all([
            StudyAI.api.get("/api/courses/summary"),
            StudyAI.api.get("/api/tasks?status=incomplete")
        ]);
        courseList.innerHTML = "";

        courses.forEach(course => {
            courseList.appendChild(createCourseCard(course));
        });
        courseList.appendChild(createAddCourseCard());

        document.querySelector("#course-count").textContent = courses.length;
        document.querySelector("#unit-count").textContent = courses.reduce((sum, course) => sum + course.unitCount, 0);
        document.querySelector("#material-count").textContent = courses.reduce((sum, course) => sum + course.materialCount, 0);
        document.querySelector("#ready-count").textContent =
            courses.reduce((sum, course) => sum + course.readyMaterialCount, 0);
        renderDashboardUpcoming(plannerTasks);
    } catch (error) {
        courseList.innerHTML = `<div class="friendly-empty error-state"></div>`;
        courseList.querySelector("div").textContent = error.message;
    }
}

function renderDashboardUpcoming(items) {
    const list = document.querySelector("#dashboard-upcoming");
    list.innerHTML = "";
    const now = new Date();
    const nextExam = items.find(item => ["exam", "quiz"].includes(item.type) && new Date(item.dueAt) >= now);
    const selected = [...items.filter(item => new Date(item.dueAt) < now), ...items]
        .filter((item, index, all) => all.findIndex(other => other.id === item.id) === index)
        .slice(0, 5);
    if (nextExam && !selected.some(item => item.id === nextExam.id)) selected.push(nextExam);
    if (!selected.length) {
        list.innerHTML = '<div class="friendly-empty"><span>No upcoming deadlines.</span><a class="text-link" href="planner.html?new=1&type=assignment">Add Assignment →</a></div>';
        return;
    }
    selected.forEach(task => {
        const row = document.createElement("div"); row.className = "compact-task-row";
        row.innerHTML = '<input type="checkbox" aria-label="Mark complete"><span class="compact-task-accent"></span><div><strong></strong><small></small></div><a class="text-link">Open</a>';
        window.StudySignalCourseColors.applyCourseColor(row, task);
        row.querySelector("strong").textContent = task.title;
        const due = new Date(task.dueAt);
        row.querySelector("small").textContent = `${task.courseCode} · ${task.type} · ${due.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
        row.querySelector("a").href = ["exam", "quiz"].includes(task.type)
            ? `recommendations.html?courseId=${task.courseId}` : `planner.html?courseId=${task.courseId}`;
        row.querySelector("input").addEventListener("change", async event => {
            row.classList.add("completed");
            try { await StudyAI.api.patch(`/api/courses/${task.courseId}/tasks/${task.id}`, { completed: true }); row.remove(); }
            catch (error) { event.target.checked = false; row.classList.remove("completed"); StudyAI.ui.notify(error.message, { type: "error" }); }
        });
        list.appendChild(row);
    });
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
