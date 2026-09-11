const express = require("express");
const { requestObject, stringField, validationError } = require("../utils/validation");

function createOnboardingRouter({ onboardingService }) {
    const router = express.Router();
    router.get("/", (req, res) => res.json(onboardingService.status(req.user.id)));
    router.patch("/", (req, res) => {
        requestObject(req.body);
        const action = stringField(req.body, "action", { maxLength: 40 });
        const result = onboardingService.update(req.user.id, action);
        if (!result) throw validationError("action is not supported.", { field: "action" });
        res.json(result);
    });
    return router;
}

module.exports = { createOnboardingRouter };
