(function() {
    const params = new URLSearchParams(window.location.search);

    function getCourseId() {
        const value = Number(params.get("courseId"));
        return Number.isInteger(value) && value > 0 ? value : null;
    }

    function getMaterialId() {
        const value = Number(params.get("materialId") || params.get("id"));
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

    window.StudyAI.courseContext = {
        getCourseId,
        getMaterialId,
        requireCourseId,
        url
    };
})();
