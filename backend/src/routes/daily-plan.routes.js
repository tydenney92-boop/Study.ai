const express = require("express");
const { validationError } = require("../utils/validation");

function createDailyPlanRouter({ dailyPlanService }) {
    const router = express.Router();
    router.get("/", (req, res) => {
        const minutes = req.query.minutes === undefined ? 45 : Number(req.query.minutes);
        if (!Number.isInteger(minutes) || minutes < 5 || minutes > 240) {
            throw validationError("minutes must be a whole number from 5 to 240.", { field: "minutes" });
        }
        const timezoneOffset = req.query.timezoneOffset === undefined ? 0 : Number(req.query.timezoneOffset);
        if (!Number.isInteger(timezoneOffset) || timezoneOffset < -840 || timezoneOffset > 840) {
            throw validationError("timezoneOffset must be a valid browser offset.", { field: "timezoneOffset" });
        }
        const excludedIds = String(req.query.exclude || "").split(",").filter(Boolean);
        if (excludedIds.length > 40 || excludedIds.some(id => id.length > 180)) {
            throw validationError("exclude contains too many plan items.", { field: "exclude" });
        }
        res.json(dailyPlanService.generate(req.user.id, { minutes, excludedIds, timezoneOffset }));
    });
    return router;
}

module.exports = { createDailyPlanRouter };
