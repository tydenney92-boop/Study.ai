const { stringField, validationError } = require("../utils/validation");

const CATEGORIES = new Set(["bug", "confusing", "feature_request", "other"]);
const VIEWPORTS = new Set(["mobile", "tablet", "desktop"]);
const PAGES = new Set([
    "index.html", "course.html", "materials.html", "material.html", "planner.html",
    "today.html", "quiz.html", "flashcards.html", "study-guide.html", "notes.html",
    "progress.html", "history.html", "recommendations.html", "internal-analytics.html"
]);

function createFeedbackService({ repository, appVersion = null }) {
    return {
        submit(userId, body) {
            if (!body || typeof body !== "object" || Array.isArray(body)) throw validationError("Request body must be an object.");
            const allowed = new Set(["category", "message", "pageName", "viewportClass"]);
            if (Object.keys(body).some(key => !allowed.has(key))) {
                throw validationError("Feedback payload contains unsupported fields.");
            }
            const category = stringField(body, "category", { maxLength: 30 });
            const message = stringField(body, "message", { maxLength: 2000 });
            const pageName = stringField(body, "pageName", { maxLength: 80 });
            const viewportClass = stringField(body, "viewportClass", { maxLength: 20 });
            if (!CATEGORIES.has(category)) throw validationError("category is invalid.", { field: "category" });
            if (!PAGES.has(pageName)) throw validationError("pageName is invalid.", { field: "pageName" });
            if (!VIEWPORTS.has(viewportClass)) throw validationError("viewportClass is invalid.", { field: "viewportClass" });
            return repository.create({
                userId,
                category,
                message,
                pageName,
                route: `/${pageName}`,
                viewportClass,
                appVersion
            });
        }
    };
}

module.exports = { CATEGORIES, PAGES, createFeedbackService };
