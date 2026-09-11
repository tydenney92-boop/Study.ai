(function() {
    const modal = document.querySelector("#lms-modal");
    const content = document.querySelector("#lms-content");
    const error = document.querySelector("#lms-error");
    const openButton = document.querySelector("#open-lms-import");
    const closeButton = document.querySelector("#close-lms-modal");
    let renderVersion = 0;

    function statusLabel(status) {
        if (status === "expired") return "Needs reconnection";
        if (status === "error") return "Sync failed";
        return "Connected";
    }

    function lastSyncLabel(value) {
        return value
            ? `Last synced ${new Date(value).toLocaleString()}`
            : "Not synced yet";
    }

    function setBusy(button, busy, label) {
        button.disabled = busy;
        if (busy) {
            button.dataset.label = button.textContent;
            button.textContent = label;
        } else if (button.dataset.label) {
            button.textContent = button.dataset.label;
            delete button.dataset.label;
        }
    }

    function addConnectionCard(connection) {
        const card = document.createElement("section");
        card.className = `lms-connection-card status-${connection.status}`;
        card.innerHTML = `
            <div>
                <span class="lms-provider-mark" aria-hidden="true">C</span>
                <div><strong>Canvas</strong><span class="lms-connection-state"></span></div>
            </div>
            <div class="lms-connection-meta"><strong></strong><span></span></div>
        `;
        card.querySelector(".lms-connection-state").textContent = statusLabel(connection.status);
        card.querySelector(".lms-connection-meta strong").textContent =
            `${connection.mappedCourseCount} course${connection.mappedCourseCount === 1 ? "" : "s"} mapped`;
        card.querySelector(".lms-connection-meta span").textContent = lastSyncLabel(connection.lastSyncedAt);
        content.appendChild(card);
        return card;
    }

    function addReconnectActions(connection) {
        const copy = document.createElement("div");
        copy.className = "lms-reconnect-panel";
        copy.innerHTML = `
            <strong>Canvas authorization needs attention</strong>
            <span>Reconnect to discover courses and sync assignments again. Existing imported assignments remain in Study Signal.</span>
            <div class="app-modal-actions">
                <button type="button" class="danger-button">Disconnect</button>
                <a class="primary-button" href="/api/lms/canvas/connect">Reconnect Canvas</a>
            </div>
        `;
        content.appendChild(copy);
        wireDisconnect(copy.querySelector("button"), connection);
    }

    function wireDisconnect(button, connection) {
        button.addEventListener("click", async () => {
            if (button.dataset.confirm !== "true") {
                button.dataset.confirm = "true";
                button.textContent = "Confirm Disconnect";
                error.textContent = "Imported Canvas assignments will remain in Planner. Click Confirm Disconnect to continue.";
                return;
            }
            setBusy(button, true, "Disconnecting…");
            try {
                await StudyAI.api.delete(`/api/lms/${connection.id}`);
                StudyAI.ui.notify("Canvas disconnected. Existing imported assignments remain in Planner.", { type: "success" });
                await render();
            } catch (requestError) {
                error.textContent = requestError.message;
            } finally {
                setBusy(button, false, "Disconnect");
            }
        });
    }

    function addSyncSummary(result) {
        let summary = content.querySelector("#lms-sync-summary");
        if (!summary) {
            summary = document.createElement("section");
            summary.id = "lms-sync-summary";
            summary.className = "lms-sync-summary";
            summary.setAttribute("role", "status");
            content.appendChild(summary);
        }
        summary.innerHTML = "<strong></strong><ul></ul>";
        summary.querySelector("strong").textContent = result.reconnectRequired
            ? "Canvas needs reconnection"
            : result.failedCourses.length ? "Canvas synced with some issues" : "Canvas synced";
        const lines = [
            `${result.coursesChecked} course${result.coursesChecked === 1 ? "" : "s"} checked`,
            `${result.assignments} assignment${result.assignments === 1 ? "" : "s"} received`,
            `${result.created} imported`,
            `${result.updated} updated`,
            `${result.unchanged} unchanged`,
            `${result.removed} marked unavailable`
        ];
        if (result.failedCourses.length) lines.push(`${result.failedCourses.length} course sync failure${result.failedCourses.length === 1 ? "" : "s"}`);
        const list = summary.querySelector("ul");
        lines.forEach(line => {
            const item = document.createElement("li");
            item.textContent = line;
            list.appendChild(item);
        });
        if (result.failedCourses.length) {
            const failures = document.createElement("div");
            failures.className = "lms-sync-failures";
            result.failedCourses.forEach(failure => {
                const item = document.createElement("p");
                item.textContent = failure.externalCourseId
                    ? `Canvas course ${failure.externalCourseId}: ${failure.message}`
                    : failure.message;
                failures.appendChild(item);
            });
            summary.appendChild(failures);
        }
    }

    async function renderConnected(connection, version) {
        addConnectionCard(connection);
        if (connection.status === "expired") {
            addReconnectActions(connection);
            return;
        }
        let remoteCourses;
        let mappings;
        let courses;
        try {
            [remoteCourses, mappings, courses] = await Promise.all([
                StudyAI.api.get(`/api/lms/${connection.id}/courses`),
                StudyAI.api.get(`/api/lms/${connection.id}/mappings`),
                StudyAI.api.get("/api/courses")
            ]);
        } catch (requestError) {
            if (version !== renderVersion) return;
            error.textContent = requestError.message;
            if (requestError.code === "LMS_AUTH_EXPIRED" || requestError.status === 401) {
                content.innerHTML = "";
                addConnectionCard({ ...connection, status: "expired" });
                addReconnectActions(connection);
            }
            return;
        }
        if (version !== renderVersion) return;

        const intro = document.createElement("div");
        intro.className = "lms-mapping-intro";
        intro.innerHTML = "<strong>Choose what to import</strong><span>Match each Canvas course, create a new Study Signal course, or leave it out.</span>";
        content.appendChild(intro);

        const form = document.createElement("form");
        form.className = "lms-mappings";
        remoteCourses.forEach(remoteCourse => {
            const row = document.createElement("label");
            row.className = "lms-mapping-row";
            row.innerHTML = `
                <span class="lms-course-copy"><strong></strong><small></small></span>
                <span class="lms-mapping-control">Match to<select aria-label="Study Signal course"><option value="">Don't import</option><option value="new">Create new Study Signal course</option></select></span>
            `;
            row.querySelector(".lms-course-copy strong").textContent = remoteCourse.code || "Canvas course";
            row.querySelector(".lms-course-copy small").textContent = [remoteCourse.name, remoteCourse.term].filter(Boolean).join(" · ");
            const select = row.querySelector("select");
            courses.forEach(course => select.add(new Option(`${course.courseCode} — ${course.courseName}`, course.id)));
            select.value = String(mappings.find(mapping => mapping.externalCourseId === remoteCourse.externalId)?.courseId || "");
            row.dataset.externalId = remoteCourse.externalId;
            row.dataset.name = remoteCourse.name;
            row.dataset.code = remoteCourse.code || "Canvas";
            row.dataset.term = remoteCourse.term || "";
            form.appendChild(row);
        });
        if (!remoteCourses.length) {
            form.innerHTML = '<div class="friendly-empty"><strong>No active student courses found</strong><span>Canvas did not return any currently active student enrollments.</span></div>';
        }
        content.appendChild(form);

        const actions = document.createElement("div");
        actions.className = "app-modal-actions lms-actions";
        actions.innerHTML = '<button type="button" class="danger-button" id="disconnect-lms">Disconnect</button><button type="button" class="primary-button" id="sync-lms">Sync Now</button>';
        content.appendChild(actions);
        wireDisconnect(actions.querySelector("#disconnect-lms"), connection);

        actions.querySelector("#sync-lms").addEventListener("click", async event => {
            const button = event.currentTarget;
            error.textContent = "";
            setBusy(button, true, "Syncing…");
            try {
                const payload = [];
                for (const row of form.querySelectorAll(".lms-mapping-row")) {
                    let value = row.querySelector("select").value;
                    if (!value) continue;
                    if (value === "new") {
                        const created = await StudyAI.api.post("/api/courses", {
                            courseName: row.dataset.name,
                            courseCode: row.dataset.code,
                            semester: row.dataset.term || "Canvas"
                        });
                        value = created.id;
                        row.querySelector("select").add(new Option(`${created.courseCode} — ${created.courseName}`, created.id));
                        row.querySelector("select").value = String(created.id);
                    }
                    payload.push({
                        externalCourseId: row.dataset.externalId,
                        externalCourseName: row.dataset.name,
                        courseId: Number(value)
                    });
                }
                await StudyAI.api.put(`/api/lms/${connection.id}/mappings`, { mappings: payload });
                const result = await StudyAI.api.post(`/api/lms/${connection.id}/sync`, {});
                addSyncSummary(result);
                content.querySelector(".lms-connection-state").textContent = statusLabel(result.connectionStatus);
                content.querySelector(".lms-connection-card").className = `lms-connection-card status-${result.connectionStatus}`;
                content.querySelector(".lms-connection-meta strong").textContent = `${payload.length} course${payload.length === 1 ? "" : "s"} mapped`;
                content.querySelector(".lms-connection-meta span").textContent = result.reconnectRequired ? lastSyncLabel(connection.lastSyncedAt) : "Synced just now";
                window.dispatchEvent(new CustomEvent("studyai:lms-synced"));
                if (result.reconnectRequired) error.textContent = "Canvas connection expired. Reconnect Canvas.";
            } catch (requestError) {
                error.textContent = requestError.message;
            } finally {
                setBusy(button, false, "Sync Now");
            }
        });
    }

    async function render() {
        const version = ++renderVersion;
        content.innerHTML = '<div class="friendly-empty">Loading Canvas connection…</div>';
        error.textContent = "";
        try {
            const state = await StudyAI.api.get("/api/lms");
            if (version !== renderVersion) return;
            content.innerHTML = "";
            const connection = state.connections.find(item => item.provider === "canvas");
            if (!connection) {
                const empty = document.createElement("div");
                empty.className = "lms-connect-panel";
                empty.innerHTML = `
                    <span class="lms-provider-mark" aria-hidden="true">C</span>
                    <strong>Canvas</strong>
                    <span>Import courses, assignments, quizzes, and due dates.</span>
                `;
                const action = document.createElement(state.canvasConfigured ? "a" : "button");
                action.className = "primary-button";
                action.textContent = state.canvasConfigured ? "Connect Canvas" : "Canvas unavailable";
                if (state.canvasConfigured) action.href = "/api/lms/canvas/connect";
                else {
                    action.type = "button";
                    action.disabled = true;
                    const explanation = document.createElement("small");
                    explanation.textContent = "This deployment needs institution-issued Canvas OAuth configuration.";
                    empty.appendChild(explanation);
                }
                empty.appendChild(action);
                content.appendChild(empty);
                return;
            }
            await renderConnected(connection, version);
        } catch (requestError) {
            if (version === renderVersion) error.textContent = requestError.message;
        }
    }

    function open() {
        modal.classList.add("open");
        return render();
    }

    openButton.addEventListener("click", open);
    closeButton.addEventListener("click", () => modal.classList.remove("open"));

    const query = new URLSearchParams(window.location.search);
    const oauthResult = query.get("lms");
    if (oauthResult) {
        query.delete("lms");
        const next = `${window.location.pathname}${query.toString() ? `?${query}` : ""}${window.location.hash}`;
        window.history.replaceState({}, "", next);
        open().then(() => {
            if (oauthResult === "denied") {
                error.textContent = "Canvas access was not approved. You can try again when ready.";
            }
        });
    }
})();
