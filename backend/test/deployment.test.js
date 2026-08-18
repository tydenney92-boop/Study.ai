const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const request = require("supertest");
const { createTestApp } = require("./helpers/test-app");
const { validateProductionConfig } = require("../src/config/validate-config");

function validProductionConfig() {
    return {
        appOrigin: "https://study.example.com",
        sessionSecret: "a-production-secret-that-is-long-enough",
        databaseDriver: "sqlite",
        databasePath: "/data/study.db",
        backupDirectory: "/data/backups",
        storageDriver: "s3",
        objectStorageBucket: "study-materials",
        objectStorageRegion: "auto",
        objectStorageEndpoint: "https://objects.example.com",
        objectStorageAccessKeyId: null,
        objectStorageSecretAccessKey: null,
        uploadDirectory: null,
        aiProvider: "ollama",
        aiEnabled: true,
        ollamaBaseUrl: "https://ollama.internal.example.com",
        ollamaModel: "llama3.2",
        secureCookies: true,
        trustProxyHops: 1,
        serveFrontend: true
    };
}

test("production configuration accepts the supported single-domain architecture", () => {
    assert.doesNotThrow(() => validateProductionConfig(validProductionConfig()));
});

test("production configuration fails closed for missing secrets and unsafe infrastructure", () => {
    const invalid = {
        ...validProductionConfig(),
        appOrigin: "http://study.example.com",
        sessionSecret: "short",
        databasePath: null,
        secureCookies: false,
        trustProxyHops: 0,
        serveFrontend: false,
        storageDriver: "filesystem"
    };
    assert.throws(
        () => validateProductionConfig(invalid),
        error => error.code === "INVALID_PRODUCTION_CONFIG" &&
            error.message.includes("SESSION_SECRET") &&
            error.message.includes("HTTPS") &&
            error.message.includes("DATABASE_PATH")
    );
});

test("production cookies are secure, HTTP-only, and same-site", async t => {
    const context = createTestApp({
        config: {
            environment: "production",
            isProduction: true,
            secureCookies: true,
            trustProxyHops: 1
        }
    });
    t.after(context.cleanup);

    const response = await request(context.app)
        .post("/api/auth/register")
        .set("X-Forwarded-Proto", "https")
        .send({
            name: "Production User",
            email: "production@example.com",
            password: "secure-production-password"
        })
        .expect(201);
    const cookie = response.headers["set-cookie"][0];
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /Secure/i);
    assert.match(cookie, /SameSite=Lax/i);
});

test("Express serves allowlisted frontend assets without exposing backend files", async t => {
    const context = createTestApp({
        config: {
            serveFrontend: true,
            frontendDirectory: path.resolve(__dirname, "../..")
        }
    });
    t.after(context.cleanup);

    await request(context.app).get("/").expect(200).expect("Content-Type", /html/);
    await request(context.app).get("/login.html").expect(200).expect(/Log in to Study AI/);
    await request(context.app).get("/js/config.js").expect(200).expect(/window\.location\.origin/);
    await request(context.app).get("/backend/package.json").expect(404);
});

test("production liveness and readiness endpoints are public and safe", async t => {
    const context = createTestApp();
    t.after(context.cleanup);

    await request(context.app).get("/health/live").expect(200, { status: "ok" });
    const ready = await request(context.app).get("/health/ready").expect(200);
    assert.deepEqual(ready.body, {
        status: "ready",
        database: "sqlite",
        storage: "local",
        ai: "configured"
    });
    assert.equal(JSON.stringify(ready.body).includes(context.temporaryDirectory), false);
});
