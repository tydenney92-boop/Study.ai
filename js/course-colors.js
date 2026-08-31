(function initializeCourseColors(root, factory) {
    const api = factory();

    if (typeof module !== "undefined" && module.exports) module.exports = api;
    if (!root) return;

    root.StudySignalCourseColors = api;
    root.StudyAI = root.StudyAI || {};
    // Compatibility alias for cached pre-helper page scripts. The canonical API
    // remains StudySignalCourseColors; both names reference the same object.
    root.StudyAI.courseColors = api;
})(typeof window !== "undefined" ? window : null, function createCourseColorApi() {
    const COURSE_COLOR_PALETTE = Object.freeze([
        { name: "blue", value: "#3F6F8A" },
        { name: "purple", value: "#70658A" },
        { name: "teal", value: "#2F7F7A" },
        { name: "green", value: "#4F7A5B" },
        { name: "orange", value: "#A9693A" },
        { name: "rose", value: "#9B5A66" },
        { name: "indigo", value: "#536486" },
        { name: "cyan", value: "#437A82" }
    ]);

    function explicitCourseColor(value) {
        const normalized = String(value || "").trim().toLowerCase();
        const match = COURSE_COLOR_PALETTE.find(color =>
            color.name === normalized || color.value.toLowerCase() === normalized
        );
        return match?.value || null;
    }

    function stableCourseHash(course) {
        const source = `${course?.courseCode || ""}|${course?.courseName || ""}`.trim().toLowerCase();
        let hash = 2166136261;
        for (let index = 0; index < source.length; index++) {
            hash ^= source.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    function getCourseColor(course = {}) {
        const explicit = explicitCourseColor(course.color);
        if (explicit) return explicit;

        const numericId = Number(course.id);
        const paletteIndex = Number.isSafeInteger(numericId) && numericId > 0
            ? (numericId - 1) % COURSE_COLOR_PALETTE.length
            : stableCourseHash(course) % COURSE_COLOR_PALETTE.length;
        return COURSE_COLOR_PALETTE[paletteIndex].value;
    }

    function applyCourseColor(element, course) {
        const color = getCourseColor(course);
        if (!element) return color;
        element.style.setProperty("--course-accent", color);
        element.dataset.courseColor = color;
        return color;
    }

    return Object.freeze({
        palette: COURSE_COLOR_PALETTE,
        COURSE_COLOR_PALETTE,
        applyCourseColor,
        getCourseColor
    });
});
