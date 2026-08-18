(function() {
    const loginUrl = `login.html?returnTo=${encodeURIComponent(
        window.location.pathname.split("/").pop() + window.location.search
    )}`;

    function redirectToLogin() {
        window.location.replace(loginUrl);
    }

    window.addEventListener("studyai:unauthenticated", redirectToLogin);

    async function loadCurrentUser() {
        try {
            const response = await StudyAI.api.get("/api/auth/me");
            document.querySelectorAll(".profile-card strong").forEach(element => {
                element.textContent = response.user.name;
            });
            document.querySelectorAll(".profile-avatar").forEach(element => {
                element.textContent = response.user.name.charAt(0).toUpperCase();
            });
            return response.user;
        } catch (error) {
            if (error.status !== 401) throw error;
            return null;
        }
    }

    async function logout() {
        try {
            await StudyAI.api.post("/api/auth/logout", {});
        } finally {
            window.location.replace("login.html");
        }
    }

    const sidebarBottom = document.querySelector(".sidebar-bottom");
    const sidebarNavigation = document.querySelector(".sidebar-nav");
    const currentCourseId = new URLSearchParams(window.location.search).get("courseId");

    if (sidebarNavigation && currentCourseId) {
        const switcher = document.createElement("div");
        switcher.className = "course-switcher";
        switcher.innerHTML = `
            <label for="course-switcher-select">Switch course</label>
            <select id="course-switcher-select" aria-label="Switch course">
                <option value="">Loading courses…</option>
            </select>
        `;
        sidebarNavigation.insertAdjacentElement("afterend", switcher);
        const select = switcher.querySelector("select");
        StudyAI.api.get("/api/courses")
            .then(courses => {
                select.innerHTML = '<option value="">Choose a course…</option>';
                courses.forEach(course => {
                    const option = document.createElement("option");
                    option.value = course.id;
                    option.textContent = `${course.courseCode} · ${course.courseName}`;
                    option.selected = String(course.id) === currentCourseId;
                    select.appendChild(option);
                });
            })
            .catch(() => switcher.remove());
        select.addEventListener("change", () => {
            if (select.value) {
                window.location.href = `course.html?courseId=${encodeURIComponent(select.value)}`;
            }
        });
    }

    if (sidebarBottom) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "logout-button";
        button.textContent = "Log out";
        button.addEventListener("click", logout);
        sidebarBottom.appendChild(button);
    }

    window.StudyAI.auth = { loadCurrentUser, logout };
    loadCurrentUser();
})();
