const recommendationCourseId = StudyAI.courseContext.getCourseId();
StudyAI.analytics.track("recommendations_opened", { courseId: recommendationCourseId });
let examPlanData = null;

if (!recommendationCourseId) StudyAI.courseContext.goToMyCourses("Choose a course before viewing study recommendations.");

function checkbox(name, value, label, checked) {
    const item = document.createElement("label"); item.className = "exam-option";
    item.innerHTML = '<input type="checkbox"><span></span>';
    const input = item.querySelector("input"); input.name = name; input.value = value; input.checked = checked;
    item.querySelector("span").textContent = label;
    return item;
}

function renderExamPlan(plan) {
    examPlanData = plan;
    document.querySelector("#exam-name").value = plan.examName;
    document.querySelector("#exam-date").value = plan.examDate;
    const units = document.querySelector("#exam-unit-options"); units.innerHTML = "";
    plan.units.forEach(unit => units.appendChild(checkbox("unitIds", unit.id, `Unit ${unit.unitNumber} — ${unit.name}`, plan.unitIds.includes(unit.id))));
    const materials = document.querySelector("#exam-material-options"); materials.innerHTML = "";
    plan.materials.forEach(material => materials.appendChild(checkbox("materialIds", material.id, material.displayName, plan.materialIds.includes(material.id))));
    const sources = document.querySelector("#exam-source-options"); sources.innerHTML = "";
    const usable = plan.materials.filter(material => material.extractionStatus === "extracted");
    usable.forEach(material => {
        const row = document.createElement("div"); row.className = "exam-source-option";
        row.appendChild(checkbox("sourceMaterialIds", material.id, material.displayName, plan.sourceMaterialIds.includes(material.id)));
        const select = document.createElement("select"); select.dataset.materialId = material.id; select.setAttribute("aria-label", `Role for ${material.displayName}`);
        [["general", "General material"], ["syllabus", "Syllabus"], ["exam_review", "Exam review"], ["study_guide", "Study guide"]].forEach(([value, label]) => {
            const option = document.createElement("option"); option.value = value; option.textContent = label; select.appendChild(option);
        });
        select.value = material.materialRole || "general";
        row.appendChild(select); sources.appendChild(row);
    });
    if (!usable.length) sources.innerHTML = '<div class="friendly-empty">No AI-ready materials yet. Upload a readable syllabus or review sheet first.</div>';
    const configured = plan.examName || plan.examDate || plan.unitIds.length || plan.materialIds.length || plan.sourceMaterialIds.length;
    document.querySelector("#exam-plan-summary").textContent = configured
        ? `${plan.examName || "Current exam"}${plan.examDate ? ` · ${new Date(`${plan.examDate}T00:00:00`).toLocaleDateString()}` : ""} · ${plan.sourceMaterialIds.length} selected source${plan.sourceMaterialIds.length === 1 ? "" : "s"}`
        : "No exam plan selected. Recommendations currently use study performance only.";
    document.querySelector("#toggle-exam-plan").textContent = configured ? "Edit Exam Plan" : "Set Up Exam";
}

function recommendationCard(item) {
    const element = document.createElement("article"); element.className = "recommendation-card";
    element.innerHTML = '<div class="recommendation-card-heading"><h3></h3><span class="evidence-level"></span></div><p class="recommendation-reason"></p><div class="recommendation-signals"></div><div class="recommendation-evidence"></div><div class="recommendation-actions"></div>';
    element.querySelector("h3").textContent = item.topic;
    const confidence = element.querySelector(".evidence-level"); confidence.textContent = `${item.confidence} evidence`; confidence.classList.add(`evidence-${item.confidence}`);
    element.querySelector(".recommendation-reason").textContent = item.reason;
    const signals = element.querySelector(".recommendation-signals");
    if (item.examRelevance.listed) {
        const listed = document.createElement("span"); listed.className = "exam-listed"; listed.textContent = "Likely tested / explicitly listed"; signals.appendChild(listed);
    } else if (item.examRelevance.selectedScope) {
        const scoped = document.createElement("span"); scoped.textContent = "Selected exam scope"; signals.appendChild(scoped);
    }
    item.examRelevance.statements.slice(0, 2).forEach(statement => { const quote = document.createElement("p"); quote.className = "exam-statement"; quote.textContent = `“${statement}”`; signals.appendChild(quote); });
    item.evidence.forEach(label => { const chip = document.createElement("span"); chip.textContent = label; element.querySelector(".recommendation-evidence").appendChild(chip); });
    item.actions.forEach((action, index) => { const link = document.createElement("a"); link.className = index === 0 ? "primary-button compact-action" : "secondary-tool-button compact-action"; link.textContent = action.label; link.href = action.href; element.querySelector(".recommendation-actions").appendChild(link); });
    return element;
}

