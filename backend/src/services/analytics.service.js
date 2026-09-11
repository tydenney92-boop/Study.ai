const { positiveInteger, validationError } = require("../utils/validation");

const EVENT_NAMES = new Set([
    "signup",
    "onboarding_started", "onboarding_skipped", "onboarding_completed", "onboarding_step_completed",
    "course_created",
    "material_uploaded", "syllabus_uploaded", "syllabus_import_started", "syllabus_import_completed",
    "planner_opened", "calendar_opened", "task_created", "task_completed",
    "today_opened", "plan_generated",
    "study_activity_launched", "study_activity_completed",
    "quiz_generated", "quiz_completed",
    "flashcards_generated", "flashcards_reviewed",
    "study_guide_generated", "ask_notes_opened",
    "recommendations_opened", "recommendation_action_clicked", "progress_opened"
]);

const CLIENT_EVENTS = new Set([
    "planner_opened", "calendar_opened", "today_opened",
    "study_activity_launched", "ask_notes_opened",
    "recommendations_opened", "recommendation_action_clicked", "progress_opened"
]);
const ENTITY_TYPES = new Set(["course", "material", "task", "quiz", "flashcard", "study_guide"]);
const VIEWPORTS = new Set(["mobile", "tablet", "desktop"]);
const ACTIVITY_TYPES = new Set(["quiz", "flashcards", "study_guide", "ask_notes"]);
const ACTION_TYPES = new Set([
    "quiz", "flashcards", "study_guide", "ask_notes", "planner", "today", "material", "other"
]);
const STEPS = new Set(["course", "syllabus", "deadlines", "materials", "study", "today"]);
const MATERIAL_ROLES = new Set(["general", "syllabus", "exam_review", "study_guide"]);
const EXTRACTION_STATUSES = new Set(["extracted", "no_text", "unsupported", "failed"]);
const TASK_TYPES = new Set(["assignment", "exam", "quiz", "reading", "project", "paper", "other"]);
const OUTCOMES = new Set(["know_it", "still_learning"]);
const SCORE_BANDS = new Set(["under_60", "60_79", "80_89", "90_100"]);

const METADATA_RULES = {
    onboarding_step_completed: { step: ["enum", STEPS] },
    material_uploaded: {
        materialRole: ["enum", MATERIAL_ROLES],
        extractionStatus: ["enum", EXTRACTION_STATUSES],
        materialType: ["string", 30]
    },
    syllabus_uploaded: { extractionStatus: ["enum", EXTRACTION_STATUSES] },
    syllabus_import_started: { candidateCount: ["integer", 0, 100] },
    syllabus_import_completed: {
        createdCount: ["integer", 0, 100],
        skippedCount: ["integer", 0, 100]
    },
    planner_opened: { viewportClass: ["enum", VIEWPORTS] },
    calendar_opened: { viewportClass: ["enum", VIEWPORTS] },
    task_created: { taskType: ["enum", TASK_TYPES], source: ["enum", new Set(["manual", "syllabus", "lms"])] },
    task_completed: { taskType: ["enum", TASK_TYPES], source: ["enum", new Set(["manual", "syllabus", "lms"])] },
    today_opened: { viewportClass: ["enum", VIEWPORTS] },
    plan_generated: { minutes: ["integer", 5, 240], itemCount: ["integer", 0, 100] },
    study_activity_launched: { activityType: ["enum", ACTIVITY_TYPES], viewportClass: ["enum", VIEWPORTS] },
    study_activity_completed: { activityType: ["enum", ACTIVITY_TYPES] },
    quiz_generated: { questionCount: ["integer", 1, 100] },
    quiz_completed: { scoreBand: ["enum", SCORE_BANDS] },
    flashcards_generated: { cardCount: ["integer", 1, 200] },
    flashcards_reviewed: { outcome: ["enum", OUTCOMES] },
    ask_notes_opened: { viewportClass: ["enum", VIEWPORTS] },
    recommendations_opened: { viewportClass: ["enum", VIEWPORTS] },
    recommendation_action_clicked: { actionType: ["enum", ACTION_TYPES], viewportClass: ["enum", VIEWPORTS] },
    progress_opened: { viewportClass: ["enum", VIEWPORTS] }
};

