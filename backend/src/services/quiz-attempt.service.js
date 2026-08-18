const { AppError } = require("../utils/app-error");
const { validationError } = require("../utils/validation");

function structuredJsonValue(value, fieldName) {
    if (
        value === null ||
        typeof value !== "object" ||
        (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype)
    ) {
        throw validationError(`${fieldName} must be an object or array.`, {
            field: fieldName
        });
    }

    return value;
}

function createQuizAttemptService({ quizzesRepository, quizAttemptsRepository }) {
    function requireOwnedQuiz(quizId, userId) {
        const quiz = quizzesRepository.findOwned(quizId, userId);

        if (!quiz) {
            throw new AppError({
                code: "QUIZ_NOT_FOUND",
                message: "Quiz not found.",
                status: 404
            });
        }

        return quiz;
    }

    return {
        create({ quizId, userId, score, answers, results }) {
            requireOwnedQuiz(quizId, userId);
            const normalizedScore = Number(score);

            if (
                !Number.isFinite(normalizedScore) ||
                normalizedScore < 0 ||
                normalizedScore > 100
            ) {
                throw validationError("score must be between 0 and 100.", {
                    field: "score"
                });
            }

            return quizAttemptsRepository.create({
                quizId,
                userId,
                score: normalizedScore,
                answers: structuredJsonValue(answers, "answers"),
                results: results === undefined || results === null
                    ? null
                    : structuredJsonValue(results, "results")
            });
        },

        list(quizId, userId) {
            requireOwnedQuiz(quizId, userId);
            return quizAttemptsRepository.listOwned(quizId, userId);
        }
    };
}

module.exports = {
    createQuizAttemptService
};
