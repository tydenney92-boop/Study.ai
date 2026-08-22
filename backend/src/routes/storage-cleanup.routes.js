const express = require("express");
const { asyncHandler } = require("../utils/async-handler");

function createStorageCleanupRouter({ storageCleanupService }) {
    const router = express.Router();
    router.post("/reconcile", asyncHandler(async (req, res) => {
        res.json(await storageCleanupService.reconcileUser(req.user.id));
    }));
    return router;
}

module.exports = { createStorageCleanupRouter };
