const recommendationContext = StudyAI.courseContext;
const recommendationCourseId = recommendationContext.getCourseId();

if (!recommendationCourseId) {
    recommendationContext.goToMyCourses("Choose a course before viewing study recommendations.");
}

function recommendationCard(item) {
    const element = document.createElement("article");
    element.className = "recommendation-card";
    element.innerHTML = `
        <div class="recommendation-card-heading"><h3></h3><span class="evidence-level"></span></div>
        <p class="recommendation-reason"></p>
        <div class="recommendation-evidence"></div>
        <a class="secondary-tool-button compact-action"></a>
    `;
    element.querySelector("h3").textContent = item.topic;
    const confidence = element.querySelector(".evidence-level");
    confidence.textContent = `${item.confidence} evidence`;
    confidence.classList.add(`evidence-${item.confidence}`);
    element.querySelector(".recommendation-reason").textContent = item.reason;
    const evidence = element.querySelector(".recommendation-evidence");
    item.evidence.forEach(label => {
        const chip = document.createElement("span");
        chip.textContent = label;
        evidence.appendChild(chip);
    });
    const action = element.querySelector("a");
    action.textContent = item.action.label;
    action.href = item.action.href;
    return element;
}

function renderSection(id, items) {
    const list = document.querySelector(id);
    list.innerHTML = "";
    if (items.length === 0) {
        list.innerHTML = '<div class="friendly-empty"><span>No evidence-backed items in this group yet.</span></div>';
        return;
    }
    items.forEach(item => list.appendChild(recommendationCard(item)));
}

function configureEmptyState(data) {
    const empty = document.querySelector("#recommendations-empty");
    const copy = document.querySelector("#recommendations-empty-copy");
    const primary = document.querySelector("#recommendations-empty-primary");
    const secondary = document.querySelector("#recommendations-empty-secondary");
    if (data.isNewCourse) {
        copy.textContent = "Upload readable notes first, then take a quiz or review flashcards to build personalized priorities.";
        primary.textContent = "Add Materials";
        primary.href = recommendationContext.url("materials.html", {
            courseId: recommendationCourseId,
            upload: 1
        });
    } else {
        copy.textContent = "You have course material, but not enough performance history yet. A practice quiz is the fastest way to begin.";
        primary.textContent = "Take a Practice Quiz";
        primary.href = recommendationContext.url("quiz.html", { courseId: recommendationCourseId });
    }
    secondary.textContent = "Review Flashcards";
    secondary.href = recommendationContext.url("flashcards.html", { courseId: recommendationCourseId });
    empty.hidden = false;
}

function renderRecommendations(data) {
    document.querySelector("#recommendation-attempts").textContent = data.evidenceSummary.quizAttempts;
    document.querySelector("#recommendation-reviews").textContent = data.evidenceSummary.flashcardReviews;
    document.querySelector("#recommendation-exam-sources").textContent = data.evidenceSummary.examRelatedMaterials;
    const note = document.querySelector("#recommendations-note");
    note.hidden = false;
    note.textContent = data.hasExamSpecificEvidence
        ? "At least one source explicitly mentions an exam, review, or tested material. Recommendations still do not claim anything beyond that source text."
        : "No source explicitly identifies exam coverage yet. Priorities are based on your study performance only.";

    const sections = data.sections;
    const total = sections.focusFirst.length + sections.reviewNext.length + sections.keepFresh.length;
    if (total === 0) return configureEmptyState(data);
    document.querySelector("#recommendations-content").hidden = false;
    renderSection("#focus-first-list", sections.focusFirst);
    renderSection("#review-next-list", sections.reviewNext);
    renderSection("#keep-fresh-list", sections.keepFresh);
}

async function initializeRecommendations() {
    if (!recommendationCourseId) return;
    document.querySelector("#recommendations-back").href = recommendationContext.url(
        "course.html",
        { courseId: recommendationCourseId }
    );
    try {
        const [course, recommendations] = await Promise.all([
            StudyAI.api.get(`/api/courses/${recommendationCourseId}`),
            StudyAI.api.get(`/api/courses/${recommendationCourseId}/recommendations`)
        ]);
        document.title = `What to Study · ${course.courseCode} | Study Signal`;
        document.querySelector("#recommendations-title").textContent = `What to Study for ${course.courseCode}`;
        document.querySelector("#recommendations-back").textContent = `← Back to ${course.courseCode}`;
        document.querySelector("#recommendations-loading").hidden = true;
        renderRecommendations(recommendations);
    } catch (error) {
        document.querySelector("#recommendations-loading").hidden = true;
        if (error.status === 404) {
            recommendationContext.goToMyCourses("That course is unavailable.");
            return;
        }
        document.querySelector("#recommendations-error").textContent = error.message;
    }
}

initializeRecommendations();
