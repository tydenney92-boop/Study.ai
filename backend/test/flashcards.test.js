const test = require("node:test");
const assert = require("node:assert/strict");
const supertest = require("supertest");
const {
    createTestApp,
    authenticatedRequest: request,
    insertMaterial
} = require("./helpers/test-app");

function generatedCards(count) {
    return {
        flashcards: Array.from({ length: count }, (_, index) => ({
            front: `Concept ${index + 1}?`,
            back: `Explanation ${index + 1}.`
        }))
    };
}

test("manual flashcards can be created, listed, updated, filtered, and deleted", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const created = await request(context.app).post("/api/courses/1/flashcards")
        .send({ front: "What is demand?", back: "Willingness to purchase." })
        .expect(201);
    assert.equal(created.body.masteryLevel, 0);
    assert.equal(created.body.reviewCount, 0);
    assert.deepEqual(created.body.materialIds, []);

    const listed = await request(context.app).get("/api/courses/1/flashcards").expect(200);
    assert.equal(listed.body.length, 1);
    const updated = await request(context.app)
        .patch(`/api/courses/1/flashcards/${created.body.id}`)
        .send({ back: "Ability and willingness to purchase." }).expect(200);
    assert.equal(updated.body.back, "Ability and willingness to purchase.");

    const materialId = insertMaterial(context.database);
    await request(context.app)
        .get(`/api/courses/1/flashcards?materialId=${materialId}`).expect(200, []);
    await request(context.app)
        .delete(`/api/courses/1/flashcards/${created.body.id}`).expect(204);
    await request(context.app).get("/api/courses/1/flashcards").expect(200, []);
});

test("AI generation persists a multi-material batch and relationships transactionally", async t => {
    let calls = 0;
    const context = createTestApp({
        aiClient: { async generate() { calls++; return JSON.stringify(generatedCards(5)); } }
    });
    t.after(context.cleanup);
    const firstId = insertMaterial(context.database);
    const secondId = insertMaterial(context.database, {
        originalFilename: "Second.txt",
        storedFilename: "second.txt",
        extractedText: "A second source."
    });
    const response = await request(context.app)
        .post("/api/courses/1/flashcards/generate")
        .send({ materialIds: [firstId, secondId], cardCount: 5 }).expect(201);
    assert.equal(calls, 1);
    assert.equal(response.body.flashcards.length, 5);
    response.body.flashcards.forEach(card => {
        assert.deepEqual(card.materialIds, [firstId, secondId]);
    });
    assert.equal(context.database.prepare(
        "SELECT COUNT(*) count FROM flashcards"
    ).get().count, 5);
    assert.equal(context.database.prepare(
        "SELECT COUNT(*) count FROM flashcard_materials"
    ).get().count, 10);

    const filtered = await request(context.app)
        .get(`/api/courses/1/flashcards?materialId=${secondId}`).expect(200);
    assert.equal(filtered.body.length, 5);
});

test("invalid/no-text material context and malformed AI output persist nothing", async t => {
    let calls = 0;
    const context = createTestApp({
        aiClient: { async generate() { calls++; return '{"flashcards":[{"front":"","back":"x"}]}'; } }
    });
    t.after(context.cleanup);
    const usableId = insertMaterial(context.database);
    const noTextId = insertMaterial(context.database, {
        storedFilename: "scan.pdf",
        originalFilename: "scan.pdf",
        extractedText: "",
        extractionStatus: "no_text"
    });

    const noText = await request(context.app)
        .post("/api/courses/1/flashcards/generate")
        .send({ materialIds: [noTextId], cardCount: 5 }).expect(422);
    assert.equal(noText.body.error.code, "MATERIAL_HAS_NO_TEXT");
    assert.equal(calls, 0);

    await request(context.app)
        .post("/api/courses/1/flashcards/generate")
        .send({ materialIds: [99999], cardCount: 5 }).expect(404);
    assert.equal(calls, 0);

    const malformed = await request(context.app)
        .post("/api/courses/1/flashcards/generate")
        .send({ materialIds: [usableId], cardCount: 5 }).expect(502);
    assert.equal(malformed.body.error.code, "AI_OUTPUT_INVALID");
    assert.equal(calls, 1);
    assert.equal(context.database.prepare("SELECT COUNT(*) count FROM flashcards").get().count, 0);
    assert.equal(context.database.prepare("SELECT COUNT(*) count FROM flashcard_materials").get().count, 0);
});

test("Know It and Still Learning persist deterministic mastery and counts", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const created = await request(context.app).post("/api/courses/1/flashcards")
        .send({ front: "Front", back: "Back" }).expect(201);
    const known = await request(context.app)
        .post(`/api/courses/1/flashcards/${created.body.id}/reviews`)
        .send({ outcome: "know_it" }).expect(201);
    assert.equal(known.body.masteryLevel, 1);
    assert.equal(known.body.correctCount, 1);
    assert.equal(known.body.reviewCount, 1);
    assert.ok(known.body.lastReviewedAt);

    const learning = await request(context.app)
        .post(`/api/courses/1/flashcards/${created.body.id}/reviews`)
        .send({ outcome: "still_learning" }).expect(201);
    assert.equal(learning.body.masteryLevel, 0);
    assert.equal(learning.body.incorrectCount, 1);
    assert.equal(learning.body.reviewCount, 2);
});

test("review ordering prioritizes unseen, lower mastery, then older review", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const insert = context.database.prepare(`
        INSERT INTO flashcards (
            user_id, course_id, front, back, mastery_level,
            correct_count, incorrect_count, last_reviewed_at
        ) VALUES (1, 1, ?, 'Back', ?, ?, ?, ?)
    `);
    insert.run("Recent mastered", 4, 4, 0, "2026-08-18 10:00:00");
    insert.run("Unseen", 0, 0, 0, null);
    insert.run("Older low mastery", 1, 1, 1, "2026-08-16 10:00:00");
    insert.run("Recent low mastery", 1, 1, 1, "2026-08-17 10:00:00");

    const cards = await request(context.app).get("/api/courses/1/flashcards").expect(200);
    assert.deepEqual(cards.body.map(card => card.front), [
        "Unseen", "Older low mastery", "Recent low mastery", "Recent mastered"
    ]);
});

test("flashcards remain isolated across users and courses", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const own = await request(context.app).post("/api/courses/1/flashcards")
        .send({ front: "Private", back: "Private answer" }).expect(201);
    const other = supertest.agent(context.app);
    await other.post("/api/auth/register").send({
        name: "Other", email: "flashcard-other@example.com", password: "StrongPass123!"
    }).expect(201);
    const otherCourse = await other.post("/api/courses").send({
        courseName: "Other Course", courseCode: "OTHER", semester: "Fall 2026"
    }).expect(201);

    await other.get("/api/courses/1/flashcards").expect(404);
    await other.delete(`/api/courses/1/flashcards/${own.body.id}`).expect(404);
    await request(context.app)
        .get(`/api/courses/${otherCourse.body.id}/flashcards`).expect(404);
    assert.equal(context.database.prepare(
        "SELECT COUNT(*) count FROM flashcards WHERE id = ?"
    ).get(own.body.id).count, 1);
});
