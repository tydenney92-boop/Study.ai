const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { createTestApp } = require("./helpers/test-app");

test("GET /api/test reports that the backend is available", async t => {
    const context = createTestApp();
    t.after(context.cleanup);

    const response = await request(context.app)
        .get("/api/test")
        .expect(200);

    assert.deepEqual(response.body, {
        message: "Study AI backend is working!"
    });
});

test("unknown routes return the standard JSON error envelope", async t => {
    const context = createTestApp();
    t.after(context.cleanup);

    const response = await request(context.app)
        .get("/api/does-not-exist")
        .expect(404);

    assert.deepEqual(response.body, {
        error: {
            code: "ROUTE_NOT_FOUND",
            message: "Route not found."
        }
    });
});
