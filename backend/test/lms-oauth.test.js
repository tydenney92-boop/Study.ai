const test = require("node:test");
const assert = require("node:assert/strict");
const { createTestApp, authenticatedRequest } = require("./helpers/test-app");
const { OAUTH_STATE_TTL_MS } = require("../src/routes/lms.routes");
const { createCredentialVault } = require("../src/services/credential-vault");

const encryptionKey = "canvas-oauth-test-encryption-key-12345";

function canvasConfig() {
    return {
        environment: "test",
        canvasClientId: "client-id",
        canvasClientSecret: "client-secret",
        canvasBaseUrl: "https://school.instructure.com",
        canvasRedirectUri: "http://localhost:8080/api/lms/canvas/callback",
        lmsEncryptionKey: encryptionKey
    };
}

test("OAuth connect and callback use session-scoped state and encrypted server-side tokens", async t => {
    const calls = [];
    const context = createTestApp({
        config: canvasConfig(),
        canvasOAuthClient: {
            async exchangeCode(code) {
                calls.push(code);
                return {
                    accessToken: "access-secret",
                    refreshToken: "refresh-secret",
                    tokenExpiresAt: "2026-09-10T20:00:00.000Z",
                    providerUserId: "canvas-user-7"
                };
            },
            async revoke() { return true; }
        }
    });
    t.after(context.cleanup);
    const client = authenticatedRequest(context.app);

    const connect = await client.get("/api/lms/canvas/connect").expect(302);
    const authorization = new URL(connect.headers.location);
    assert.equal(authorization.origin, "https://school.instructure.com");
    assert.equal(authorization.pathname, "/login/oauth2/auth");
    assert.equal(authorization.searchParams.get("client_id"), "client-id");
    assert.equal(authorization.searchParams.get("response_type"), "code");
    assert.equal(authorization.searchParams.get("redirect_uri"), canvasConfig().canvasRedirectUri);
    const state = authorization.searchParams.get("state");
    assert.match(state, /^[a-f0-9]{48}$/);

    await client.get(`/api/lms/canvas/callback?code=one-time-code&state=${state}`)
        .expect(302)
        .expect("Location", "/planner.html?lms=connected");
    assert.deepEqual(calls, ["one-time-code"]);

    const saved = context.database.prepare("SELECT * FROM lms_connections").get();
    assert.notEqual(saved.access_token_encrypted, "access-secret");
    assert.notEqual(saved.refresh_token_encrypted, "refresh-secret");
    assert.equal(createCredentialVault(encryptionKey).decrypt(saved.access_token_encrypted), "access-secret");
    const publicState = await client.get("/api/lms").expect(200);
    assert.equal(JSON.stringify(publicState.body).includes("secret"), false);

    await client.get(`/api/lms/canvas/callback?code=replay&state=${state}`).expect(400);
    assert.deepEqual(calls, ["one-time-code"]);
});

test("OAuth state rejects mismatches and expires after ten minutes", async t => {
    let now = Date.parse("2026-09-10T18:00:00.000Z");
    let exchanges = 0;
    const context = createTestApp({
        config: canvasConfig(),
        lmsClock: () => now,
        canvasOAuthClient: {
            async exchangeCode() { exchanges += 1; return {}; },
            async revoke() { return true; }
        }
    });
    t.after(context.cleanup);
    const client = authenticatedRequest(context.app);

    const first = await client.get("/api/lms/canvas/connect").expect(302);
    const firstState = new URL(first.headers.location).searchParams.get("state");
    await client.get(`/api/lms/canvas/callback?code=code&state=${firstState}x`).expect(400);

    const second = await client.get("/api/lms/canvas/connect").expect(302);
    const secondState = new URL(second.headers.location).searchParams.get("state");
    now += OAUTH_STATE_TTL_MS + 1;
    await client.get(`/api/lms/canvas/callback?code=code&state=${secondState}`).expect(400);
    assert.equal(exchanges, 0);
});

test("a verified Canvas denial returns to the existing Planner management UI", async t => {
    const context = createTestApp({
        config: canvasConfig(),
        canvasOAuthClient: { async exchangeCode() { throw new Error("not called"); }, async revoke() { return true; } }
    });
    t.after(context.cleanup);
    const client = authenticatedRequest(context.app);
    const connect = await client.get("/api/lms/canvas/connect").expect(302);
    const state = new URL(connect.headers.location).searchParams.get("state");
    await client.get(`/api/lms/canvas/callback?error=access_denied&state=${state}`)
        .expect(302)
        .expect("Location", "/planner.html?lms=denied");
});

test("incomplete Canvas configuration stays unavailable without breaking LMS status", async t => {
    const context = createTestApp({ config: { environment: "test" } });
    t.after(context.cleanup);
    const client = authenticatedRequest(context.app);
    const status = await client.get("/api/lms").expect(200);
    assert.equal(status.body.canvasConfigured, false);
    await client.get("/api/lms/canvas/connect").expect(503);
});
