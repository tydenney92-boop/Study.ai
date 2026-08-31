/* =========================================
   STUDY AI CONFIGURATION
========================================= */

/*
   Keep the backend address in one place.

   For local development, leave this as-is. If the backend
   is hosted somewhere else later, change only this value.
*/

const isSplitLocalDevelopment =
    ["localhost", "127.0.0.1"].includes(window.location.hostname) &&
    window.location.port === "8080";

const STUDY_AI_API_BASE_URL =
    window.STUDY_AI_API_BASE_URL ||
    (isSplitLocalDevelopment
        ? "http://localhost:3000"
        : window.location.origin);

const SAFE_COURSE_ACCENT = "#2F7F7A";

window.StudySignalCourseColors = window.StudySignalCourseColors || Object.freeze({
    palette: Object.freeze([{ name: "teal", value: SAFE_COURSE_ACCENT }]),
    getCourseColor: function() {
        return SAFE_COURSE_ACCENT;
    },
    applyCourseColor: function(element) {
        if (element) {
            element.style.setProperty("--course-accent", SAFE_COURSE_ACCENT);
            element.dataset.courseColor = SAFE_COURSE_ACCENT;
        }
        return SAFE_COURSE_ACCENT;
    }
});


window.StudyAI = {

    courseColors: window.StudySignalCourseColors,

    apiUrl: function(path) {

        return STUDY_AI_API_BASE_URL + path;

    },


    fetchWithTimeout: async function(url, options, timeoutMs) {

        const controller = new AbortController();

        const timeout = setTimeout(
            function() {

                controller.abort();

            },
            timeoutMs || 120000
        );

        try {

            return await fetch(
                url,
                {
                    ...options,
                    signal: controller.signal
                }
            );

        } finally {

            clearTimeout(timeout);

        }

    }

};
