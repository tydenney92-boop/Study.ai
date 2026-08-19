const express = require("express");
const { asyncHandler } = require("../utils/async-handler");
const { positiveInteger, requestObject } = require("../utils/validation");

function createAskNotesRouter({ askNotesService, aiUsageGuard }) {
    const router = express.Router({ mergeParams: true });

    router.post("/", asyncHandler(async (req, res) => {
        requestObject(req.body);
        const courseId = positiveInteger(req.params.courseId, "courseId");
        const result = await aiUsageGuard.execute(req.user.id, () =>
            askNotesService.ask({
                courseId,
                userId: req.user.id,
                materialIds: req.body.materialIds,
                question: req.body.question
            })
        );
        res.json(result);
    }));

    return router;
}

module.exports = { createAskNotesRouter };
