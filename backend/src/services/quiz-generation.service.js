const { AppError } = require("../utils/app-error");
const { validationError } = require("../utils/validation");
const { callAi } = require("./ai-call");
const {
    buildQuizPrompt,
    buildQuizVerificationPrompt
} = require("./ai-prompts");
const {
    parseJsonResponse,
    validateQuiz,
    validateVerification
} = require("./ai-response-validation");

const ALLOWED_QUESTION_COUNTS = [5, 10, 15, 20];

function createQuizGenerationService({
    aiClient,
    materialContextService,
    quizzesRepository,
    maxAttempts = 3,
    minQuestionCount = 5,
    maxQuestionCount = 20
}) {
    return {
        async generate({ courseId, userId, materialIds, questionCount }) {
            const allowedCounts = ALLOWED_QUESTION_COUNTS.filter(count =>
                count >= minQuestionCount && count <= maxQuestionCount
            );
            const normalizedCount = questionCount === undefined || questionCount === null
                ? (allowedCounts.includes(10) ? 10 : allowedCounts[0])
                : Number(questionCount);

            if (!allowedCounts.includes(normalizedCount)) {
                throw validationError(
                    `questionCount must be one of: ${allowedCounts.join(", ")}.`,
                    {
                        field: "questionCount",
                        allowedQuestionCounts: allowedCounts
                    }
                );
            }

            const context = materialContextService.resolve({
                courseId,
                userId,
                materialIds
            });
            let lastIssues = [];

            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    const generatedResponse = await callAi(
                        aiClient,
                        buildQuizPrompt(context.courseContent, normalizedCount)
                    );
                    const quiz = validateQuiz(
                        parseJsonResponse(generatedResponse),
                        normalizedCount
                    );
                    const verificationResponse = await callAi(
                        aiClient,
                        buildQuizVerificationPrompt(quiz, context.courseContent)
                    );
                    const verification = validateVerification(
                        verificationResponse
                    );

                    if (!verification.valid) {
                        lastIssues = verification.issues;
                        continue;
                    }

                    return quizzesRepository.createWithMaterials({
                        userId,
                        courseId,
                        materialIds: context.materialIds,
                        quiz
                    });
                } catch (error) {
                    if (error.code !== "AI_OUTPUT_INVALID") {
                        throw error;
                    }

                    lastIssues = [error.message];
                }
            }

            throw new AppError({
                code: "AI_QUIZ_GENERATION_FAILED",
                message: "The AI could not generate and verify a valid quiz.",
                status: 502,
                details: { issues: lastIssues }
            });
        }
    };
}

module.exports = {
    ALLOWED_QUESTION_COUNTS,
    createQuizGenerationService
};
