(function() {
    const budgetKey = "studySignal:today-minutes";
    const todayKey = () => {
        const date = new Date();
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    };
    const statusKey = () => `studySignal:today-status:${todayKey()}`;
    const presets = [20, 30, 45, 60, 90];
    let budget = readBudget();
    let loadVersion = 0;

    function readBudget() {
        const stored = Number(localStorage.getItem(budgetKey));
        return Number.isInteger(stored) && stored >= 5 && stored <= 240 ? stored : 45;
    }

    function readStatuses() {
        try {
            const value = JSON.parse(localStorage.getItem(statusKey()) || "{}");
            return value && typeof value === "object" ? value : {};
        } catch (_error) {
            return {};
        }
    }

    function writeStatus(id, status) {
        const statuses = readStatuses();
        statuses[id] = status;
        localStorage.setItem(statusKey(), JSON.stringify(statuses));
    }

    function courseColorTarget(element, course) {
        StudySignalCourseColors.applyCourseColor(element, {
            id: course.id, courseCode: course.code, courseName: course.name
        });
    }

    function timingLabel(days, overdue = false) {
        if (overdue || days < 0) return `${Math.abs(days)}d overdue`;
        if (days === 0) return "Today";
        if (days === 1) return "1 day away";
        return `${days} days away`;
    }

    function renderUpcoming(items) {
        const list = document.querySelector("#today-upcoming");
        list.innerHTML = "";
        if (!items.length) {
            list.innerHTML = '<div class="friendly-empty"><span>No unfinished deadlines.</span><a class="text-link" href="planner.html?new=1&type=assignment">Add Assignment →</a></div>';
            return;
        }
        items.forEach(item => {
            const link = document.createElement("a");
            link.className = `today-compact-item${item.overdue ? " overdue" : ""}`;
            link.href = item.href;
            link.innerHTML = '<span class="today-compact-accent"></span><span class="today-compact-copy"><strong></strong><small></small></span><span class="today-compact-meta"></span>';
            courseColorTarget(link, item.course);
            link.querySelector("strong").textContent = item.title;
            link.querySelector("small").textContent = `${item.course.code} · ${item.type}`;
            link.querySelector(".today-compact-meta").textContent = timingLabel(item.days, item.overdue);
            list.appendChild(link);
        });
    }

    function renderExams(items) {
        const list = document.querySelector("#today-exams");
        list.innerHTML = "";
        if (!items.length) {
            list.innerHTML = '<div class="friendly-empty"><span>No upcoming exams are recorded.</span><a class="text-link" href="planner.html?new=1&type=exam">Add Exam →</a></div>';
            return;
        }
        items.forEach(item => {
            const link = document.createElement("a");
            link.className = "today-compact-item";
            link.href = item.href;
            link.innerHTML = '<span class="today-compact-accent"></span><span class="today-compact-copy"><strong></strong><small></small><span class="today-exam-focus" hidden></span></span><span class="today-compact-meta"></span>';
            courseColorTarget(link, item.course);
            link.querySelector("strong").textContent = item.title;
            link.querySelector("small").textContent = `${item.course.code} · ${new Date(item.dueAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
            link.querySelector(".today-compact-meta").textContent = timingLabel(item.days);
            const focus = link.querySelector(".today-exam-focus");
            if (item.focus) {
                focus.hidden = false;
                focus.textContent = `Focus first: ${item.focus}`;
            }
            list.appendChild(link);
        });
    }

    async function markActivity(item, status) {
        try {
            if (status === "done" && item.type === "task" && item.source.taskId) {
                await StudyAI.api.patch(
                    `/api/courses/${item.course.id}/tasks/${item.source.taskId}`,
                    { completed: true }
                );
            }
            writeStatus(item.id, status);
            StudyAI.ui.notify(
                status === "done" && item.type === "task"
                    ? "Assignment completed."
                    : status === "done" ? "Marked done for today." : "Skipped for today.",
                { type: "success" }
            );
            loadPlan();
        } catch (error) {
            StudyAI.ui.notify(error.message, { type: "error" });
        }
    }

    function renderPlan(response) {
        const list = document.querySelector("#today-plan");
        const empty = document.querySelector("#today-empty");
        const start = document.querySelector("#start-study-session");
        const summary = document.querySelector("#today-plan-summary");
        list.innerHTML = "";
        empty.innerHTML = "";
        empty.hidden = true;
        summary.textContent = response.plan.length
            ? `${response.allocatedMinutes} of ${response.budgetMinutes} minutes planned from current evidence.`
            : "No evidence-backed activities are available for this time window.";
        if (!response.plan.length) {
            start.hidden = true;
            const onboarding = response.onboarding;
            empty.hidden = false;
            empty.innerHTML = '<div class="today-empty-card"><h3></h3><p></p><a class="primary-button"></a></div>';
            empty.querySelector("h3").textContent = onboarding?.title || "You’re caught up for now";
            empty.querySelector("p").textContent = onboarding?.copy || "Refresh after your next quiz, review, or Planner update.";
            const action = empty.querySelector("a");
            action.textContent = onboarding?.action.label || "Open Planner";
            action.href = onboarding?.action.href || "planner.html";
            return;
        }
        start.hidden = false;
        start.href = response.plan[0].action.href;
        response.plan.forEach(item => {
            const card = document.createElement("article");
            card.className = "today-plan-card";
            card.dataset.planId = item.id;
            card.innerHTML = '<span class="today-plan-rank"></span><span class="today-plan-accent"></span><div class="today-plan-body"><span class="today-plan-course"></span><div class="today-plan-title-row"><h3></h3><span class="today-plan-minutes"></span></div><ul class="today-plan-why" aria-label="Why this activity"></ul></div><div class="today-plan-actions"><a class="primary-button"></a><button class="text-button done-plan-item" type="button">Done</button><button class="text-button skip-plan-item" type="button">Skip</button></div>';
            courseColorTarget(card, item.course);
            card.querySelector(".today-plan-rank").textContent = item.rank;
            card.querySelector(".today-plan-course").textContent = `${item.course.code} · ${item.type.replaceAll("_", " ")}`;
            card.querySelector("h3").textContent = item.title;
            card.querySelector(".today-plan-minutes").textContent = `${item.minutes} min`;
            const reasons = card.querySelector(".today-plan-why");
            item.reasons.forEach(reason => {
                const entry = document.createElement("li");
                entry.textContent = reason;
                reasons.appendChild(entry);
            });
            const action = card.querySelector("a");
            action.textContent = item.action.label;
            action.href = item.action.href;
            card.querySelector(".done-plan-item").addEventListener("click", () => { markActivity(item, "done"); });
            card.querySelector(".skip-plan-item").addEventListener("click", () => { markActivity(item, "skipped"); });
            list.appendChild(card);
        });
    }

    function syncBudgetControls() {
        document.querySelector("#selected-budget-label").textContent = `${budget} minutes`;
        document.querySelectorAll("[data-minutes]").forEach(button => {
            button.setAttribute("aria-pressed", String(Number(button.dataset.minutes) === budget));
        });
        document.querySelector("#show-custom-time").setAttribute("aria-pressed", String(!presets.includes(budget)));
    }

    async function loadPlan() {
        const version = ++loadVersion;
        const refresh = document.querySelector("#refresh-plan");
        refresh.disabled = true;
        document.querySelector("#today-plan-summary").textContent = "Building your plan…";
        try {
            const excluded = Object.keys(readStatuses()).slice(-40);
            const params = new URLSearchParams({
                minutes: String(budget),
                timezoneOffset: String(new Date().getTimezoneOffset())
            });
            if (excluded.length) params.set("exclude", excluded.join(","));
            const response = await StudyAI.api.get(`/api/daily-plan?${params}`);
            if (version !== loadVersion) return;
            renderUpcoming(response.upcoming);
            renderExams(response.exams);
            renderPlan(response);
        } catch (error) {
            if (version !== loadVersion) return;
            document.querySelector("#today-plan").innerHTML = '<div class="friendly-empty error-state"></div>';
            document.querySelector("#today-plan .friendly-empty").textContent = error.message;
            document.querySelector("#today-plan-summary").textContent = "The plan could not be refreshed.";
        } finally {
            if (version === loadVersion) refresh.disabled = false;
        }
    }

    document.querySelectorAll("[data-minutes]").forEach(button => button.addEventListener("click", () => {
        budget = Number(button.dataset.minutes);
        localStorage.setItem(budgetKey, String(budget));
        document.querySelector("#custom-time-form").hidden = true;
        syncBudgetControls();
        loadPlan();
    }));
    document.querySelector("#show-custom-time").addEventListener("click", () => {
        const form = document.querySelector("#custom-time-form");
        form.hidden = !form.hidden;
        if (!form.hidden) {
            document.querySelector("#custom-minutes").value = budget;
            document.querySelector("#custom-minutes").focus();
        }
    });
    document.querySelector("#custom-time-form").addEventListener("submit", event => {
        event.preventDefault();
        const value = Number(document.querySelector("#custom-minutes").value);
        const error = document.querySelector("#custom-time-error");
        if (!Number.isInteger(value) || value < 5 || value > 240 || value % 5 !== 0) {
            error.textContent = "Choose 5 to 240 minutes in 5-minute steps.";
            return;
        }
        error.textContent = "";
        budget = value;
        localStorage.setItem(budgetKey, String(budget));
        event.currentTarget.hidden = true;
        syncBudgetControls();
        loadPlan();
    });
    document.querySelector("#refresh-plan").addEventListener("click", loadPlan);
    syncBudgetControls();
    loadPlan();
})();
