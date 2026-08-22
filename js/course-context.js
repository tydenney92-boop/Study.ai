(function() {
    function params() {
        return new URLSearchParams(window.location.search);
    }
    const MY_COURSES_URL = "index.html#courses";

    function getCourseId() {
        const value = Number(params().get("courseId"));
        return Number.isInteger(value) && value > 0 ? value : null;
    }

    function getMaterialId() {
        const current = params();
        const value = Number(current.get("materialId") || current.get("id"));
        return Number.isInteger(value) && value > 0 ? value : null;
    }

    function url(page, values = {}) {
        const next = new URLSearchParams();
        const courseId = values.courseId ?? getCourseId();

        if (courseId) {
            next.set("courseId", courseId);
        }

        Object.entries(values).forEach(([key, value]) => {
            if (key !== "courseId" && value !== undefined && value !== null) {
                next.set(key, value);
            }
        });

        const query = next.toString();
        return query ? `${page}?${query}` : page;
    }

    function requireCourseId(messageElement) {
        const courseId = getCourseId();

        if (!courseId && messageElement) {
            messageElement.textContent = "Choose a course from the dashboard first.";
        }

        return courseId;
    }

    function setNotice(message) {
        if (message) sessionStorage.setItem("studyai:notice", message);
    }

    function goToMyCourses(message) {
        setNotice(message);
        window.location.replace(MY_COURSES_URL);
    }

    function requireContext({ material = false } = {}) {
        const courseId = getCourseId();
        const materialId = getMaterialId();
        if (!courseId || (material && !materialId)) {
            goToMyCourses("Choose a course to continue.");
            return null;
        }
        return { courseId, materialId };
    }

    function toolOrigin() {
        return getCourseId() && getMaterialId() ? "material" : "course";
    }

    function toolBackUrl() {
        const courseId = getCourseId();
        const materialId = getMaterialId();
        if (!courseId) return MY_COURSES_URL;
        return materialId
            ? url("material.html", { courseId, materialId })
            : url("course.html", { courseId });
    }

    function normalizeMaterialUrl(page = "material.html") {
        const courseId = getCourseId();
        const materialId = getMaterialId();
        if (
            courseId &&
            materialId &&
            params().get("materialId") !== String(materialId)
        ) {
            window.history.replaceState(
                null,
                "",
                url(page, { courseId, materialId })
            );
        }
        return { courseId, materialId };
    }

    window.StudyAI.courseContext = {
        getCourseId,
        getMaterialId,
        goToMyCourses,
        MY_COURSES_URL,
        normalizeMaterialUrl,
        requireCourseId,
        requireContext,
        setNotice,
        toolBackUrl,
        toolOrigin,
        url
    };
})();
