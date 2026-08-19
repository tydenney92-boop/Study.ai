const progressSelect = document.querySelector("#course-select");
const requestedCourseId = StudyAI.courseContext.getCourseId();

function formatDate(value) { return new Date(`${value.replace(" ", "T")}Z`).toLocaleString(); }
function row(title, detail, score) {
    const element = document.createElement("div"); element.className = "progress-row";
    element.innerHTML = "<div><strong></strong><small></small></div><span class='progress-score'></span>";
    element.querySelector("strong").textContent = title; element.querySelector("small").textContent = detail;
    element.querySelector(".progress-score").textContent = score; return element;
}
function render(data) {
    document.querySelector("#total-attempts").textContent = data.totalAttempts;
    document.querySelector("#average-score").textContent = data.averageScore === null ? "—" : `${data.averageScore}%`;
    document.querySelector("#latest-score").textContent = data.recentScores.length ? `${data.recentScores[0].score}%` : "—";
    document.querySelector("#progress-empty").hidden = data.totalAttempts !== 0;
    document.querySelector("#progress-content").hidden = data.totalAttempts === 0;
    const trend = document.querySelector("#score-trend"); trend.innerHTML = "";
    data.scoreTrend.forEach(point => { const item = document.createElement("div"); item.className = "trend-point"; item.innerHTML = "<span></span><div class='trend-bar'></div>"; item.querySelector("span").textContent = `${point.score}%`; item.querySelector(".trend-bar").style.height = `${point.score}%`; trend.appendChild(item); });
    const courses = document.querySelector("#course-progress-list"); courses.innerHTML = "";
    data.courses.filter(course => course.attemptCount > 0).forEach(course => courses.appendChild(row(`${course.courseCode} · ${course.courseName}`, `${course.attemptCount} attempt${course.attemptCount === 1 ? "" : "s"}`, `${course.averageScore}%`)));
    const activity = document.querySelector("#recent-activity"); activity.innerHTML = "";
    data.recentActivity.forEach(item => activity.appendChild(row(`${item.courseCode} · Quiz #${item.quizId}`, `${formatDate(item.createdAt)} · ${item.questionCount || "—"} questions`, `${item.score}%`)));
}
async function loadProgress() {
    const selected = Number(progressSelect.value);
    const path = selected ? `/api/courses/${selected}/progress` : "/api/progress";
    try { render(await StudyAI.api.get(path)); }
    catch (error) { if (error.status === 404) return StudyAI.courseContext.goToMyCourses("That course is unavailable."); document.querySelector("#progress-error").textContent = error.message; }
}
async function initializeProgress() {
    try {
        const courses = await StudyAI.api.get("/api/courses");
        courses.forEach(course => { const option = document.createElement("option"); option.value = course.id; option.textContent = `${course.courseCode} · ${course.courseName}`; progressSelect.appendChild(option); });
        if (requestedCourseId) progressSelect.value = String(requestedCourseId);
        if (requestedCourseId && progressSelect.value !== String(requestedCourseId)) return StudyAI.courseContext.goToMyCourses("That course is unavailable.");
        await loadProgress();
    } catch (error) { document.querySelector("#progress-error").textContent = error.message; }
}
progressSelect.addEventListener("change", () => { const value = Number(progressSelect.value); window.history.replaceState(null, "", value ? `progress.html?courseId=${value}` : "progress.html"); loadProgress(); });
initializeProgress();
