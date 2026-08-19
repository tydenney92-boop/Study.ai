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
    defaultCards
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
            const response = await callAi(
                aiClient,
                buildFlashcardPrompt(context.courseContent, normalizedCount)
            );
            const cards = validateFlashcards(
                parseJsonResponse(response),
                normalizedCount
            );

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