function renderSection(selector, items) {
    const list = document.querySelector(selector); list.innerHTML = "";
    if (!items.length) { list.innerHTML = '<div class="friendly-empty">No evidence-backed items in this group yet.</div>'; return; }
    items.forEach(item => list.appendChild(recommendationCard(item)));
}

function openExamPlan() {
    document.querySelector("#exam-plan-form").hidden = false;
    document.querySelector("#toggle-exam-plan").setAttribute("aria-expanded", "true");
    document.querySelector("#exam-name").focus();
}
function closeExamPlan() {
    document.querySelector("#exam-plan-form").hidden = true;
    document.querySelector("#toggle-exam-plan").setAttribute("aria-expanded", "false");
    document.querySelector("#toggle-exam-plan").focus();
}

function configureEmptyState(data) {
    const empty = document.querySelector("#recommendations-empty");
    const copy = document.querySelector("#recommendations-empty-copy");
    const primary = document.querySelector("#recommendations-empty-primary");
    const secondary = document.querySelector("#recommendations-empty-secondary");
    if (data.isNewCourse) {
        copy.textContent = "Upload readable notes or an exam-planning source to begin.";
        primary.textContent = "Upload Materials"; primary.href = `materials.html?courseId=${recommendationCourseId}&upload=1`;
    } else if (!data.hasExamPlan && data.evidenceSummary.quizAttempts === 0 && data.evidenceSummary.flashcardReviews === 0) {
        copy.textContent = "Choose an exam source or complete a practice quiz to build evidence-backed priorities.";
        primary.textContent = "Set Up Exam"; primary.href = "#exam-plan-form";
        primary.onclick = event => { event.preventDefault(); openExamPlan(); };
    } else {
        copy.textContent = "There is not enough weakness evidence yet. Take a practice quiz or review flashcards.";
        primary.textContent = "Take Practice Quiz"; primary.href = `quiz.html?courseId=${recommendationCourseId}`;
    }
    secondary.textContent = "Review Flashcards"; secondary.href = `flashcards.html?courseId=${recommendationCourseId}`;
    empty.hidden = false;
}

function renderRecommendations(data) {
    document.querySelector("#recommendation-attempts").textContent = data.evidenceSummary.quizAttempts;
    document.querySelector("#recommendation-reviews").textContent = data.evidenceSummary.flashcardReviews;
    document.querySelector("#recommendation-exam-sources").textContent = data.evidenceSummary.examRelatedMaterials;
    const note = document.querySelector("#recommendations-note"); note.hidden = false;
    note.textContent = data.hasExamSpecificEvidence
        ? `${data.evidenceSummary.explicitExamStatements} explicit exam-scope statement${data.evidenceSummary.explicitExamStatements === 1 ? "" : "s"} found in your selected sources. Only those statements are labeled likely tested.`
        : data.evidenceSummary.examRelatedMaterials
            ? "Selected sources do not contain a clear exam-scope statement. Study Signal will not guess what is tested."
            : "No exam source selected. Priorities use recorded quiz and flashcard evidence only.";
    const sections = data.sections;
    const total = sections.focusFirst.length + sections.reviewNext.length + sections.keepFresh.length;
    document.querySelector("#recommendations-empty").hidden = true;
    document.querySelector("#recommendations-content").hidden = total === 0;
    if (!total) return configureEmptyState(data);
    renderSection("#focus-first-list", sections.focusFirst);
    renderSection("#review-next-list", sections.reviewNext);
    renderSection("#keep-fresh-list", sections.keepFresh);
}

