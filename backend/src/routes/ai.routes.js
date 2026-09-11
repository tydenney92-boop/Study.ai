const express = require("express");
const { asyncHandler } = require("../utils/async-handler");
const { positiveInteger, requestObject } = require("../utils/validation");

function createCourseAiRouter({
    studyGuideService,
    quizGenerationService,
    generatedContentService,
    aiUsageGuard,
    analyticsService
}) {
    const router = express.Router({ mergeParams: true });

    router.use(function parseCourse(req, res, next) {
        req.courseId = positiveInteger(req.params.courseId, "courseId");
        next();
    });

    router.post(
        "/study-guides",
        asyncHandler(async function(req, res) {
            requestObject(req.body);
            const guide = await aiUsageGuard.execute(req.user.id, () =>
                studyGuideService.generate({
                    courseId: req.courseId,
                    userId: req.user.id,
                    materialIds: req.body.materialIds
                })
            );
            analyticsService?.trackEvent({ userId: req.user.id, eventName: "study_guide_generated", courseId: req.courseId, entityType: "study_guide", entityId: guide.id });
            analyticsService?.trackEvent({ userId: req.user.id, eventName: "study_activity_completed", courseId: req.courseId, entityType: "study_guide", entityId: guide.id, metadata: { activityType: "study_guide" } });
            analyticsService?.trackEventOnce({ userId: req.user.id, eventName: "onboarding_step_completed", courseId: req.courseId, metadata: { step: "study" }, dedupeKey: "step:study" });
            res.status(201).json(guide);
        })
    );

    router.get("/study-guides", function(req, res) {
        res.json(generatedContentService.listStudyGuides(req.courseId, req.user.id));
    });

    router.get("/study-guides/:guideId", function(req, res) {
        const guideId = positiveInteger(req.params.guideId, "guideId");
        res.json(generatedContentService.getStudyGuide(guideId, req.courseId, req.user.id));
    });

    router.delete("/study-guides/:guideId", function(req, res) {
        const guideId = positiveInteger(req.params.guideId, "guideId");
        generatedContentService.deleteStudyGuide(guideId, req.courseId, req.user.id);
        res.status(204).end();
    });

    router.post(
        "/quizzes",
        asyncHandler(async function(req, res) {
            requestObject(req.body);
            const quiz = await aiUsageGuard.execute(req.user.id, () =>
                quizGenerationService.generate({
                    courseId: req.courseId,
                    userId: req.user.id,
                    materialIds: req.body.materialIds,
                    questionCount: req.body.questionCount
                })
            );
            analyticsService?.trackEvent({ userId: req.user.id, eventName: "quiz_generated", courseId: req.courseId, entityType: "quiz", entityId: quiz.id, metadata: { questionCount: quiz.quiz.questions.length } });
            analyticsService?.trackEventOnce({ userId: req.user.id, eventName: "onboarding_step_completed", courseId: req.courseId, metadata: { step: "study" }, dedupeKey: "step:study" });
            res.status(201).json(quiz);
        })
    );

    router.get("/quizzes", function(req, res) {
        res.json(generatedContentService.listQuizzes(req.courseId, req.user.id));
    });

    router.get("/quizzes/:quizId", function(req, res) {
        const quizId = positiveInteger(req.params.quizId, "quizId");
        res.json(generatedContentService.getQuiz(quizId, req.courseId, req.user.id));
    });

    router.delete("/quizzes/:quizId", function(req, res) {
        const quizId = positiveInteger(req.params.quizId, "quizId");
        generatedContentService.deleteQuiz(quizId, req.courseId, req.user.id);
        res.status(204).end();
    });

    return router;
}

function createLegacyAiRouter({
    materialService,
    studyGuideService,
    quizGenerationService,
    aiUsageGuard,
    analyticsService
}) {
    const router = express.Router();

    router.post(
        "/study-guide",
        asyncHandler(async function(req, res) {
            requestObject(req.body);
            const course = materialService.legacyCourse(req.user.id);
            const guide = await aiUsageGuard.execute(req.user.id, () =>
                studyGuideService.generate({
                    courseId: course.id,
                    userId: req.user.id,
                    materialIds: req.body.materialIds
                })
            );
            analyticsService?.trackEvent({ userId: req.user.id, eventName: "study_guide_generated", courseId: course.id, entityType: "study_guide", entityId: guide.id });
            analyticsService?.trackEvent({ userId: req.user.id, eventName: "study_activity_completed", courseId: course.id, entityType: "study_guide", entityId: guide.id, metadata: { activityType: "study_guide" } });
            res.json({
                success: true,
                studyGuide: guide.generatedContent,
                studyGuideId: guide.id
            });
        })
    );

    router.post(
        "/quiz",
        asyncHandler(async function(req, res) {
            requestObject(req.body);
            const course = materialService.legacyCourse(req.user.id);
            const generated = await aiUsageGuard.execute(req.user.id, () =>
                quizGenerationService.generate({
                    courseId: course.id,
                    userId: req.user.id,
                    materialIds: req.body.materialIds,
                    questionCount: req.body.questionCount
                })
            );
            analyticsService?.trackEvent({ userId: req.user.id, eventName: "quiz_generated", courseId: course.id, entityType: "quiz", entityId: generated.id, metadata: { questionCount: generated.quiz.questions.length } });
            analyticsService?.trackEventOnce({ userId: req.user.id, eventName: "onboarding_step_completed", courseId: course.id, metadata: { step: "study" }, dedupeKey: "step:study" });
            res.json({
                success: true,
                quiz: generated.quiz,
                quizId: generated.id
            });
        })
    );

    router.use(function legacyAiErrorHandler(error, req, res, next) {
        if (res.headersSent) {
            return next(error);
        }

        const messages = {
            VALIDATION_ERROR: req.path.includes("quiz")
                ? "Invalid quiz request."
                : "No materials were selected.",
            MATERIAL_CONTEXT_INVALID: "No materials were found."
        };

        return res.status(error.status || 500).json({
            error: messages[error.code] ||
                (error.expose ? error.message : "Could not generate study content.")
        });
    });

    return router;
}

module.exports = {
    createCourseAiRouter,
    createLegacyAiRouter
};