function normalizedMetadata(eventName, metadata = {}) {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
        throw validationError("Analytics metadata must be an object.");
    }
    const rules = METADATA_RULES[eventName] || {};
    const keys = Object.keys(metadata);
    if (keys.some(key => !Object.hasOwn(rules, key))) {
        throw validationError("Analytics metadata contains unsupported fields.");
    }
    const result = {};
    for (const key of keys.sort()) {
        const value = metadata[key];
        const [kind, first, second] = rules[key];
        if (kind === "enum" && !first.has(value)) throw validationError(`${key} is invalid.`, { field: key });
        if (kind === "integer" && (!Number.isInteger(value) || value < first || value > second)) {
            throw validationError(`${key} is invalid.`, { field: key });
        }
        if (kind === "string" && (typeof value !== "string" || !value || value.length > first)) {
            throw validationError(`${key} is invalid.`, { field: key });
        }
        result[key] = value;
    }
    const serialized = JSON.stringify(result);
    if (serialized.length > 1000) throw validationError("Analytics metadata is too large.");
    return { metadata: result, metadataJson: serialized };
}

function scoreBand(score) {
    if (score < 60) return "under_60";
    if (score < 80) return "60_79";
    if (score < 90) return "80_89";
    return "90_100";
}

function createAnalyticsService({ repository, coursesService, feedbackRepository, output = console }) {
    function normalize(input) {
        if (!EVENT_NAMES.has(input.eventName)) throw validationError("eventName is not supported.", { field: "eventName" });
        const courseId = input.courseId === undefined || input.courseId === null
            ? null : positiveInteger(input.courseId, "courseId");
        const entityId = input.entityId === undefined || input.entityId === null
            ? null : positiveInteger(input.entityId, "entityId");
        const entityType = input.entityType || null;
        if (entityType && !ENTITY_TYPES.has(entityType)) throw validationError("entityType is not supported.");
        if ((entityType === null) !== (entityId === null)) throw validationError("entityType and entityId must be supplied together.");
        const { metadata, metadataJson } = normalizedMetadata(input.eventName, input.metadata);
        return {
            userId: positiveInteger(input.userId, "userId"),
            eventName: input.eventName,
            courseId,
            entityType,
            entityId,
            metadata,
            metadataJson,
            dedupeKey: input.dedupeKey || null
        };
    }

    function write(input) {
        try {
            return repository.create(normalize(input));
        } catch (_error) {
            output.error(JSON.stringify({
                level: "error",
                event: "analytics_write_failed",
                analyticsEventName: EVENT_NAMES.has(input?.eventName) ? input.eventName : "invalid"
            }));
            return false;
        }
    }

    function recordClientEvent(userId, body) {
        if (!body || typeof body !== "object" || Array.isArray(body)) throw validationError("Request body must be an object.");
        const allowedKeys = new Set(["eventName", "courseId", "activityType", "actionType", "viewportClass"]);
        if (Object.keys(body).some(key => !allowedKeys.has(key))) {
            throw validationError("Analytics payload contains unsupported fields.");
        }
        if (!CLIENT_EVENTS.has(body.eventName)) throw validationError("eventName is not client-trackable.", { field: "eventName" });
        if (!VIEWPORTS.has(body.viewportClass)) throw validationError("viewportClass is invalid.", { field: "viewportClass" });
        const courseId = body.courseId === undefined || body.courseId === null
            ? null : positiveInteger(body.courseId, "courseId");
        if (courseId) coursesService.requireOwned(courseId, userId);
        const metadata = { viewportClass: body.viewportClass };
        if (body.eventName === "study_activity_launched") {
            if (!ACTIVITY_TYPES.has(body.activityType)) throw validationError("activityType is invalid.", { field: "activityType" });
            metadata.activityType = body.activityType;
        } else if (body.activityType !== undefined) {
            throw validationError("activityType is not supported for this event.", { field: "activityType" });
        }
        if (body.eventName === "recommendation_action_clicked") {
            if (!ACTION_TYPES.has(body.actionType)) throw validationError("actionType is invalid.", { field: "actionType" });
            metadata.actionType = body.actionType;
        } else if (body.actionType !== undefined) {
            throw validationError("actionType is not supported for this event.", { field: "actionType" });
        }
        write({ userId, eventName: body.eventName, courseId, metadata });
        return { recorded: true };
    }

    return {
        trackEvent: write,
        trackEventOnce(input) {
            return write({ ...input, dedupeKey: input.dedupeKey });
        },
        recordClientEvent,
        dashboard() {
            return { ...repository.dashboard(), feedback: feedbackRepository.dashboard() };
        }
    };
}

module.exports = {
    EVENT_NAMES,
    CLIENT_EVENTS,
    createAnalyticsService,
    scoreBand
};
