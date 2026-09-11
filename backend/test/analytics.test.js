const test = require("node:test");
const assert = require("node:assert/strict");
const supertest = require("supertest");
const {
    authenticatedRequest: request,
    createTestApp,
    insertMaterial
} = require("./helpers/test-app");

function eventRows(database, userId = 1) {
    return database.prepare(`
        SELECT event_name AS eventName, course_id AS courseId,
               entity_type AS entityType, entity_id AS entityId,
               metadata_json AS metadataJson
        FROM analytics_events WHERE user_id = ? ORDER BY id
    `).all(userId).map(row => ({ ...row, metadata: JSON.parse(row.metadataJson) }));
}

function validQuiz(questionCount = 5) {
    return {
        questions: Array.from({ length: questionCount }, (_, index) => ({
            question: `Question ${index + 1}?`,
            options: ["A", "B", "C", "D"],
            correctAnswer: index % 4,
            explanation: `Explanation ${index + 1}`
        }))
    };
}

test("client analytics records only allowlisted bounded events", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    await request(context.app).post("/api/analytics/events").send({
        eventName: "planner_opened",
        courseId: 1,
        viewportClass: "desktop"
    }).expect(202);

    const rows = eventRows(context.database);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].eventName, "planner_opened");
    assert.deepEqual(rows[0].metadata, { viewportClass: "desktop" });

    const otherUserId = Number(context.database.prepare(`
        INSERT INTO users (name, email) VALUES ('Other', 'other-analytics@example.test')
    `).run().lastInsertRowid);
    const otherCourseId = Number(context.database.prepare(`
        INSERT INTO courses (user_id, course_name, course_code, semester)
        VALUES (?, 'Private Course', 'PRIVATE 1', 'Fall 2026')
    `).run(otherUserId).lastInsertRowid);
    await request(context.app).post("/api/analytics/events").send({
        eventName: "recommendations_opened",
        courseId: otherCourseId,
        viewportClass: "desktop"
    }).expect(404);

    await request(context.app).post("/api/analytics/events").send({
        eventName: "uploaded_document_text",
        viewportClass: "desktop"
    }).expect(400);
    await request(context.app).post("/api/analytics/events").send({
        eventName: "today_opened",
        viewportClass: "desktop",
        metadata: { documentText: "private notes" }
    }).expect(400);
    await request(context.app).post("/api/analytics/events").send({
        eventName: "today_opened",
        viewportClass: "desktop",
        message: "private chat content"
    }).expect(400);
    assert.equal(eventRows(context.database).length, 1);
});

test("analytics failures never fail the successful course action", async t => {
    const safeErrors = [];
    const context = createTestApp({
        analyticsOutput: { error(value) { safeErrors.push(value); } },
        extendRepositories(defaults) {
            return {
                analytics: {
                    ...defaults.analytics,
                    create() { throw new Error("deterministic analytics failure"); }
                }
            };
        }
    });
    t.after(context.cleanup);
    const response = await request(context.app).post("/api/courses").send({
        courseName: "Analytics Resilience",
        courseCode: "SAFE 101",
        semester: "Fall 2026"
    }).expect(201);
    assert.equal(response.body.courseCode, "SAFE 101");
    assert.equal(safeErrors.length, 2);
    assert.ok(safeErrors.every(value => !value.includes("deterministic analytics failure")));
});

test("Today page and generated plan events stay content-free", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    await request(context.app).post("/api/analytics/events").send({
        eventName: "today_opened",
        viewportClass: "mobile"
    }).expect(202);
    await request(context.app).get("/api/daily-plan?minutes=45&timezoneOffset=360").expect(200);
    const rows = eventRows(context.database);
    assert.deepEqual(rows.find(row => row.eventName === "today_opened").metadata, {
        viewportClass: "mobile"
    });
    assert.deepEqual(rows.find(row => row.eventName === "plan_generated").metadata, {
        itemCount: 0,
        minutes: 45
    });
});

test("onboarding and Planner milestones are server-owned and de-duplicated", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    await request(context.app).patch("/api/onboarding").send({ action: "dismiss_welcome" }).expect(200);
    await request(context.app).patch("/api/onboarding").send({ action: "dismiss_welcome" }).expect(200);
    await request(context.app).patch("/api/onboarding").send({ action: "skip" }).expect(200);
    const task = await request(context.app).post("/api/courses/1/tasks").send({
        title: "Problem set",
        type: "assignment",
        dueAt: "2026-10-10T23:59:00.000Z",
        description: "This description must not enter analytics."
    }).expect(201);
    await request(context.app).patch(`/api/courses/1/tasks/${task.body.id}`).send({ completed: true }).expect(200);
    await request(context.app).patch(`/api/courses/1/tasks/${task.body.id}`).send({ completed: true }).expect(200);

    const rows = eventRows(context.database);
    assert.equal(rows.filter(row => row.eventName === "onboarding_started").length, 1);
    assert.equal(rows.filter(row => row.eventName === "onboarding_skipped").length, 1);
    assert.equal(rows.filter(row => row.eventName === "task_created").length, 1);
    assert.equal(rows.filter(row => row.eventName === "task_completed").length, 1);
    assert.ok(rows.every(row => !row.metadataJson.includes("description")));
    assert.deepEqual(rows.find(row => row.eventName === "task_created").metadata, {
        source: "manual",
        taskType: "assignment"
    });
});

