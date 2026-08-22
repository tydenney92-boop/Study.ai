const { validationError } = require("../utils/validation");
const { callAi } = require("./ai-call");
const { buildFlashcardPrompt } = require("./ai-prompts");
const { parseJsonResponse, validateFlashcards } = require("./ai-response-validation");

function createFlashcardGenerationService({
    aiClient,
    materialContextService,
    flashcardsRepository,
    minCards,
    maxCards,
    defaultCards,
    maxAttempts = 2
}) {
    return {
        async generate({ courseId, userId, materialIds, cardCount }) {
            const normalizedCount = cardCount === undefined
                ? defaultCards
                : Number(cardCount);
            if (
                !Number.isInteger(normalizedCount) ||
                normalizedCount < minCards ||
                normalizedCount > maxCards
            ) {
                throw validationError(
                    `cardCount must be an integer from ${minCards} through ${maxCards}.`,
                    { field: "cardCount", min: minCards, max: maxCards }
                );
            }

            const context = materialContextService.resolve({
                courseId,
                userId,
                materialIds
            });
            let cards;
            let lastError;
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                const escalated = attempt === maxAttempts && attempt > 1;
                try {
                    const response = await callAi(
                        aiClient,
                        buildFlashcardPrompt(context.courseContent, normalizedCount),
                        {
                            workflow: "flashcard_generation",
                            tier: escalated ? "standard" : "fast",
                            escalated
                        }
                    );
                    cards = validateFlashcards(
                        parseJsonResponse(response),
                        normalizedCount
                    );
                    break;
                } catch (error) {
                    if (error.code !== "AI_OUTPUT_INVALID") throw error;
                    lastError = error;
                }
            }

            if (!cards) throw lastError;

            return flashcardsRepository.createBatch({
                courseId,
                userId,
                materialIds: context.materialIds,
                cards
            });
        }
    };
}

module.exports = { createFlashcardGenerationService };
