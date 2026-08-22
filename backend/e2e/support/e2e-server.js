const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createApp } = require("../../src/app");
const { createFakeAiClient } = require("./fake-ai-client");

const port = Number(process.env.E2E_PORT || 4173);
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "study-signal-e2e-"));
const fakeAiClient = createFakeAiClient();
const app = createApp({
    aiClient: fakeAiClient,
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
        passwordRounds: 4,
        secureCookies: false,
        trustProxyHops: 0,
        aiEnabled: true,
        aiRateLimitMaxRequests: 1000,
        aiMaxConcurrentRequests: 4
    },
    registerTestRoutes(testApp) {
        testApp.get("/api/e2e/ai-counts", (req, res) => res.json(fakeAiClient.counts));
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
