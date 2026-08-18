const express = require("express");
const { asyncHandler } = require("../utils/async-handler");

function regenerateSession(req) {
    return new Promise((resolve, reject) => {
        req.session.regenerate(error => error ? reject(error) : resolve());
    });
}

function saveSession(req) {
    return new Promise((resolve, reject) => {
        req.session.save(error => error ? reject(error) : resolve());
    });
}

function createAuthRouter({ authService, requireAuthentication, cookieName }) {
    const router = express.Router();

    async function establishSession(req, user) {
        await regenerateSession(req);
        req.session.userId = user.id;
        await saveSession(req);
    }

    router.post("/register", asyncHandler(async (req, res) => {
        const user = await authService.register(req.body);
        await establishSession(req, user);
        res.status(201).json({ user });
    }));

    router.post("/login", asyncHandler(async (req, res) => {
        const user = await authService.login(req.body);
        await establishSession(req, user);
        res.json({ user });
    }));

    router.post("/logout", (req, res, next) => {
        req.session.destroy(error => {
            if (error) return next(error);
            res.clearCookie(cookieName, { path: "/" });
            return res.status(204).end();
        });
    });

    router.get("/me", requireAuthentication, (req, res) => {
        res.json({ user: authService.publicUser(req.user) });
    });

    return router;
}

module.exports = { createAuthRouter };
