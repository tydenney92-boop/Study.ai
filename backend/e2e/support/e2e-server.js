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
    async listAssignments() { const revision = canvasRevision++; return [{ externalId: "canvas-assignment-1", externalCourseId: "canvas-econ", title: "Canvas Problem Set", type: "assignment", description: "Imported safely", dueAt: revision ? "2026-10-03T05:59:00.000Z" : "2026-09-22T05:59:00.000Z", startAt: null, externalUrl: "https://canvas.test/assignments/1", externalUpdatedAt: revision ? "2026-09-10T00:00:00.000Z" : "2026-09-01T00:00:00.000Z", externalStatus: "available" }]; }
};
const app = createApp({
    aiClient: fakeAiClient,
    ocrProvider: fakeOcrProvider,
    ocrOutput: { log() {} },
    lmsProviderRegistry: { create() { return fakeCanvasProvider; } },
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
        passwordRounds: 4,
        secureCookies: false,
        trustProxyHops: 0,
        aiEnabled: true,
        ocrEnabled: true,
        aiRateLimitMaxRequests: 1000,
        aiMaxConcurrentRequests: 4
    },
    registerTestRoutes(testApp) {
        testApp.get("/api/e2e/ai-counts", (req, res) => res.json(fakeAiClient.counts));
        testApp.get("/api/e2e/ocr-counts", (req, res) => res.json({ total: fakeOcrProvider.count }));
        testApp.post("/api/e2e/ai-counts/reset", (req, res) => {
            fakeAiClient.reset();
            res.json(fakeAiClient.counts);
        });
        testApp.get("/api/e2e/analytics-events", (req, res) => {
            const events = testApp.locals.database.prepare(`
                SELECT event_name AS eventName, course_id AS courseId,
                       metadata_json AS metadataJson
                FROM analytics_events WHERE user_id = ? ORDER BY id
            `).all(req.user.id).map(event => ({
                ...event,
                metadata: JSON.parse(event.metadataJson)
            }));
            res.json(events);
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
