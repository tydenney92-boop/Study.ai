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

    function updatePrimaryNavigationState() {
        if (!sidebarNavigation) return;
        const page = window.location.pathname.split("/").pop() || "index.html";
        const isDashboard = page === "index.html" && window.location.hash !== "#courses";
        const isCourses = page === "index.html" && window.location.hash === "#courses";
        const isProgress = page === "progress.html" && !currentCourseId;
        document.querySelectorAll(".sidebar .nav-item, .sidebar-course-link")
            .forEach(link => link.classList.remove("active"));
        sidebarNavigation.querySelectorAll(".nav-item").forEach(link => {
            const href = link.getAttribute("href") || "";
            const active =
                (href === "index.html" && isDashboard) ||
                (href === "index.html#courses" && isCourses) ||
                (href === "progress.html" && isProgress);
            link.classList.toggle("active", active);
        });
        if (!isDashboard && !isCourses && !isProgress && currentCourseId) {
            document.querySelectorAll(".sidebar-course-link").forEach(link => {
                const target = new URL(link.href, window.location.href);
                link.classList.toggle(
                    "active",
                    target.searchParams.get("courseId") === currentCourseId
                );
            });
        }
    }

    async function loadSidebarCourses() {
        if (!sidebarNavigation) return;
        const courseNavigation = document.createElement("section");
        courseNavigation.className = "sidebar-courses";
        courseNavigation.innerHTML = `
            <div class="sidebar-courses-heading"><span>Courses</span><a href="index.html?newCourse=1#courses" aria-label="Add course">＋</a></div>
            <div class="sidebar-course-list"><span class="sidebar-course-status">Loading…</span></div>
            <a class="sidebar-all-courses" href="index.html#courses">View all courses</a>
        `;
        sidebarNavigation.insertAdjacentElement("afterend", courseNavigation);

        try {
            if (currentCourseId && /^\d+$/.test(currentCourseId)) {
                try {
                    await StudyAI.api.post(`/api/courses/${currentCourseId}/open`, {});
                } catch (error) {
                    if (error.status !== 404) throw error;
                }
            }
            const courses = await StudyAI.api.get("/api/courses");
            const list = courseNavigation.querySelector(".sidebar-course-list");
            list.innerHTML = "";
            if (courses.length === 0) {
                list.innerHTML = '<span class="sidebar-course-status">No courses yet</span>';
                return;
            }
            courses.forEach(course => {
                const link = document.createElement("a");
                link.className = "sidebar-course-link";
                if (String(course.id) === currentCourseId) link.classList.add("active");
                link.href = `course.html?courseId=${encodeURIComponent(course.id)}`;
                link.innerHTML = "<strong></strong><span></span>";
                link.querySelector("strong").textContent = course.courseCode;
                link.querySelector("span").textContent = course.courseName;
                list.appendChild(link);
            });
            updatePrimaryNavigationState();
        } catch (error) {
            courseNavigation.querySelector(".sidebar-course-list").innerHTML =
                '<span class="sidebar-course-status">Courses unavailable</span>';
        }
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
    updatePrimaryNavigationState();
    window.addEventListener("hashchange", updatePrimaryNavigationState);
    loadCurrentUser();
    loadSidebarCourses();
})();
