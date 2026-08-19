const express = require("express");
const { positiveInteger } = require("../utils/validation");

function createProgressRouter({ progressService }) {
    const router = express.Router();

    router.get("/", function(req, res) {
        res.json(progressService.overall(req.user.id));
    });

    return router;
}

function createCourseProgressRouter({ progressService }) {
    const router = express.Router({ mergeParams: true });

    router.get("/", function(req, res) {
        const courseId = positiveInteger(req.params.courseId, "courseId");
        res.json(progressService.course(courseId, req.user.id));
    });

    return router;
}

module.exports = { createProgressRouter, createCourseProgressRouter };
