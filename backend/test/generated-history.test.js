const test = require("node:test");
const assert = require("node:assert/strict");
const supertest = require("supertest");
const { createTestApp, authenticatedRequest, insertMaterial } = require("./helpers/test-app");

const guideText = [
    "KEY CONCEPTS\nSupply", "DEFINITIONS\nDemand", "FORMULAS\nNone",
    "COMMON MISTAKES\nConfusion", "EXAM QUESTIONS\nWhat shifts demand?",
    "ADDITIONAL TIPS\nReview"
].join("\n");

function quiz() {
    return { questions: Array.from({ length: 5 }, (_, index) => ({
        question: `Question ${index + 1}?`,
        options: ["A", "B", "C", "D"],
        correctAnswer: index % 4,
        explanation: "Because the notes say so."
    })) };
}

function queuedAi(values, counter) {
    return { async generate() { counter.calls++; return values.shift(); } };
}

test("saved guides list, reopen without AI, retain source names, and delete", async t => {
    const counter = { calls: 0 };
    const context = createTestApp({ aiClient: queuedAi([guideText], counter) });
    t.after(context.cleanup);
    const materialId = insertMaterial(context.database, { originalFilename: "Demand notes.txt" });
    const created = await authenticatedRequest(context.app)
        .post("/api/courses/1/study-guides")
        .send({ materialIds: [materialId] }).expect(201);

    const listed = await authenticatedRequest(context.app)
        .get("/api/courses/1/study-guides").expect(200);
    assert.equal(listed.body.length, 1);
    assert.equal(listed.body[0].sources[0].materialName, "Demand notes.txt");

    await authenticatedRequest(context.app)
        .delete(`/api/courses/1/materials/${materialId}`).expect(204);
    const reopened = await authenticatedRequest(context.app)
        .get(`/api/courses/1/study-guides/${created.body.id}`).expect(200);
    assert.equal(reopened.body.generatedContent, guideText);
    assert.deepEqual(reopened.body.sources, [{ materialId: null, materialName: "Demand notes.txt" }]);
    assert.equal(counter.calls, 1);

    await authenticatedRequest(context.app)
        .delete(`/api/courses/1/study-guides/${created.body.id}`).expect(204);
    assert.equal(context.database.prepare("SELECT COUNT(*) count FROM study_guide_sources").get().count, 0);
});

test("saved quizzes list/detail, retake, and transactional cascade deletion", async t => {
    const counter = { calls: 0 };
    const generatedQuiz = quiz();
    const context = createTestApp({
        aiClient: queuedAi([JSON.stringify(generatedQuiz), JSON.stringify({ valid: true, issues: [] })], counter)
    });
    t.after(context.cleanup);
    const materialId = insertMaterial(context.database);
    const created = await authenticatedRequest(context.app)
        .post("/api/courses/1/quizzes")
        .send({ materialIds: [materialId], questionCount: 5 }).expect(201);

    const before = context.database.prepare("SELECT COUNT(*) count FROM generated_quizzes").get().count;
    await authenticatedRequest(context.app)
        .get(`/api/courses/1/quizzes/${created.body.id}`).expect(200);
    await authenticatedRequest(context.app)
        .post(`/api/quizzes/${created.body.id}/attempts`)
        .send({ score: 80, answers: [0, 1, 2, 3, 0], results: { correct: 4, total: 5 } })
        .expect(201);
    const detail = await authenticatedRequest(context.app)
        .get(`/api/courses/1/quizzes/${created.body.id}`).expect(200);
    assert.equal(detail.body.attempts.length, 1);
    assert.equal(context.database.prepare("SELECT COUNT(*) count FROM generated_quizzes").get().count, before);
    assert.equal(counter.calls, 2);

    await authenticatedRequest(context.app)
        .delete(`/api/courses/1/quizzes/${created.body.id}`).expect(204);
    assert.equal(context.database.prepare("SELECT COUNT(*) count FROM quiz_attempts").get().count, 0);
    assert.equal(context.database.prepare("SELECT COUNT(*) count FROM quiz_sources").get().count, 0);
});

test("generated-content history is isolated by user and course", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const other = supertest.agent(context.app);
    await other.post("/api/auth/register").send({
        name: "Other Student", email: "history-other@example.com", password: "StrongPass123!"
    }).expect(201);
    const course = await other.post("/api/courses").send({
        courseName: "Private", courseCode: "PRIVATE", semester: "Fall 2026"
    }).expect(201);
    const quizId = Number(context.database.prepare(`
        INSERT INTO generated_quizzes (user_id, course_id, generated_quiz_json)
        VALUES (?, ?, ?)
    `).run(course.body.userId, course.body.id, JSON.stringify(quiz())).lastInsertRowid);

    await authenticatedRequest(context.app)
        .get(`/api/courses/${course.body.id}/quizzes/${quizId}`).expect(404);
    await authenticatedRequest(context.app)
        .delete(`/api/courses/${course.body.id}/quizzes/${quizId}`).expect(404);
    await other.get("/api/courses/1/study-guides").expect(404);
});
