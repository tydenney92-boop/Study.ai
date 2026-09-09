function parseSidebarSemester(value) {
    const match = String(value || "").trim().match(/^(winter|spring|summer|fall)\s+(\d{4})$/i);
    if (!match) return null;
    const seasons = { winter: 0, spring: 1, summer: 2, fall: 3 };
    const season = match[1].toLowerCase();
    const year = Number(match[2]);
    return {
        key: `${season}-${year}`,
        label: `${season.charAt(0).toUpperCase()}${season.slice(1)} ${year}`,
        sortValue: year * 4 + seasons[season]
    };
}

function groupSidebarCourses(courses) {
    const groups = new Map();
    const unassigned = [];

    courses.forEach(course => {
        const semester = parseSidebarSemester(course.semester);
        if (!semester) {
            unassigned.push(course);
            return;
        }
        if (!groups.has(semester.key)) groups.set(semester.key, { ...semester, courses: [] });
        groups.get(semester.key).courses.push(course);
    });

    const result = [...groups.values()].sort((left, right) => right.sortValue - left.sortValue);
    if (unassigned.length) {
        result.push({
            key: "other-unassigned",
            label: "Other / Unassigned",
            sortValue: Number.NEGATIVE_INFINITY,
            courses: unassigned
        });
    }
    return result;
}

function sidebarSemesterExpanded({ group, index, activeCourseId, state, hasActiveGroup }) {
    if (group.courses.some(course => String(course.id) === String(activeCourseId || ""))) return true;
    if (state[group.key] !== undefined) return state[group.key] === true;
    return !hasActiveGroup && index === 0;
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        groupSidebarCourses,
        parseSidebarSemester,
        sidebarSemesterExpanded
    };
}

