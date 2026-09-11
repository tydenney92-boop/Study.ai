const analyticsLabels = {
    signup: "Signup", course_created: "First course", syllabus_uploaded: "Syllabus uploaded",
    syllabus_import_completed: "Deadlines imported", study_activity_completed: "Study activity completed",
    today_opened: "Today opened", course: "Course", material: "Material",
    syllabusImport: "Syllabus import", plannerTask: "Planner task",
    quizCompleted: "Quiz completed", flashcardsReviewed: "Flashcards reviewed"
};

function analyticsRow(label, value, detail = "") {
    const row = document.createElement("div");
    row.className = "analytics-row";
    row.innerHTML = "<div><strong></strong><span></span></div><b></b>";
    row.querySelector("strong").textContent = label;
    row.querySelector("span").textContent = detail;
    row.querySelector("b").textContent = value;
    return row;
}

function metric(label, value) {
    const card = document.createElement("div");
    card.className = "analytics-metric";
    card.innerHTML = "<span></span><strong></strong>";
    card.querySelector("span").textContent = label;
    card.querySelector("strong").textContent = value;
    return card;
}

async function loadInternalAnalytics() {
    try {
        const data = await StudyAI.api.get("/api/internal/analytics");
        const metrics = document.querySelector("#analytics-metrics");
        metrics.append(
            metric("Active users · 30 days", data.users.activeLast30Days),
            metric("New users · 30 days", data.users.newLast30Days),
            metric("Total users", data.users.total),
            metric("Onboarding completion", `${data.onboardingCompletionRate}%`)
        );
        data.funnel.forEach(item => document.querySelector("#analytics-funnel").appendChild(
            analyticsRow(analyticsLabels[item.eventName] || item.eventName, item.users, "distinct users")
        ));
        Object.entries(data.adoption).forEach(([key, item]) => document.querySelector("#analytics-adoption").appendChild(
            analyticsRow(analyticsLabels[key] || key, `${item.percent}%`, `${item.users} users`)
        ));
        Object.entries(data.eventCounts).sort((left, right) => right[1] - left[1]).forEach(([name, count]) =>
            document.querySelector("#analytics-events").appendChild(analyticsRow(name.replaceAll("_", " "), count))
        );
        const feedback = data.feedback;
        document.querySelector("#feedback-summary").textContent =
            `${feedback.total} total · ${feedback.counts.bug} bugs · ${feedback.counts.confusing} confusing · ${feedback.counts.featureRequest} feature requests`;
        const recent = document.querySelector("#recent-feedback");
        if (!feedback.recent.length) recent.innerHTML = '<div class="friendly-empty">No feedback yet.</div>';
        feedback.recent.forEach(item => {
            const card = document.createElement("article");
            card.className = "analytics-feedback";
            card.innerHTML = '<span class="analytics-feedback-category"></span><p></p><span class="analytics-feedback-meta"></span>';
            card.querySelector(".analytics-feedback-category").textContent = item.category.replaceAll("_", " ");
            card.querySelector("p").textContent = item.message;
            card.querySelector(".analytics-feedback-meta").textContent = `${item.pageName} · ${item.viewportClass} · ${new Date(item.createdAt).toLocaleString()}`;
            recent.appendChild(card);
        });
    } catch (error) {
        document.querySelector("#analytics-error").textContent = error.status === 404
            ? "Internal analytics is disabled. Set INTERNAL_ANALYTICS_ENABLED=true in development."
            : error.message;
    }
}

loadInternalAnalytics();
