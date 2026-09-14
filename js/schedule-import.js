(function() {
    const $ = selector => document.querySelector(selector);
    const trigger = $("#import-course-schedule");
    const modal = $("#schedule-import-modal");
    if (!trigger || !modal) return;
    const fixedCourseId = StudyAI.courseContext.getCourseId();
    const sourceStep = $("#schedule-source-step"), reviewStep = $("#schedule-review-step"), courseSelect = $("#schedule-course"), materialSelect = $("#schedule-material"), fileInput = $("#schedule-file"), candidatesBox = $("#schedule-candidates"), error = $("#schedule-import-error");
    let preview = null;
    const courseId = () => fixedCourseId || Number(courseSelect.value);

    function close() { modal.classList.remove("open"); document.body.classList.remove("modal-open"); error.textContent = ""; reviewStep.hidden = true; sourceStep.hidden = false; preview = null; trigger.focus(); }
    async function loadCourses() {
        if (fixedCourseId) { courseSelect.innerHTML = `<option value="${fixedCourseId}">Current course</option>`; return; }
        const courses = await StudyAI.api.get("/api/courses");
        courseSelect.innerHTML = '<option value="">Choose a course</option>';
        courses.forEach(course => courseSelect.add(new Option(`${course.courseCode} — ${course.courseName}`, course.id)));
        const preferred = Number(new URLSearchParams(location.search).get("courseId")) || Number($("#planner-course-filter")?.value);
        if (preferred) courseSelect.value = String(preferred);
    }
    async function loadMaterials() {
        materialSelect.innerHTML = '<option value="">Choose an existing material</option>';
        if (!courseId()) return;
        const materials = await StudyAI.api.get(`/api/courses/${courseId()}/materials`);
        materials.filter(item => item.extractionStatus === "extracted").forEach(item => materialSelect.add(new Option(`${item.displayName}${item.materialRole === "syllabus" ? " · Schedule" : ""}`, item.id)));
        const requested = new URLSearchParams(location.search).get("materialId");
        if (requested && [...materialSelect.options].some(option => option.value === requested)) materialSelect.value = requested;
        else if (materialSelect.options.length === 2) materialSelect.selectedIndex = 1;
    }
    async function open() {
        modal.classList.add("open"); document.body.classList.add("modal-open"); error.textContent = ""; reviewStep.hidden = true; sourceStep.hidden = false; fileInput.value = "";
        try { await loadCourses(); await loadMaterials(); } catch (requestError) { error.textContent = requestError.message; }
    }
    function stateLabel(candidate) {
        if (candidate.importState === "already_imported") return "Already imported";
        if (candidate.importState === "potentially_changed") return `Potentially changed · existing ${new Date(candidate.existingTask.dueAt).toLocaleString()}`;
        if (candidate.eventKind === "exam_review") return "Exam review · optional";
        if (candidate.status === "ambiguous") return "Needs review · date required";
        return candidate.confidence === "high" ? "New · high confidence" : "New · review suggested";
    }
    function row(candidate) {
        const item = document.createElement("article"); item.className = `schedule-candidate ${candidate.status} ${candidate.importState}`; item.dataset.key = candidate.key; item.dataset.importState = candidate.importState;
        item.innerHTML = '<label class="candidate-check"><input type="checkbox"><span></span></label><div class="candidate-fields"><input class="candidate-title" maxlength="200"><select class="candidate-type"><option value="assignment">Assignment</option><option value="exam">Exam</option><option value="quiz">Quiz</option><option value="reading">Reading</option><option value="project">Project</option><option value="paper">Paper</option><option value="other">Other / Exam Review</option></select><div><input class="candidate-date" type="date"><label class="candidate-time-label"><span>Time (24-hour)</span><input class="candidate-time" inputmode="numeric" placeholder="HH:mm" pattern="(?:[01]\\d|2[0-3]):[0-5]\\d"></label></div><small class="candidate-state"></small><div class="candidate-reconcile" hidden><label>Changed deadline<select class="candidate-action"><option value="keep">Keep existing</option><option value="update">Update to new date</option></select></label></div><blockquote></blockquote></div>';
        const check = item.querySelector("input[type=checkbox]"); check.checked = candidate.selected; check.disabled = candidate.importState === "already_imported"; check.setAttribute("aria-label", `Include ${candidate.title}`);
        const title = item.querySelector(".candidate-title"), type = item.querySelector(".candidate-type"), date = item.querySelector(".candidate-date"), time = item.querySelector(".candidate-time");
        title.value = candidate.title; title.setAttribute("aria-label", `Title for ${candidate.title}`); type.value = candidate.type; type.setAttribute("aria-label", `Type for ${candidate.title}`); date.value = candidate.dueDate || ""; date.setAttribute("aria-label", `Due date for ${candidate.title}`); time.value = candidate.dueTime || ""; time.setAttribute("aria-label", `Due time in 24-hour format for ${candidate.title}`);
        item.querySelector(".candidate-state").textContent = stateLabel(candidate); item.querySelector("blockquote").textContent = `Source: “${candidate.sourceText}”`;
        if (candidate.importState === "potentially_changed") { item.querySelector(".candidate-reconcile").hidden = false; check.checked = true; }
        return item;
    }
    function renderPreview() {
        sourceStep.hidden = true; reviewStep.hidden = false; candidatesBox.innerHTML = "";
        [["High-confidence deadlines", preview.candidates.filter(item => item.confidence === "high" && item.status === "confirmed")], ["Needs review", preview.candidates.filter(item => item.confidence !== "high" || item.status !== "confirmed")]].forEach(([heading, items]) => {
            if (!items.length) return; const group = document.createElement("section"); group.className = "schedule-confidence-group"; const title = document.createElement("h3"); title.textContent = heading; group.appendChild(title); items.forEach(item => group.appendChild(row(item))); candidatesBox.appendChild(group);
        });
        const clear = preview.summary.confirmed || 0, review = preview.summary.ambiguous || 0;
        $("#schedule-summary").textContent = preview.candidates.length ? `Found ${clear} clear deadline${clear === 1 ? "" : "s"} and ${review} item${review === 1 ? "" : "s"} that need review.` : "No likely assignment or exam deadlines were found. Try a clearer screenshot or a page containing the schedule table.";
        $("#schedule-confirm-copy").hidden = true; $("#import-schedule-events").dataset.confirmed = "false"; $("#import-schedule-events").textContent = "Import Selected Events";
    }
    async function find() {
        error.textContent = ""; const selectedCourse = courseId(); if (!selectedCourse) { error.textContent = "Choose the Study Signal course for these deadlines."; return; }
        const button = $("#preview-schedule"); button.disabled = true; button.textContent = "Reading schedule…";
        try {
            if (fileInput.files[0]) { const body = new FormData(); body.append("file", fileInput.files[0]); preview = await StudyAI.api.upload(`/api/courses/${selectedCourse}/schedule-import/upload`, body, { timeoutMs: 120000 }); }
            else if (materialSelect.value) preview = await StudyAI.api.post(`/api/courses/${selectedCourse}/schedule-import/preview`, { materialId: Number(materialSelect.value) }, { timeoutMs: 60000 });
            else throw new Error("Upload a schedule or choose an existing material.");
            renderPreview();
        } catch (requestError) { error.textContent = requestError.message; } finally { button.disabled = false; button.textContent = "Find Deadlines"; }
    }
    function selected() {
        return [...candidatesBox.querySelectorAll(".schedule-candidate")].filter(item => item.querySelector("input[type=checkbox]").checked).map(item => {
            const date = item.querySelector(".candidate-date").value, time = item.querySelector(".candidate-time").value.trim() || "23:59";
            if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Use 24-hour time in HH:mm format, from 00:00 through 23:59.");
            return { key: item.dataset.key, title: item.querySelector(".candidate-title").value, type: item.querySelector(".candidate-type").value, dueAt: date ? new Date(`${date}T${time}:00`).toISOString() : null, action: item.dataset.importState === "potentially_changed" ? item.querySelector(".candidate-action").value : "create" };
        });
    }
    async function submit() {
        const button = $("#import-schedule-events"); error.textContent = ""; let items; try { items = selected(); } catch (validationError) { error.textContent = validationError.message; return; }
        if (!items.length) { error.textContent = "Select at least one resolved deadline."; return; } if (items.some(item => !item.dueAt)) { error.textContent = "Every selected event needs a valid date."; return; }
        if (button.dataset.confirmed !== "true") { $("#schedule-confirm-copy").textContent = `Import ${items.length} event${items.length === 1 ? "" : "s"}? Nothing is added until you confirm.`; $("#schedule-confirm-copy").hidden = false; button.dataset.confirmed = "true"; button.textContent = "Confirm Import"; return; }
        try { const result = await StudyAI.api.post(`/api/courses/${courseId()}/schedule-import/confirm`, { materialId: preview.material.id, candidates: items }, { timeoutMs: 60000 }); StudyAI.ui.notify(`${result.created} created · ${result.updated || 0} updated · ${result.skipped + (result.kept || 0)} skipped`, { type: "success" }); location.href = fixedCourseId ? `course.html?courseId=${fixedCourseId}&onboarding=deadlines-imported` : `planner.html?courseId=${courseId()}`; } catch (requestError) { error.textContent = requestError.message; }
    }
    trigger.addEventListener("click", open); $("#close-schedule-import").addEventListener("click", close); $("#preview-schedule").addEventListener("click", find); $("#back-schedule-import").addEventListener("click", () => { reviewStep.hidden = true; sourceStep.hidden = false; }); $("#import-schedule-events").addEventListener("click", submit);
    courseSelect.addEventListener("change", () => loadMaterials().catch(requestError => { error.textContent = requestError.message; })); fileInput.addEventListener("change", () => { if (fileInput.files.length) materialSelect.value = ""; }); materialSelect.addEventListener("change", () => { if (materialSelect.value) fileInput.value = ""; }); if (new URLSearchParams(location.search).get("importSchedule") === "1") open();
})();