test("quiz generation and completion record abstract milestones without answers", async t => {
    const quiz = validQuiz();
    const responses = [JSON.stringify(quiz), JSON.stringify({ valid: true, issues: [] })];
    const context = createTestApp({
        aiClient: { async generate() { return responses.shift(); } }
    });
    t.after(context.cleanup);
    const materialId = insertMaterial(context.database);
    const generated = await request(context.app).post("/api/courses/1/quizzes").send({
        materialIds: [materialId],
        questionCount: 5
    }).expect(201);
    await request(context.app).post(`/api/quizzes/${generated.body.id}/attempts`).send({
        score: 84,
        answers: [0, 1, 2, 3, 0],
        results: { correct: [true, true, true, true, false] }
    }).expect(201);

    const rows = eventRows(context.database);
    assert.deepEqual(rows.find(row => row.eventName === "quiz_generated").metadata, { questionCount: 5 });
    assert.deepEqual(rows.find(row => row.eventName === "quiz_completed").metadata, { scoreBand: "80_89" });
    const serialized = rows.map(row => row.metadataJson).join(" ");
    assert.doesNotMatch(serialized, /correctAnswer|answers|Question 1/);
});

test("flashcard reviews store only the bounded product outcome", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const card = await request(context.app)
        .post("/api/courses/1/flashcards")
        .send({ front: "Private front", back: "Private back" })
        .expect(201);

    await request(context.app)
        .post(`/api/courses/1/flashcards/${card.body.id}/reviews`)
        .send({ outcome: "know_it" })
        .expect(201);

    const event = eventRows(context.database)
        .find(row => row.eventName === "flashcards_reviewed");
    assert.deepEqual(event.metadata, { outcome: "know_it" });
    assert.doesNotMatch(JSON.stringify(event), /Private front|Private back/);
});

test("feedback is bounded, separate, de-identified in aggregates, and user scoped on write", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const response = await request(context.app).post("/api/feedback").send({
        category: "confusing",
        message: "I could not tell which deadline to import.",
        pageName: "course.html",
        viewportClass: "mobile"
    }).expect(201);
    assert.equal(response.body.category, "confusing");
    await request(context.app).post("/api/feedback").send({
        category: "bug",
        message: "A".repeat(2001),
        pageName: "planner.html",
        viewportClass: "desktop"
    }).expect(400);
    await request(context.app).post("/api/feedback").send({
        category: "bug",
        message: "A bug",
        pageName: "planner.html",
        viewportClass: "desktop",
        uploadedText: "sensitive"
    }).expect(400);

    const stored = context.database.prepare(`SELECT * FROM product_feedback`).get();
    assert.equal(stored.user_id, 1);
    assert.equal(stored.route, "/course.html");
    assert.equal(stored.viewport_class, "mobile");
    assert.equal(stored.message, "I could not tell which deadline to import.");
});

test("internal analytics is off by default and development-only when enabled", async t => {
    const disabled = createTestApp();
    t.after(disabled.cleanup);
    await request(disabled.app).get("/api/internal/analytics").expect(404);

    const disabledFrontend = createTestApp({ config: { serveFrontend: true } });
    t.after(disabledFrontend.cleanup);
    await request(disabledFrontend.app).get("/internal-analytics.html").expect(404);

    const enabled = createTestApp({
        config: { internalAnalyticsEnabled: true, serveFrontend: true }
    });
    t.after(enabled.cleanup);
    const response = await request(enabled.app).get("/api/internal/analytics").expect(200);
    assert.equal(response.body.users.total >= 1, true);
    assert.ok(response.body.adoption.course);
    assert.ok(response.body.feedback);
    await request(enabled.app).get("/internal-analytics.html").expect(200)
        .expect(/Product Analytics/);
    await supertest(enabled.app).get("/internal-analytics.html").expect(401);

    const production = createTestApp({
        config: { internalAnalyticsEnabled: true, environment: "production" }
    });
    t.after(production.cleanup);
    await request(production.app).get("/api/internal/analytics").expect(404);
});

test("signup analytics uses the new user id and never stores email", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const agent = supertest.agent(context.app);
    const registration = await agent.post("/api/auth/register").send({
        name: "Analytics Student",
        email: "analytics-student@example.test",
        password: "StrongPassword123!"
    }).expect(201);
    const row = context.database.prepare(`
        SELECT user_id AS userId, event_name AS eventName, metadata_json AS metadataJson
        FROM analytics_events WHERE user_id = ?
    `).get(registration.body.user.id);
    assert.equal(row.eventName, "signup");
    assert.equal(row.metadataJson, "{}");
    assert.doesNotMatch(JSON.stringify(row), /analytics-student@example\.test/);
});
