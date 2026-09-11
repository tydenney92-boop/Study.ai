const express = require("express");
const crypto = require("crypto");
const { positiveInteger, requestObject } = require("../utils/validation");
const { asyncHandler } = require("../utils/async-handler");
const { AppError } = require("../utils/app-error");

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function canvasConfigured(config) {
    return Boolean(
        config.canvasClientId &&
        config.canvasClientSecret &&
        config.canvasBaseUrl &&
        config.canvasRedirectUri &&
        config.lmsEncryptionKey
    );
}

function secureStateMatch(expected, actual) {
    if (typeof expected !== "string" || typeof actual !== "string") return false;
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(actual);
    return expectedBuffer.length === actualBuffer.length &&
        crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function consumeOAuthState(request, suppliedState, now) {
    const saved = request.session.canvasOAuthState;
    delete request.session.canvasOAuthState;
    if (!saved || !Number.isFinite(saved.issuedAt)) return false;
    if (now - saved.issuedAt < 0 || now - saved.issuedAt > OAUTH_STATE_TTL_MS) return false;
    return secureStateMatch(saved.value, suppliedState);
}

function createLmsRouter({ service, config, oauthClient, clock = () => Date.now() }) {
    const router = express.Router();

    router.get("/", (req, res) => {
        res.json({
            connections: service.list(req.user.id),
            canvasConfigured: canvasConfigured(config)
        });
    });

    router.get("/canvas/connect", (req, res) => {
        if (!canvasConfigured(config) || !oauthClient) {
            throw new AppError({
                code: "LMS_NOT_CONFIGURED",
                message: "Canvas OAuth is not configured for this deployment.",
                status: 503
            });
        }
        const state = crypto.randomBytes(24).toString("hex");
        req.session.canvasOAuthState = { value: state, issuedAt: clock() };
        const url = new URL("/login/oauth2/auth", config.canvasBaseUrl);
        url.search = new URLSearchParams({
            client_id: config.canvasClientId,
            response_type: "code",
            state,
            redirect_uri: config.canvasRedirectUri
        }).toString();
        res.redirect(url.href);
    });

    router.get("/canvas/callback", asyncHandler(async (req, res) => {
        if (!canvasConfigured(config) || !oauthClient) {
            throw new AppError({
                code: "LMS_NOT_CONFIGURED",
                message: "Canvas OAuth is not configured for this deployment.",
                status: 503
            });
        }
        if (!consumeOAuthState(req, req.query.state, clock())) {
            throw new AppError({
                code: "LMS_OAUTH_INVALID",
                message: "Canvas authorization could not be verified. Start the connection again.",
                status: 400
            });
        }
        if (req.query.error) {
            return res.redirect("/planner.html?lms=denied");
        }
        if (typeof req.query.code !== "string" || !req.query.code) {
            throw new AppError({
                code: "LMS_OAUTH_INVALID",
                message: "Canvas authorization did not return a usable code.",
                status: 400
            });
        }
        const token = await oauthClient.exchangeCode(req.query.code);
        service.connect(req.user.id, {
            baseUrl: config.canvasBaseUrl,
            accessToken: token.accessToken,
            refreshToken: token.refreshToken,
            tokenExpiresAt: token.tokenExpiresAt,
            providerUserId: token.providerUserId
        });
        return res.redirect("/planner.html?lms=connected");
    }));

    router.get("/:id/courses", asyncHandler(async (req, res) => {
        res.json(await service.courses(positiveInteger(req.params.id, "id"), req.user.id));
    }));
    router.get("/:id/mappings", (req, res) => {
        res.json(service.mappings(positiveInteger(req.params.id, "id"), req.user.id));
    });
    router.put("/:id/mappings", (req, res) => {
        requestObject(req.body);
        res.json(service.map(
            positiveInteger(req.params.id, "id"),
            req.user.id,
            req.body.mappings
        ));
    });
    router.post("/:id/sync", asyncHandler(async (req, res) => {
        res.json(await service.sync(positiveInteger(req.params.id, "id"), req.user.id));
    }));
    router.delete("/:id", asyncHandler(async (req, res) => {
        res.json(await service.disconnect(positiveInteger(req.params.id, "id"), req.user.id));
    }));

    if (config.environment === "test") {
        router.post("/test-connect", (req, res) => {
            requestObject(req.body);
            res.status(201).json(service.connectForTest(req.user.id, req.body));
        });
    }
    return router;
}

module.exports = {
    createLmsRouter,
    canvasConfigured,
    consumeOAuthState,
    OAUTH_STATE_TTL_MS
};
