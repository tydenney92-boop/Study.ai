const historyCourseId = StudyAI.courseContext.getCourseId();
const guideList = document.querySelector("#guide-history");
const quizList = document.querySelector("#quiz-history");
const deleteModal = document.querySelector("#history-delete-modal");
let pendingDelete = null;

if (!historyCourseId) StudyAI.courseContext.goToMyCourses("Choose a course to view saved study content.");

function dateLabel(value) {
    return new Date(`${value.replace(" ", "T")}Z`).toLocaleString();
}
function sourcesLabel(sources) {
    return sources.map(source => source.materialName).join(", ") || "Source unavailable";
}
function empty(container, message) {
    container.innerHTML = `<div class="friendly-empty"><strong>${message}</strong><span>Generate new content from this course when you are ready.</span></div>`;
}
function historyItem(item, type) {
    const article = document.createElement("article");
    article.className = "history-item";
    const isQuiz = type === "quiz";
    const idKey = isQuiz ? "quizId" : "guideId";
    const target = StudyAI.courseContext.url(isQuiz ? "quiz.html" : "study-guide.html", { courseId: historyCourseId, [idKey]: item.id });
    article.innerHTML = `<div class="history-item-top"><div><p class="eyebrow"></p><h3></h3></div><span class="score-chip"></span></div><p class="history-meta"></p><p class="history-sources"></p><div class="history-actions"><a class="primary-button">${isQuiz ? "Open / Retake" : "Open Guide"}</a><button class="history-delete">Delete</button></div>`;
    article.querySelector(".eyebrow").textContent = isQuiz ? "SAVED QUIZ" : "SAVED GUIDE";
    article.querySelector("h3").textContent = isQuiz ? `Practice Quiz #${item.id}` : `Study Guide #${item.id}`;
    const chip = article.querySelector(".score-chip");
    chip.textContent = isQuiz ? `${item.attemptCount} attempt${item.attemptCount === 1 ? "" : "s"}` : "Saved";
    article.querySelector(".history-meta").textContent = `Created ${dateLabel(item.createdAt)}`;
    article.querySelector(".history-sources").textContent = `Sources: ${sourcesLabel(item.sources)}`;
    article.querySelector("a").href = target;
    article.querySelector("button").addEventListener("click", () => openDelete(type, item));
    return article;
}
function openDelete(type, item) {
    pendingDelete = { type, item };
    document.querySelector("#history-delete-title").textContent = `Delete this ${type === "quiz" ? "quiz" : "study guide"}?`;
    document.querySelector("#history-delete-warning").textContent = type === "quiz" && item.attemptCount
        ? `This also permanently deletes ${item.attemptCount} saved attempt${item.attemptCount === 1 ? "" : "s"}.`
        : "This saved content will be permanently removed.";
    deleteModal.classList.add("open");
}
function closeDelete() { pendingDelete = null; deleteModal.classList.remove("open"); document.querySelector("#history-delete-error").textContent = ""; }
document.querySelector("#history-delete-close").addEventListener("click", closeDelete);
document.querySelector("#history-delete-cancel").addEventListener("click", closeDelete);
document.querySelector("#history-delete-confirm").addEventListener("click", async event => {
    if (!pendingDelete) return;
    const button = event.currentTarget; button.disabled = true;
    const segment = pendingDelete.type === "quiz" ? "quizzes" : "study-guides";
    try { await StudyAI.api.delete(`/api/courses/${historyCourseId}/${segment}/${pendingDelete.item.id}`); closeDelete(); await loadHistory(); }
    catch (error) { document.querySelector("#history-delete-error").textContent = error.message; }
    finally { button.disabled = false; }
});
async function loadHistory() {
    try {
        const [course, guides, quizzes] = await Promise.all([
            StudyAI.api.get(`/api/courses/${historyCourseId}`),
            StudyAI.api.get(`/api/courses/${historyCourseId}/study-guides`),
            StudyAI.api.get(`/api/courses/${historyCourseId}/quizzes`)
        ]);
        document.querySelector("#history-title").textContent = `${course.courseCode} saved study`;
        document.querySelector("#history-back").href = StudyAI.courseContext.url("course.html", { courseId: historyCourseId });
        document.querySelector("#new-guide").href = StudyAI.courseContext.url("study-guide.html", { courseId: historyCourseId });
        document.querySelector("#new-quiz").href = StudyAI.courseContext.url("quiz.html", { courseId: historyCourseId });
        guideList.innerHTML = ""; quizList.innerHTML = "";
        guides.length ? guides.forEach(item => guideList.appendChild(historyItem(item, "guide"))) : empty(guideList, "No saved study guides yet");
        quizzes.length ? quizzes.forEach(item => quizList.appendChild(historyItem(item, "quiz"))) : empty(quizList, "No saved quizzes yet");
    } catch (error) {
        if (error.status === 404) return StudyAI.courseContext.goToMyCourses("That course is unavailable.");
        document.querySelector("#history-error").textContent = error.message;
    }
}
loadHistory();
