const express = require("express");
const { asyncHandler } = require("../utils/async-handler");
const { AppError } = require("../utils/app-error");

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

function createAuthRouter({ authService, demoService, requireAuthentication, cookieName }) {
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

    router.post("/demo", asyncHandler(async (req, res) => {
        const { user } = demoService.create();
        await establishSession(req, user);
        req.session.isDemo = true;
        await saveSession(req);
        res.status(201).json({ user: authService.publicUser(user) });
    }));

    router.post("/logout", (req, res, next) => {
        req.session.destroy(error => {
            if (error) return next(error);
            res.clearCookie(cookieName, { path: "/" });
            return res.status(204).end();
        });
    });

    router.post("/demo/exit", requireAuthentication, asyncHandler(async (req, res) => {
        if (!req.user.isDemo || req.session?.isDemo !== true) {
            throw new AppError({
                code: "DEMO_SESSION_REQUIRED",
                message: "This session is not a demo.",
                status: 400
            });
        }
        const userId = req.user.id;
        await new Promise((resolve, reject) => req.session.destroy(error => error ? reject(error) : resolve()));
        const removed = demoService.exit(userId);
        if (!removed) throw new AppError({ code: "DEMO_NOT_FOUND", message: "Demo session is unavailable.", status: 404 });
        res.clearCookie(cookieName, { path: "/" });
        res.status(204).end();
    }));

    router.get("/me", requireAuthentication, (req, res) => {
        res.json({ user: authService.publicUser(req.user) });
    });

    return router;
}

module.exports = { createAuthRouter };
