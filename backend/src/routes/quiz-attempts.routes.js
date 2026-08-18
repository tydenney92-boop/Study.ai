const express = require("express");
const { positiveInteger, requestObject } = require("../utils/validation");

function createQuizAttemptsRouter({ quizAttemptService }) {
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
