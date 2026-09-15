(function() {
    const storageKey = "studySignal:study-session";
    const container = document.querySelector("#study-session");
    const elapsed = document.querySelector("#session-elapsed");
    const timerToggle = document.querySelector("#timer-toggle");
    let timerId = null;
    let session = readSession();

    function readSession() {
        try {
            const value = JSON.parse(sessionStorage.getItem(storageKey) || "null");
            if (!value || !Array.isArray(value.activities) || !value.activities.length) return null;
            return value;
        } catch (_error) {
            return null;
        }
    }

    function saveSession() {
        sessionStorage.setItem(storageKey, JSON.stringify(session));
    }

    function elapsedMs() {
        if (!session) return 0;
        return Number(session.elapsedMs || 0) + (session.pausedAt ? 0 : Date.now() - session.startedAt);
    }

    function formatElapsed(milliseconds) {
        const seconds = Math.max(0, Math.floor(milliseconds / 1000));
        return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    }

    function updateTimer() {
        elapsed.textContent = formatElapsed(elapsedMs());
        timerToggle.textContent = session?.pausedAt ? "Resume" : "Pause";
    }

    function startTimer() {
        clearInterval(timerId);
        updateTimer();
        timerId = setInterval(updateTimer, 1000);
    }

    function courseColorTarget(element, course) {
        StudySignalCourseColors.applyCourseColor(element, {
            id: course.id, courseCode: course.code, courseName: course.name
        });
    }

    function finishSession() {
        session.finishedAt = Date.now();
        session.elapsedMs = elapsedMs();
        session.pausedAt = session.finishedAt;
        saveSession();
        clearInterval(timerId);
        timerToggle.hidden = true;
        const completed = session.activities.filter(item => session.statuses[item.id] === "done");
        const plannedMinutes = completed.reduce((total, item) => total + Number(item.minutes || 0), 0);
        const groups = new Map();
        completed.forEach(item => {
            const courseKey = `${item.course.id}:${item.course.code}`;
            if (!groups.has(courseKey)) groups.set(courseKey, { course: item.course, items: [] });
            groups.get(courseKey).items.push(item);
        });
        container.innerHTML = '<section class="session-summary"><p class="eyebrow">SESSION COMPLETE</p><h2>Study session complete</h2><p class="session-summary-stats"></p><div class="session-summary-groups"></div><div class="session-summary-actions"><a class="secondary-tool-button" href="today.html">Back to Today</a><a class="primary-button" href="progress.html">View Progress</a></div></section>';
        container.querySelector(".session-summary-stats").textContent = `${completed.length} ${completed.length === 1 ? "activity" : "activities"} completed · ${plannedMinutes} minutes planned`;
        const groupContainer = container.querySelector(".session-summary-groups");
        groups.forEach(group => {
            const section = document.createElement("section");
            section.className = "session-summary-course";
            section.innerHTML = "<h3></h3><ul></ul>";
            section.querySelector("h3").textContent = group.course.code;
            group.items.forEach(item => {
                const entry = document.createElement("li");
                entry.textContent = `${item.title} completed`;
                section.querySelector("ul").appendChild(entry);
            });
            groupContainer.appendChild(section);
        });
    }

    function currentActivity() {
        return session.activities[session.currentIndex];
    }

    async function advance(status) {
        const activity = currentActivity();
        if (!activity) return;
        const buttons = container.querySelectorAll("button");
        buttons.forEach(button => { button.disabled = true; });
        try {
            if (status === "done" && activity.type === "task" && activity.source?.taskId) {
                await StudyAI.api.patch(`/api/courses/${activity.course.id}/tasks/${activity.source.taskId}`, { completed: true });
            }
            if (status) session.statuses[activity.id] = status;
            session.currentIndex += 1;
            saveSession();
            if (session.currentIndex >= session.activities.length) finishSession();
            else renderActivity();
        } catch (error) {
            buttons.forEach(button => { button.disabled = false; });
            StudyAI.ui.notify(error.message, { type: "error" });
        }
    }

    function renderActivity() {
        const activity = currentActivity();
        if (!activity) return finishSession();
        timerToggle.hidden = false;
        const ordinal = session.currentIndex + 1;
        container.innerHTML = '<article class="session-activity-card"><div class="session-progress"><span></span><strong></strong></div><span class="session-course"></span><h2></h2><span class="recommendation-priority"></span><p class="recommendation-summary" hidden></p><div class="session-reasons" hidden><h3>Why</h3><ul></ul></div><p class="session-estimate"></p><div class="session-actions"><a class="primary-button session-start-action">Start</a><div class="session-advance-actions"><button class="secondary-tool-button session-done" type="button">Done</button><button class="text-button session-skip" type="button">Skip</button><button class="text-button session-next" type="button">Next</button></div></div></article>';
        const card = container.querySelector(".session-activity-card");
        courseColorTarget(card, activity.course);
        card.querySelector(".session-progress span").textContent = `${ordinal} of ${session.activities.length}`;
        card.querySelector(".session-progress strong").textContent = `${activity.type.replaceAll("_", " ")} · ${activity.minutes} min`;
        card.querySelector(".session-course").textContent = activity.course.code;
        card.querySelector("h2").textContent = activity.title;
        const priority = card.querySelector(".recommendation-priority");
        priority.textContent = `${activity.priority || "medium"} priority`;
        priority.classList.add(`priority-${activity.priority || "medium"}`);
        const summary = card.querySelector(".recommendation-summary");
        if (activity.explanation) {
            summary.hidden = false;
            summary.textContent = activity.explanation;
        }
        const reasons = card.querySelector(".session-reasons ul");
        activity.reasons.forEach(reason => {
            const item = document.createElement("li");
            item.textContent = reason;
            reasons.appendChild(item);
        });
        card.querySelector(".session-reasons").hidden = !activity.reasons.length;
        card.querySelector(".session-estimate").textContent = `Estimated time: ${activity.minutes} min`;
        const start = card.querySelector(".session-start-action");
        start.textContent = activity.action.label;
        start.href = activity.action.href;
        card.querySelector(".session-done").addEventListener("click", () => advance("done"));
        card.querySelector(".session-skip").addEventListener("click", () => advance("skipped"));
        card.querySelector(".session-next").addEventListener("click", () => advance(null));
    }

    timerToggle.addEventListener("click", () => {
        if (!session) return;
        if (session.pausedAt) {
            session.startedAt = Date.now();
            session.pausedAt = null;
        } else {
            session.elapsedMs = elapsedMs();
            session.pausedAt = Date.now();
        }
        saveSession();
        updateTimer();
    });

    if (!session) {
        timerToggle.hidden = true;
        container.innerHTML = '<section class="session-empty"><h1>No active study session</h1><p>Build a focused plan on Today, then start your session from there.</p><a class="primary-button" href="today.html">Back to Today</a></section>';
        return;
    }
    if (session.finishedAt || session.currentIndex >= session.activities.length) finishSession();
    else {
        startTimer();
        renderActivity();
    }
})();
