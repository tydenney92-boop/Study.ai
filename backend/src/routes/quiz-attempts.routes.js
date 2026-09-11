const express = require("express");
const { positiveInteger, requestObject } = require("../utils/validation");
const { scoreBand } = require("../services/analytics.service");

function createQuizAttemptsRouter({ quizAttemptService, analyticsService }) {
    const router = express.Router({ mergeParams: true });

    router.use(function parseQuiz(req, res, next) {
        req.quizId = positiveInteger(req.params.quizId, "quizId");
        next();
    });

    router.post("/", function(req, res) {
        requestObject(req.body);
        const attempt = quizAttemptService.create({
            quizId: req.quizId,
            userId: req.user.id,
            score: req.body.score,
            answers: req.body.answers,
            results: req.body.results
        });
        analyticsService?.trackEvent({ userId: req.user.id, eventName: "quiz_completed", entityType: "quiz", entityId: req.quizId, metadata: { scoreBand: scoreBand(attempt.score) } });
        analyticsService?.trackEvent({ userId: req.user.id, eventName: "study_activity_completed", entityType: "quiz", entityId: req.quizId, metadata: { activityType: "quiz" } });
        analyticsService?.trackEventOnce({ userId: req.user.id, eventName: "onboarding_step_completed", metadata: { step: "study" }, dedupeKey: "step:study" });
        res.status(201).json(attempt);
    });

    router.get("/", function(req, res) {
        res.json(quizAttemptService.list(req.quizId, req.user.id));
    });

    return router;
}

module.exports = {
    createQuizAttemptsRouter
};
