const { AppError } = require("../utils/app-error");
const { stringField, requireAtLeastOne, validationError } = require("../utils/validation");

function createFlashcardService({ coursesService, materialService, flashcardsRepository }) {
    function requireCard(flashcardId, courseId, userId) {
        coursesService.requireOwned(courseId, userId);
        const card = flashcardsRepository.findOwned(flashcardId, courseId, userId);
        if (!card) {
            throw new AppError({
                code: "FLASHCARD_NOT_FOUND",
                message: "Flashcard not found in this course.",
                status: 404
            });
        }
        return card;
    }

    function cardFields(input, optional = false) {
        return {
            front: stringField(input, "front", { optional, maxLength: 500 }),
            back: stringField(input, "back", { optional, maxLength: 2000 })
        };
    }

    return {
        list(courseId, userId, materialId = null) {
            coursesService.requireOwned(courseId, userId);
            if (materialId !== null) materialService.get(materialId, courseId, userId);
            return flashcardsRepository.listOwned(courseId, userId, materialId);
        },

        create(courseId, userId, input) {
            coursesService.requireOwned(courseId, userId);
            return flashcardsRepository.createBatch({
                courseId,
                userId,
                materialIds: [],
                cards: [cardFields(input)]
            })[0];
        },

        update(flashcardId, courseId, userId, input) {
            requireCard(flashcardId, courseId, userId);
            const changes = requireAtLeastOne(cardFields(input, true));
            return flashcardsRepository.updateOwned(
                flashcardId,
                courseId,
                userId,
                changes
            );
        },

        review(flashcardId, courseId, userId, outcome) {
            requireCard(flashcardId, courseId, userId);
            if (!["know_it", "still_learning"].includes(outcome)) {
                throw validationError("outcome must be know_it or still_learning.", {
                    field: "outcome"
                });
            }
            return flashcardsRepository.reviewOwned(
                flashcardId,
                courseId,
                userId,
                outcome
            );
        },

        delete(flashcardId, courseId, userId) {
            requireCard(flashcardId, courseId, userId);
            flashcardsRepository.deleteOwned(flashcardId, courseId, userId);
        }
    };
}

module.exports = { createFlashcardService };
