const express = require("express");
const {
    positiveInteger,
    requestObject,
    requireAtLeastOne,
    stringField
} = require("../utils/validation");

function unitInput(body, partial = false) {
    requestObject(body);

    const input = {
        name: stringField(body, "name", {
            optional: partial,
            maxLength: 200
        }),
        unitNumber: body.unitNumber === undefined && partial
            ? undefined
            : positiveInteger(body.unitNumber, "unitNumber")
    };

    return partial ? requireAtLeastOne(input) : input;
}

function createUnitsRouter({ unitsService }) {
    const router = express.Router({ mergeParams: true });

    router.use(function parseCourse(req, res, next) {
        req.courseId = positiveInteger(req.params.courseId, "courseId");
        next();
    });

    router.get("/", function(req, res) {
        res.json(unitsService.list(req.courseId, req.user.id));
    });

    router.post("/", function(req, res) {
        const unit = unitsService.create(
            req.courseId,
            req.user.id,
            unitInput(req.body)
        );
        res.status(201).json(unit);
    });

    router.get("/:unitId", function(req, res) {
        const unitId = positiveInteger(req.params.unitId, "unitId");
        res.json(
            unitsService.requireOwned(unitId, req.courseId, req.user.id)
        );
    });

    router.patch("/:unitId", function(req, res) {
        const unitId = positiveInteger(req.params.unitId, "unitId");
        res.json(
            unitsService.update(
                unitId,
                req.courseId,
                req.user.id,
                unitInput(req.body, true)
            )
        );
    });

    router.delete("/:unitId", function(req, res) {
        const unitId = positiveInteger(req.params.unitId, "unitId");
        unitsService.delete(unitId, req.courseId, req.user.id);
        res.status(204).end();
    });

    return router;
}

module.exports = {
    createUnitsRouter
};
