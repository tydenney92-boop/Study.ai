const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { createTestApp } = require("./helpers/test-app");

const alice = {
    name: "Alice Student",
    email: "alice@example.com",
    password: "correct-horse-42"
};

async function register(agent, user) {
    return agent.post("/api/auth/register").send(user).expect(201);
}

test("registration hashes passwords and creates an authenticated session", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const agent = request.agent(context.app);

    const response = await register(agent, alice);
    assert.equal(response.body.user.email, alice.email);
    assert.equal(response.body.user.passwordHash, undefined);

    const stored = context.database.prepare(`
        SELECT password_hash AS passwordHash FROM users WHERE email = ?
    `).get(alice.email);
    assert.notEqual(stored.passwordHash, alice.password);
    assert.match(stored.passwordHash, /^\$2[aby]\$/);

    const me = await agent.get("/api/auth/me").expect(200);
    assert.equal(me.body.user.name, alice.name);
});

test("login accepts valid credentials, rejects invalid passwords, and persists", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    await register(request.agent(context.app), alice);

    await request(context.app).post("/api/auth/login").send({
        email: alice.email,
        password: "definitely-wrong"
    }).expect(401).expect(response => {
        assert.equal(response.body.error.code, "INVALID_CREDENTIALS");
    });

    const agent = request.agent(context.app);
    await agent.post("/api/auth/login").send({
        email: alice.email.toUpperCase(),
        password: alice.password
    }).expect(200);
    await agent.get("/api/auth/me").expect(200);
    await agent.post("/api/courses").send({
        courseName: "Biology",
        courseCode: "BIO 101",
        semester: "Fall"
    }).expect(201);
    assert.ok(context.database.prepare("SELECT COUNT(*) AS count FROM sessions").get().count > 0);
});

test("duplicate emails are rejected case-insensitively", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    await register(request.agent(context.app), alice);

    const response = await request(context.app).post("/api/auth/register").send({
        ...alice,
        email: "ALICE@EXAMPLE.COM"
    }).expect(409);
    assert.equal(response.body.error.code, "EMAIL_ALREADY_REGISTERED");
});

test("logout destroys the session and protected APIs require authentication", async t => {
    const context = createTestApp();
    t.after(context.cleanup);

    await request(context.app).get("/api/courses").expect(401).expect(response => {
        assert.equal(response.body.error.code, "AUTHENTICATION_REQUIRED");
    });

    const agent = request.agent(context.app);
    await register(agent, alice);
    await agent.post("/api/auth/logout").expect(204);
    await agent.get("/api/auth/me").expect(401);
    await agent.get("/api/courses").expect(401);
});

test("authenticated users can create courses and cannot access another user's data", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const agentA = request.agent(context.app);
    const agentB = request.agent(context.app);
    const aliceResponse = await register(agentA, alice);
    const bobResponse = await register(agentB, {
        name: "Bob Student",
        email: "bob@example.com",
        password: "another-secure-42"
    });

    const course = await agentA.post("/api/courses").send({
        courseName: "Private Biology",
        courseCode: "BIO 240",
        semester: "Spring"
    }).expect(201);
    assert.equal(course.body.userId, aliceResponse.body.user.id);

    const material = await agentA
        .post(`/api/courses/${course.body.id}/materials`)
        .attach("file", Buffer.from("Private notes"), "private.txt")
        .expect(201);

    const quizResult = context.database.prepare(`
        INSERT INTO generated_quizzes (user_id, course_id, generated_quiz_json)
        VALUES (?, ?, ?)
    `).run(aliceResponse.body.user.id, course.body.id, JSON.stringify({ questions: [] }));
    const quizId = Number(quizResult.lastInsertRowid);

    await agentB.get(`/api/courses/${course.body.id}`).expect(404);
    await agentB.get(`/api/courses/${course.body.id}/materials/${material.body.id}`).expect(404);
    await agentB.get(`/api/quizzes/${quizId}/attempts`).expect(404);
    await agentB.post(`/api/quizzes/${quizId}/attempts`).send({
        score: 100,
        answers: [],
        results: {}
    }).expect(404);

    const bobCourses = await agentB.get("/api/courses").expect(200);
    assert.deepEqual(bobCourses.body, []);
    assert.notEqual(aliceResponse.body.user.id, bobResponse.body.user.id);
});