if (typeof window !== "undefined" && typeof document !== "undefined") (function() {
    const loginUrl = `login.html?returnTo=${encodeURIComponent(
        window.location.pathname.split("/").pop() + window.location.search + window.location.hash
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

    document.querySelectorAll(".profile-card strong").forEach(element => {
        element.textContent = "";
    });
    document.querySelectorAll(".profile-avatar").forEach(element => {
        element.textContent = "";
    });

    async function logout() {
        try {
            await StudyAI.api.post("/api/auth/logout", {});
        } finally {
            window.location.replace("login.html");
        }
    }

    const sidebarBottom = document.querySelector(".sidebar-bottom");
    const sidebarNavigation = document.querySelector(".sidebar-nav");
    if (sidebarNavigation && !sidebarNavigation.querySelector("[href='planner.html']")) {
        const plannerLink = document.createElement("a");
        plannerLink.href = "planner.html";
        plannerLink.className = "nav-item";
        plannerLink.innerHTML = "<span>▦</span>Planner";
        const progressLink = sidebarNavigation.querySelector("[href='progress.html']");
        sidebarNavigation.insertBefore(plannerLink, progressLink || null);
    }
    const currentCourseId = new URLSearchParams(window.location.search).get("courseId");
    const semesterStateKey = "studySignal:sidebar-semesters";

    function readSemesterState() {
        try {
            const stored = JSON.parse(sessionStorage.getItem(semesterStateKey) || "{}");
            return stored && typeof stored === "object" ? stored : {};
        } catch (_error) {
            return {};
        }
    }

    function writeSemesterState(state) {
        try {
            sessionStorage.setItem(semesterStateKey, JSON.stringify(state));
        } catch (_error) {
            // Navigation remains usable when browser storage is unavailable.
        }
    }

    function updatePrimaryNavigationState() {
        if (!sidebarNavigation) return;
        const page = window.location.pathname.split("/").pop() || "index.html";
        const isDashboard = page === "index.html" && window.location.hash !== "#courses";
        const isCourses = page === "index.html" && window.location.hash === "#courses";
        const isProgress = page === "progress.html" && !currentCourseId;
        const isPlanner = page === "planner.html";
        document.querySelectorAll(".sidebar .nav-item, .sidebar-course-link")
            .forEach(link => link.classList.remove("active"));
        sidebarNavigation.querySelectorAll(".nav-item").forEach(link => {
            const href = link.getAttribute("href") || "";
            const active =
                (href === "index.html" && isDashboard) ||
                (href === "index.html#courses" && isCourses) ||
                (href === "planner.html" && isPlanner) ||
                (href === "progress.html" && isProgress);
            link.classList.toggle("active", active);
        });
        if (!isDashboard && !isCourses && !isProgress && !isPlanner && currentCourseId) {
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
            <button type="button" class="sidebar-semesters-mobile-toggle" aria-expanded="false" aria-label="Open semester navigation">▤</button>
            <div class="sidebar-courses-panel">
            <div class="sidebar-courses-heading"><span>Semesters</span><a href="index.html?newCourse=1#courses" aria-label="Add course">＋</a></div>
            <div class="sidebar-course-list"><span class="sidebar-course-status">Loading…</span></div>
            <a class="sidebar-all-courses" href="index.html#courses">View all courses</a>
            </div>
        `;
        sidebarNavigation.insertAdjacentElement("afterend", courseNavigation);
        const mobileToggle = courseNavigation.querySelector(".sidebar-semesters-mobile-toggle");
        mobileToggle.addEventListener("click", () => {
            const open = courseNavigation.classList.toggle("mobile-open");
            mobileToggle.setAttribute("aria-expanded", String(open));
            mobileToggle.setAttribute("aria-label", `${open ? "Close" : "Open"} semester navigation`);
        });
        document.addEventListener("keydown", event => {
            if (event.key !== "Escape" || !courseNavigation.classList.contains("mobile-open")) return;
            courseNavigation.classList.remove("mobile-open");
            mobileToggle.setAttribute("aria-expanded", "false");
            mobileToggle.setAttribute("aria-label", "Open semester navigation");
            mobileToggle.focus();
        });

        try {
            await StudyAI.api.post("/api/storage-cleanup/reconcile", {});
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
            const groups = groupSidebarCourses(courses);
            const state = readSemesterState();
            const activeGroup = groups.find(group => group.courses.some(
                course => String(course.id) === currentCourseId
            ));
            groups.forEach((group, index) => {
                const folder = document.createElement("section");
                folder.className = "sidebar-semester-folder";
                const expanded = sidebarSemesterExpanded({
                    group,
                    index,
                    activeCourseId: currentCourseId,
                    state,
                    hasActiveGroup: Boolean(activeGroup)
                });
                folder.innerHTML = `
                    <button type="button" class="sidebar-semester-toggle" aria-expanded="${expanded}">
                        <span class="sidebar-semester-chevron" aria-hidden="true">›</span>
                        <span class="sidebar-semester-label"></span>
                        <span class="sidebar-semester-count"></span>
                    </button>
                    <div class="sidebar-semester-courses" ${expanded ? "" : "hidden"}></div>
                `;
                folder.querySelector(".sidebar-semester-label").textContent = group.label;
                folder.querySelector(".sidebar-semester-count").textContent = group.courses.length;
                const toggle = folder.querySelector(".sidebar-semester-toggle");
                const courseList = folder.querySelector(".sidebar-semester-courses");
                toggle.addEventListener("click", () => {
                    const nextExpanded = toggle.getAttribute("aria-expanded") !== "true";
                    toggle.setAttribute("aria-expanded", String(nextExpanded));
                    courseList.hidden = !nextExpanded;
                    state[group.key] = nextExpanded;
                    writeSemesterState(state);
                });
                group.courses.forEach(course => {
                    const link = document.createElement("a");
                    link.className = "sidebar-course-link";
                    if (String(course.id) === currentCourseId) link.classList.add("active");
                    link.href = `course.html?courseId=${encodeURIComponent(course.id)}`;
                    link.innerHTML = "<strong></strong><span></span>";
                    window.StudySignalCourseColors.applyCourseColor(link, course);
                    link.querySelector("strong").textContent = course.courseCode;
                    link.querySelector("span").textContent = course.courseName;
                    courseList.appendChild(link);
                });
                list.appendChild(folder);
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
