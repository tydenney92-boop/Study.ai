const express = require("express");

function createAnalyticsRouter({ analyticsService }) {
    const router = express.Router();
    router.post("/events", (req, res) => {
        res.status(202).json(analyticsService.recordClientEvent(req.user.id, req.body));
    });
    return router;
}

function createInternalAnalyticsRouter({ analyticsService, enabled }) {
    const router = express.Router();
    router.get("/", (req, res, next) => {
        if (!enabled) return next();
        res.json(analyticsService.dashboard());
    });
    return router;
}

module.exports = { createAnalyticsRouter, createInternalAnalyticsRouter };
