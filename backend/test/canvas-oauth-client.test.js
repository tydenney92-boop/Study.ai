const test = require("node:test");
const assert = require("node:assert/strict");
const { createCanvasOAuthClient } = require("../src/services/lms/canvas-oauth-client");

test("Canvas OAuth client exchanges and refreshes with the official server-side grants", async () => {
    const calls = [];
    const now = Date.parse("2026-09-10T18:00:00.000Z");
    const client = createCanvasOAuthClient({
        baseUrl: "https://school.instructure.com",
        clientId: "client-id",
        clientSecret: "server-secret",
        redirectUri: "https://study.example.com/api/lms/canvas/callback",
        clock: () => now,
        fetchImpl: async (url, options) => {
            calls.push({ url: String(url), method: options.method, authorization: options.headers.Authorization, body: options.body?.toString() });
            if (options.method === "DELETE") return { ok: true, status: 200 };
            const grant = new URLSearchParams(options.body).get("grant_type");
            return {
                ok: true,
                status: 200,
                async json() {
                    return grant === "authorization_code"
                        ? { access_token: "access-1", refresh_token: "refresh-1", expires_in: 3600, user: { id: 7 } }
                        : { access_token: "access-2", expires_in: 1800 };
                }
            };
        }
    });

    const exchanged = await client.exchangeCode("one-time-code");
    assert.deepEqual(exchanged, {
        accessToken: "access-1",
        refreshToken: "refresh-1",
        tokenExpiresAt: "2026-09-10T19:00:00.000Z",
        providerUserId: "7"
    });
    const refreshed = await client.refresh("refresh-1");
    assert.equal(refreshed.accessToken, "access-2");
    assert.equal(refreshed.refreshToken, null);
    assert.equal(refreshed.tokenExpiresAt, "2026-09-10T18:30:00.000Z");
    assert.equal(await client.revoke("access-2"), true);

    assert.equal(new URLSearchParams(calls[0].body).get("code"), "one-time-code");
    assert.equal(new URLSearchParams(calls[0].body).get("redirect_uri"), "https://study.example.com/api/lms/canvas/callback");
    assert.equal(new URLSearchParams(calls[1].body).get("refresh_token"), "refresh-1");
    assert.equal(calls[2].authorization, "Bearer access-2");
    assert.ok(calls.every(call => call.url === "https://school.instructure.com/login/oauth2/token"));
});

test("Canvas OAuth client returns a safe reconnect error without provider response content", async () => {
    const client = createCanvasOAuthClient({
        baseUrl: "https://school.instructure.com",
        clientId: "client-id",
        clientSecret: "server-secret",
        redirectUri: "https://study.example.com/api/lms/canvas/callback",
        fetchImpl: async () => ({ ok: false, status: 400, async json() { return { error_description: "sensitive detail" }; } })
    });
    await assert.rejects(
        () => client.refresh("bad-refresh"),
        error => error.code === "LMS_AUTH_EXPIRED" &&
            error.message === "Canvas connection expired. Reconnect Canvas." &&
            !JSON.stringify(error).includes("sensitive detail")
    );
});
