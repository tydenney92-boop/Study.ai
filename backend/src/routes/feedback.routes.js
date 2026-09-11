const express = require("express");

function createFeedbackRouter({ feedbackService }) {
    const router = express.Router();
    router.post("/", (req, res) => {
        res.status(201).json(feedbackService.submit(req.user.id, req.body));
    });
    return router;
}

module.exports = { createFeedbackRouter };
