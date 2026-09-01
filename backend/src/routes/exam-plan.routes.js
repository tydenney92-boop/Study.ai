const express = require("express");
const { positiveInteger, requestObject } = require("../utils/validation");

function createExamPlanRouter({ examPlanService }) {
    const router = express.Router({ mergeParams: true });
    router.use((req, res, next) => {
        req.courseId = positiveInteger(req.params.courseId, "courseId");
        next();
    });
    router.get("/", (req, res) => {
        res.json(examPlanService.get(req.courseId, req.user.id));
    });
    router.put("/", (req, res) => {
        requestObject(req.body);
        res.json(examPlanService.save(req.courseId, req.user.id, req.body));
    });
    return router;
}

module.exports = { createExamPlanRouter };
