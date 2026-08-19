const { AppError } = require("../utils/app-error");

function createGeneratedContentService({
    coursesService,
    studyGuidesRepository,
    quizzesRepository,
    quizAttemptsRepository
}) {
    function requireGuide(guideId, courseId, userId) {
        coursesService.requireOwned(courseId, userId);
        const guide = studyGuidesRepository.findOwned(guideId, userId, courseId);
        if (!guide) {
            throw new AppError({
                code: "STUDY_GUIDE_NOT_FOUND",
                message: "Study guide not found in this course.",
                status: 404
            });
        }
        return guide;
    }

    function requireQuiz(quizId, courseId, userId) {
        coursesService.requireOwned(courseId, userId);
        const quiz = quizzesRepository.findOwned(quizId, userId, courseId);
        if (!quiz) {
            throw new AppError({
                code: "QUIZ_NOT_FOUND",
                message: "Quiz not found in this course.",
                status: 404
            });
        }
        return quiz;
    }

    return {
        listStudyGuides(courseId, userId) {
            coursesService.requireOwned(courseId, userId);
            return studyGuidesRepository.listOwned(courseId, userId);
        },
        getStudyGuide: requireGuide,
        deleteStudyGuide(guideId, courseId, userId) {
            requireGuide(guideId, courseId, userId);
            studyGuidesRepository.deleteOwned(guideId, courseId, userId);
        },
        listQuizzes(courseId, userId) {
            coursesService.requireOwned(courseId, userId);
            return quizzesRepository.listOwned(courseId, userId);
        },
        getQuiz(quizId, courseId, userId) {
            const quiz = requireQuiz(quizId, courseId, userId);
            quiz.attempts = quizAttemptsRepository.listOwned(quizId, userId);
            return quiz;
        },
        deleteQuiz(quizId, courseId, userId) {
            requireQuiz(quizId, courseId, userId);
            quizzesRepository.deleteOwned(quizId, courseId, userId);
        }
    };
}

module.exports = { createGeneratedContentService };