document.querySelector("#toggle-exam-plan").addEventListener("click", () => document.querySelector("#exam-plan-form").hidden ? openExamPlan() : closeExamPlan());
document.querySelector("#cancel-exam-plan").addEventListener("click", closeExamPlan);
document.addEventListener("click", event => {
    const link = event.target.closest(".recommendation-actions a, #recommendations-empty a");
    if (!link) return;
    const page = (link.getAttribute("href") || "").split("?")[0];
    const actionType = {
        "quiz.html": "quiz", "flashcards.html": "flashcards", "study-guide.html": "study_guide",
        "notes.html": "ask_notes", "planner.html": "planner", "today.html": "today", "material.html": "material"
    }[page] || "other";
    StudyAI.analytics.track("recommendation_action_clicked", { courseId: recommendationCourseId, actionType });
});
document.querySelector("#exam-plan-form").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = document.querySelector("#save-exam-plan"); button.disabled = true; button.textContent = "Saving…";
    document.querySelector("#exam-plan-error").textContent = "";
    const checked = name => [...form.querySelectorAll(`input[name='${name}']:checked`)].map(input => Number(input.value));
    try {
        const changedRoles = [...document.querySelectorAll("#exam-source-options select")].filter(select => {
            const material = examPlanData.materials.find(item => item.id === Number(select.dataset.materialId));
            return material && material.materialRole !== select.value;
        });
        await Promise.all(changedRoles.map(select => StudyAI.api.patch(`/api/courses/${recommendationCourseId}/materials/${select.dataset.materialId}`, { materialRole: select.value })));
        const plan = await StudyAI.api.put(`/api/courses/${recommendationCourseId}/exam-plan`, {
            examName: document.querySelector("#exam-name").value, examDate: document.querySelector("#exam-date").value,
            unitIds: checked("unitIds"), materialIds: checked("materialIds"), sourceMaterialIds: checked("sourceMaterialIds")
        });
        renderExamPlan(plan); closeExamPlan();
        renderRecommendations(await StudyAI.api.get(`/api/courses/${recommendationCourseId}/recommendations`));
        StudyAI.ui.notify("Exam plan saved.", { type: "success" });
    } catch (error) { document.querySelector("#exam-plan-error").textContent = error.message; }
    finally { button.disabled = false; button.textContent = "Save Exam Plan"; }
});

async function initializeRecommendations() {
    if (!recommendationCourseId) return;
    const back = document.querySelector("#recommendations-back"); back.href = `course.html?courseId=${recommendationCourseId}`;
    try {
        const [course, recommendations, plan, plannerTasks] = await Promise.all([
            StudyAI.api.get(`/api/courses/${recommendationCourseId}`),
            StudyAI.api.get(`/api/courses/${recommendationCourseId}/recommendations`),
            StudyAI.api.get(`/api/courses/${recommendationCourseId}/exam-plan`),
            StudyAI.api.get(`/api/courses/${recommendationCourseId}/tasks?status=incomplete`)
        ]);
        document.title = `What to Study · ${course.courseCode} | Study Signal`;
        document.querySelector("#recommendations-title").textContent = `What to Study for ${course.courseCode}`;
        back.textContent = `← Back to ${course.courseCode}`;
        renderExamPlan(plan); renderRecommendations(recommendations);
        const examTask = plannerTasks.find(item => ["exam", "quiz"].includes(item.type) && new Date(item.dueAt) >= new Date());
        if (examTask) {
            const context = document.querySelector("#planner-exam-context");
            const days = Math.max(0, Math.ceil((new Date(examTask.dueAt) - new Date()) / 86400000));
            context.textContent = `${examTask.title} — ${days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} away`}. The planner supplies the deadline; this exam plan remains the source of study scope.`;
            context.hidden = false;
            if (!plan.examName) document.querySelector("#exam-name").value = examTask.title;
            if (!plan.examDate) document.querySelector("#exam-date").value = examTask.dueAt.slice(0, 10);
        }
        document.querySelector("#recommendations-loading").hidden = true;
    } catch (error) {
        document.querySelector("#recommendations-loading").hidden = true;
        if (error.status === 404) return StudyAI.courseContext.goToMyCourses("That course is unavailable.");
        document.querySelector("#recommendations-error").textContent = error.message;
    }
}
initializeRecommendations();
