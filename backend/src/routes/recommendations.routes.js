const express = require("express");
const { positiveInteger } = require("../utils/validation");

function createRecommendationsRouter({ recommendationsService }) {
    const router = express.Router({ mergeParams: true });
    router.get("/", function(req, res) {
        const courseId = positiveInteger(req.params.courseId, "courseId");
        res.json(recommendationsService.course(courseId, req.user.id));
    });
    return router;
}

module.exports = { createRecommendationsRouter };
