const progressCourseId = StudyAI.courseContext.getCourseId();
StudyAI.analytics.track("progress_opened", { courseId: progressCourseId });

function dateLabel(value) {
    if (!value) return "No activity yet";
    const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
    return new Date(normalized).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function metric(label, value, detail = "", id = "") {
    const card = document.createElement("div");
    card.className = "progress-stat-card";
    card.innerHTML = "<span></span><strong></strong><small></small>";
    card.querySelector("span").textContent = label;
    const valueElement = card.querySelector("strong");
    valueElement.textContent = value;
    if (id) valueElement.id = id;
    card.querySelector("small").textContent = detail;
    return card;
}

function trendLabel(trend) {
    return { improving: "Improving", declining: "Needs attention", steady: "Steady", insufficient_data: "Not enough data" }[trend.direction];
}

function countLabel(count, singular, plural = `${singular}s`) {
    return `${count} ${count === 1 ? singular : plural}`;
}

function renderOverview(data) {
    const section = document.querySelector("#progress-overview");
    section.hidden = false;
    const grid = document.querySelector("#progress-course-grid");
    grid.innerHTML = "";
    document.querySelector("#progress-overview-empty").hidden = data.courses.length !== 0;
    data.courses.forEach(course => {
        const card = document.createElement("a");
        card.className = "dashboard-panel progress-course-card";
        card.href = `progress.html?courseId=${course.courseId}`;
        card.innerHTML = `
            <div class="course-color"></div><div class="progress-course-heading"><div><span class="eyebrow"></span><h2></h2><p></p></div><span class="progress-course-arrow">→</span></div>
            <div class="progress-course-metrics"></div><div class="progress-course-footer"></div>`;
        card.querySelector(".eyebrow").textContent = course.courseCode;
        card.querySelector("h2").textContent = course.courseName;
        card.querySelector(".progress-course-heading p").textContent = course.semester || "No semester";
        const values = [
            ["Quiz average", course.averageScore === null ? "—" : `${course.averageScore}%`],
            ["Latest", course.latestScore === null ? "—" : `${course.latestScore}%`],
            ["Attempts", course.attemptCount],
            ["Weak cards", course.lowMasteryFlashcards]
        ];
        values.forEach(([label, value]) => {
            const item = document.createElement("div"); item.innerHTML = "<strong></strong><span></span>";
            item.querySelector("strong").textContent = value; item.querySelector("span").textContent = label;
            card.querySelector(".progress-course-metrics").appendChild(item);
        });
        card.querySelector(".progress-course-footer").textContent =
            `${course.studiedMaterialCount} of ${course.materialCount} materials studied · ${trendLabel(course.trend)} · ${dateLabel(course.recentActivityAt)}`;
        window.StudySignalCourseColors?.applyCourseColor?.(card, course);
        grid.appendChild(card);
    });
}

function renderTrend(points) {
    const trend = document.querySelector("#score-trend");
    trend.innerHTML = "";
    document.querySelector("#trend-empty").hidden = points.length >= 2;
    trend.hidden = points.length < 2;
    points.forEach(point => {
        const bar = document.createElement("div"); bar.className = "trend-point";
        bar.innerHTML = "<span></span><div></div>";
        bar.querySelector("span").textContent = `${point.score}%`;
        bar.querySelector("div").style.height = `${Math.max(4, point.score)}%`;
        trend.appendChild(bar);
    });
}

function linkRow(title, detail, value, href) {
    const row = document.createElement(href ? "a" : "div");
    row.className = "progress-row";
    if (href) row.href = href;
    row.innerHTML = "<div><strong></strong><small></small></div><span></span>";
    row.querySelector("strong").textContent = title;
    row.querySelector("small").textContent = detail;
    row.querySelector(":scope > span").textContent = value;
    return row;
}

function materialRow(material) {
    const row = document.createElement("div"); row.className = `material-progress-row coverage-${material.coverage}`;
    const labels = {
        not_studied: "Not studied yet", activity_recorded: "Activity recorded",
        needs_review: "Needs review", performing_well: "Performing well"
    };
    row.innerHTML = `<div class="material-progress-main"><a></a><span class="coverage-badge"></span><small></small></div><div class="material-progress-actions"><a>Open</a><a>Practice</a></div>`;
    row.querySelector(".material-progress-main > a").href = material.actions.material;
    row.querySelector(".material-progress-main > a").textContent = material.name;
    row.querySelector(".coverage-badge").textContent = labels[material.coverage];
    const uses = [];
    if (material.usage.quizzes) uses.push(countLabel(material.quiz.attempts, "quiz attempt"));
    if (material.usage.flashcards) uses.push(countLabel(material.flashcards.reviewCount, "card review"));
    if (material.usage.studyGuides) uses.push("study guide");
    if (material.usage.askMyNotes) uses.push("Ask My Notes");
    if (material.usage.examSource) uses.push("exam source");
    row.querySelector("small").textContent = uses.length ? uses.join(" · ") : "No recorded study-tool use";
    const actions = row.querySelectorAll(".material-progress-actions a");
    actions[0].href = material.actions.material; actions[1].href = material.actions.quiz;
    return row;
}

function renderUnits(data) {
    const list = document.querySelector("#unit-progress-list");
    const select = document.querySelector("#progress-unit-filter");
    select.innerHTML = '<option value="all">All units</option>';
    const groups = [...data.units];
    if (data.unassignedMaterials.length) groups.push({ id: "none", name: "No Unit", unitNumber: "—", materials: data.unassignedMaterials, quizAttempts: 0, quizAverage: null, reviewedFlashcards: 0, lowMasteryFlashcards: 0 });
    groups.forEach(unit => {
        const option = document.createElement("option"); option.value = unit.id; option.textContent = unit.name; select.appendChild(option);
        const details = document.createElement("details"); details.className = "unit-progress"; details.dataset.unitId = unit.id;
        details.innerHTML = `<summary><div><span class="eyebrow"></span><strong></strong><small></small></div><span>Expand</span></summary><div class="unit-material-progress"></div>`;
        details.querySelector(".eyebrow").textContent = unit.id === "none" ? "UNASSIGNED" : `UNIT ${unit.unitNumber}`;
        details.querySelector("strong").textContent = unit.name;
        const facts = [];
        if (unit.quizAttempts) facts.push(`${countLabel(unit.quizAttempts, "quiz attempt")} · ${unit.quizAverage}% average`);
        if (unit.reviewedFlashcards) facts.push(countLabel(unit.reviewedFlashcards, "card reviewed", "cards reviewed"));
        if (unit.lowMasteryFlashcards) facts.push(`${unit.lowMasteryFlashcards} low mastery`);
        details.querySelector("small").textContent = facts.length ? facts.join(" · ") : "No recorded activity yet";
        const body = details.querySelector(".unit-material-progress");
        if (!unit.materials.length) body.innerHTML = '<div class="friendly-empty">No materials in this unit.</div>';
        unit.materials.forEach(material => body.appendChild(materialRow(material)));
        list.appendChild(details);
    });
    select.addEventListener("change", () => {
        list.querySelectorAll(".unit-progress").forEach(group => {
            group.hidden = select.value !== "all" && group.dataset.unitId !== select.value;
        });
    });
}

function renderCourse(data) {
    document.querySelector("#course-progress").hidden = false;
    document.querySelector("#progress-back").hidden = false;
    document.querySelector("#progress-title").textContent = `${data.course.courseCode} Progress`;
    document.querySelector("#progress-subtitle").textContent = "See where your recorded practice is strong, weak, or still missing.";
    const recommendations = document.querySelector("#progress-recommendations-link");
    recommendations.hidden = false; recommendations.href = `recommendations.html?courseId=${progressCourseId}`;
    const summary = document.querySelector("#course-progress-summary");
    [
        ["Quiz average", data.summary.averageScore === null ? "—" : `${data.summary.averageScore}%`, countLabel(data.summary.attemptCount, "attempt"), "average-score"],
        ["Latest score", data.summary.latestScore === null ? "—" : `${data.summary.latestScore}%`, trendLabel(data.summary.trend), "latest-score"],
        ["Attempts", data.summary.attemptCount, "Saved quiz attempts", "total-attempts"],
        ["Cards reviewed", data.summary.flashcardsReviewed, countLabel(data.summary.flashcardReviewCount, "review action"), "flashcards-reviewed"],
        ["Low mastery", data.summary.lowMasteryFlashcards, "Reviewed cards at mastery 0–2", "low-mastery-count"],
        ["Materials studied", `${data.summary.studiedMaterialCount}/${data.summary.materialCount}`, "Used in a study tool", "materials-studied"]
    ].forEach(value => summary.appendChild(metric(...value)));
    const hasActivity = data.summary.attemptCount + data.summary.flashcardReviewCount > 0;
    document.querySelector("#course-progress-empty").hidden = hasActivity || data.summary.materialCount > 0;
    document.querySelector("#course-progress-content").hidden = !hasActivity && data.summary.materialCount === 0;
    document.querySelector("#empty-quiz-action").href = `quiz.html?courseId=${progressCourseId}`;
    document.querySelector("#empty-material-action").href = `materials.html?courseId=${progressCourseId}&upload=1`;
    const insights = document.querySelector("#progress-insights");
    if (data.insights.length) { insights.hidden = false; data.insights.forEach(text => { const p = document.createElement("p"); p.textContent = text; insights.appendChild(p); }); }
    renderTrend(data.scoreTrend);
    const mastery = document.querySelector("#mastery-distribution");
    [["Unseen", data.flashcards.unseen], ["Low", data.flashcards.lowMastery], ["Developing", data.flashcards.developing], ["Strong", data.flashcards.strong]].forEach(([label, value]) => mastery.appendChild(metric(label, value)));
    const weak = document.querySelector("#weak-materials");
    if (!data.weakMaterials.length) weak.innerHTML = '<div class="friendly-empty">No material has enough recorded weakness evidence yet.</div>';
    data.weakMaterials.forEach(material => weak.appendChild(linkRow(material.name, `${countLabel(material.quiz.attempts, "attributed quiz attempt")} · ${countLabel(material.flashcards.lowMastery, "low-mastery card")}`, material.quiz.averageScore === null ? "Review" : `${material.quiz.averageScore}%`, material.actions.material)));
    document.querySelector("#progress-attribution-note").textContent = data.attributionNote;
    renderUnits(data);
    const quizzes = document.querySelector("#recent-quiz-attempts");
    if (!data.recentQuizAttempts.length) quizzes.innerHTML = '<div class="friendly-empty">No saved quiz attempts yet.</div>';
    data.recentQuizAttempts.forEach(item => quizzes.appendChild(linkRow(`Quiz #${item.quizId}`, `${dateLabel(item.createdAt)} · ${item.correct}/${item.total} correct`, `${item.score}%`, item.href)));
    const activity = document.querySelector("#recent-study-activity");
    if (!data.recentStudyActivity.length) activity.innerHTML = '<div class="friendly-empty">No recent study activity yet.</div>';
    data.recentStudyActivity.forEach(item => activity.appendChild(linkRow(item.label, dateLabel(item.createdAt), "→", item.href)));
}

async function initializeProgress() {
    try {
        const data = await StudyAI.api.get(progressCourseId ? `/api/courses/${progressCourseId}/progress` : "/api/progress");
        document.querySelector("#progress-loading").hidden = true;
        if (progressCourseId) renderCourse(data); else renderOverview(data);
    } catch (error) {
        document.querySelector("#progress-loading").hidden = true;
        if (error.status === 404) return StudyAI.courseContext.goToMyCourses("That course is unavailable.");
        document.querySelector("#progress-error").textContent = error.message;
    }
}
initializeProgress();
