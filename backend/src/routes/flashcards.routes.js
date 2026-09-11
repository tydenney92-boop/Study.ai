const express = require("express");
const { asyncHandler } = require("../utils/async-handler");
const { positiveInteger, requestObject } = require("../utils/validation");

function createFlashcardsRouter({ flashcardService, flashcardGenerationService, aiUsageGuard, analyticsService }) {
    const router = express.Router({ mergeParams: true });

    router.use((req, res, next) => {
        req.courseId = positiveInteger(req.params.courseId, "courseId");
        next();
    });

    router.get("/", (req, res) => {
        const materialId = req.query.materialId === undefined
            ? null
            : positiveInteger(req.query.materialId, "materialId");
        res.json(flashcardService.list(req.courseId, req.user.id, materialId));
    });

    router.post("/", (req, res) => {
        requestObject(req.body);
        res.status(201).json(
            flashcardService.create(req.courseId, req.user.id, req.body)
        );
    });

    router.post("/generate", asyncHandler(async (req, res) => {
        requestObject(req.body);
        const cards = await aiUsageGuard.execute(req.user.id, () =>
            flashcardGenerationService.generate({
                courseId: req.courseId,
                userId: req.user.id,
                materialIds: req.body.materialIds,
                cardCount: req.body.cardCount
            })
        );
        analyticsService?.trackEvent({ userId: req.user.id, eventName: "flashcards_generated", courseId: req.courseId, metadata: { cardCount: cards.length } });
        analyticsService?.trackEventOnce({ userId: req.user.id, eventName: "onboarding_step_completed", courseId: req.courseId, metadata: { step: "study" }, dedupeKey: "step:study" });
        res.status(201).json({ flashcards: cards });
    }));

    router.patch("/:flashcardId", (req, res) => {
        requestObject(req.body);
        const flashcardId = positiveInteger(req.params.flashcardId, "flashcardId");
        res.json(flashcardService.update(
            flashcardId, req.courseId, req.user.id, req.body
        ));
    });

    router.delete("/:flashcardId", (req, res) => {
        const flashcardId = positiveInteger(req.params.flashcardId, "flashcardId");
        flashcardService.delete(flashcardId, req.courseId, req.user.id);
        res.status(204).end();
    });

    router.post("/:flashcardId/reviews", (req, res) => {
        requestObject(req.body);
        const flashcardId = positiveInteger(req.params.flashcardId, "flashcardId");
        const review = flashcardService.review(
            flashcardId, req.courseId, req.user.id, req.body.outcome
        );
        analyticsService?.trackEvent({ userId: req.user.id, eventName: "flashcards_reviewed", courseId: req.courseId, entityType: "flashcard", entityId: flashcardId, metadata: { outcome: req.body.outcome } });
        analyticsService?.trackEvent({ userId: req.user.id, eventName: "study_activity_completed", courseId: req.courseId, entityType: "flashcard", entityId: flashcardId, metadata: { activityType: "flashcards" } });
        analyticsService?.trackEventOnce({ userId: req.user.id, eventName: "onboarding_step_completed", courseId: req.courseId, metadata: { step: "study" }, dedupeKey: "step:study" });
        res.status(201).json(review);
    });

    return router;
}

module.exports = { createFlashcardsRouter };
