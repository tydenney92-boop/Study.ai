const express = require("express");
const { asyncHandler } = require("../utils/async-handler");
const { positiveInteger, requestObject } = require("../utils/validation");

function createCourseAiRouter({
    studyGuideService,
    quizGenerationService,
    aiUsageGuard
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
            res.status(201).json(guide);
        })
    );

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
            res.status(201).json(quiz);
        })
    );

    return router;
}

function createLegacyAiRouter({
    materialService,
    studyGuideService,
    quizGenerationService,
    aiUsageGuard
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
