const express = require("express");
const { asyncHandler } = require("../utils/async-handler");
const { positiveInteger, requestObject } = require("../utils/validation");

function createAskNotesRouter({ askNotesService, conversationService, aiUsageGuard }) {
    const router = express.Router({ mergeParams: true });

    router.use((req, res, next) => {
        req.courseId = positiveInteger(req.params.courseId, "courseId");
        next();
    });

    router.get("/conversations", (req, res) => {
        res.json(conversationService.list(req.courseId, req.user.id));
    });

    router.post("/conversations", (req, res) => {
        requestObject(req.body);
        res.status(201).json(conversationService.create(req.courseId, req.user.id));
    });

    router.get("/conversations/:conversationId", (req, res) => {
        const conversationId = positiveInteger(req.params.conversationId, "conversationId");
        res.json(conversationService.get(conversationId, req.courseId, req.user.id));
    });

    router.post("/", asyncHandler(async (req, res) => {
        requestObject(req.body);
        const conversationId = req.body.conversationId === undefined || req.body.conversationId === null
            ? null
            : positiveInteger(req.body.conversationId, "conversationId");
        const result = await aiUsageGuard.execute(req.user.id, () =>
            askNotesService.ask({
                courseId: req.courseId,
                userId: req.user.id,
                materialIds: req.body.materialIds,
                question: req.body.question,
                conversationId
            })
        );
        res.json(result);
    }));

    return router;
}

module.exports = { createAskNotesRouter };
