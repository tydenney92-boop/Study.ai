const express = require("express");
const {
    positiveInteger,
    requestObject,
    requireAtLeastOne,
    stringField
} = require("../utils/validation");
const { asyncHandler } = require("../utils/async-handler");

function courseInput(body, partial = false) {
    requestObject(body);

    const changes = {
        courseName: stringField(body, "courseName", {
            optional: partial,
            maxLength: 200
        }),
        courseCode: stringField(body, "courseCode", {
            optional: partial,
            maxLength: 50
        }),
        semester: stringField(body, "semester", {
            optional: partial,
            allowEmpty: true,
            maxLength: 100
        })
    };

    return partial ? requireAtLeastOne(changes) : changes;
}

function createCoursesRouter({ coursesService }) {
    const router = express.Router();

    router.get("/", function(req, res) {
        res.json(coursesService.list(req.user.id));
    });

    router.post("/", function(req, res) {
        const course = coursesService.create(
            req.user.id,
            courseInput(req.body)
        );
        res.status(201).json(course);
    });

    router.get("/:courseId", function(req, res) {
        const courseId = positiveInteger(req.params.courseId, "courseId");
        res.json(coursesService.requireOwned(courseId, req.user.id));
    });

    router.patch("/:courseId", function(req, res) {
        const courseId = positiveInteger(req.params.courseId, "courseId");
        res.json(
            coursesService.update(
                courseId,
                req.user.id,
                courseInput(req.body, true)
            )
        );
    });

    router.post("/:courseId/open", function(req, res) {
        const courseId = positiveInteger(req.params.courseId, "courseId");
        res.json(coursesService.markOpened(courseId, req.user.id));
    });

    router.delete("/:courseId", asyncHandler(async function(req, res) {
        const courseId = positiveInteger(req.params.courseId, "courseId");
        await coursesService.delete(courseId, req.user.id);
        res.status(204).end();
    }));

    return router;
}

module.exports = {
    createCoursesRouter
};
