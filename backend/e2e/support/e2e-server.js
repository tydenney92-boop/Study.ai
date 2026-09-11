const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createApp } = require("../../src/app");
const { createFakeAiClient } = require("./fake-ai-client");
const { createFakeOcrProvider } = require("./fake-ocr-provider");

const port = Number(process.env.E2E_PORT || 4173);
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "study-signal-e2e-"));
const fakeAiClient = createFakeAiClient();
const fakeOcrProvider = createFakeOcrProvider();
let canvasRevision = 0;
const fakeCanvasProvider = {
    async listCourses() { return [{ externalId: "canvas-econ", name: "Canvas Economics", code: "ECON 388", term: "Fall 2026" }]; },
    async listAssignments() { const revision = canvasRevision++; return [{ externalId: "canvas-assignment-1", externalCourseId: "canvas-econ", title: "Canvas Problem Set", type: "assignment", description: "Imported safely", dueAt: revision ? "2026-10-03T05:59:00.000Z" : "2026-09-22T05:59:00.000Z", startAt: null, externalUrl: "https://canvas.test/assignments/1", externalUpdatedAt: revision ? "2026-09-10T00:00:00.000Z" : "2026-09-01T00:00:00.000Z", externalStatus: revision ? "submitted" : "unsubmitted", externalSubmissionType: "online_upload" }]; }
};
const app = createApp({
    aiClient: fakeAiClient,
    ocrProvider: fakeOcrProvider,
    ocrOutput: { log() {} },
    lmsProviderRegistry: { create() { return fakeCanvasProvider; } },
    canvasOAuthClient: {
        async exchangeCode() {
            return {
                accessToken: "fake-canvas-access",
                refreshToken: "fake-canvas-refresh",
                tokenExpiresAt: "2099-01-01T00:00:00.000Z",
                providerUserId: "fake-canvas-user"
            };
        },
        async refresh() { throw new Error("Fake Canvas token should not expire."); },
        async revoke() { return true; }
    },
    config: {
        environment: "test",
        isProduction: false,
        host: "127.0.0.1",
        port,
        appOrigin: `http://127.0.0.1:${port}`,
        frontendOrigin: `http://127.0.0.1:${port}`,
        frontendDirectory: path.resolve(__dirname, "../../.."),
        serveFrontend: true,
        databaseDriver: "sqlite",
        databasePath: path.join(temporaryDirectory, "e2e.db"),
        backupDirectory: path.join(temporaryDirectory, "backups"),
        migrationBackup: false,
        storageDriver: "local",
        uploadDirectory: path.join(temporaryDirectory, "uploads"),
        sessionSecret: "study-signal-e2e-session-secret",
        lmsEncryptionKey: "study-signal-e2e-lms-encryption-key",
        canvasClientId: "fake-canvas-client",
        canvasClientSecret: "fake-canvas-secret",
        canvasBaseUrl: `http://127.0.0.1:${port}`,
        canvasRedirectUri: `http://127.0.0.1:${port}/api/lms/canvas/callback`,
        passwordRounds: 4,
        secureCookies: false,
        trustProxyHops: 0,
        aiEnabled: true,
        ocrEnabled: true,
        aiRateLimitMaxRequests: 1000,
        aiMaxConcurrentRequests: 4
    },
    registerTestRoutes(testApp) {
        testApp.get("/login/oauth2/auth", (req, res) => {
            const state = /^[a-f0-9]{48}$/.test(String(req.query.state || "")) ? req.query.state : "invalid";
            res.type("html").send(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"></head><body><main><h1>Fake Canvas authorization</h1><p>Study Signal is requesting read access to courses and assignments.</p><form method="get" action="http://127.0.0.1:${port}/api/lms/canvas/callback"><input type="hidden" name="code" value="fake-authorization-code"><input type="hidden" name="state" value="${state}"><button type="submit">Authorize Study Signal</button></form></main></body></html>`);
        });
        testApp.get("/api/e2e/ai-counts", (req, res) => res.json(fakeAiClient.counts));
        testApp.get("/api/e2e/ocr-counts", (req, res) => res.json({ total: fakeOcrProvider.count }));
        testApp.post("/api/e2e/ai-counts/reset", (req, res) => {
            fakeAiClient.reset();
            res.json(fakeAiClient.counts);
        });
    }
});

const server = app.listen(port, "127.0.0.1", () => {
    console.log(`Study Signal E2E server listening on 127.0.0.1:${port}`);
});

let closing = false;
function shutdown(exitCode = 0) {
    if (closing) return;
    closing = true;
    server.close(() => {
        app.locals.sessionStore?.close?.();
        app.locals.database?.close?.();
        fs.rmSync(temporaryDirectory, { recursive: true, force: true });
        process.exit(exitCode);
    });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("uncaughtException", error => {
    console.error(error);
    shutdown(1);
});
