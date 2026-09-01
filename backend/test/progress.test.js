const test = require("node:test");
const assert = require("node:assert/strict");
const supertest = require("supertest");
const { createTestApp, authenticatedRequest, insertMaterial } = require("./helpers/test-app");

function insertQuiz(database, userId, courseId) {
    return Number(database.prepare(`
        INSERT INTO generated_quizzes (user_id, course_id, generated_quiz_json)
        VALUES (?, ?, '{"questions":[{"question":"Q"}]}')
    `).run(userId, courseId).lastInsertRowid);
}

function insertAttempt(database, userId, quizId, score, createdAt) {
    database.prepare(`
        INSERT INTO quiz_attempts (user_id, quiz_id, score, answers_json, created_at)
        VALUES (?, ?, ?, '[]', ?)
    `).run(userId, quizId, score, createdAt);
}

test("progress is empty without attempts and calculates persisted results", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const empty = await authenticatedRequest(context.app).get("/api/progress").expect(200);
    assert.equal(empty.body.totalAttempts, 0);
    assert.equal(empty.body.averageScore, null);
    assert.deepEqual(empty.body.recentActivity, []);

    const secondCourseId = Number(context.database.prepare(`
        INSERT INTO courses (user_id, course_name, course_code, semester)
        VALUES (1, 'Statistics', 'STAT 101', 'Fall 2026')
    `).run().lastInsertRowid);
    const firstQuiz = insertQuiz(context.database, 1, 1);
    const secondQuiz = insertQuiz(context.database, 1, secondCourseId);
    insertAttempt(context.database, 1, firstQuiz, 60, "2026-01-01 10:00:00");
    insertAttempt(context.database, 1, firstQuiz, 80, "2026-01-02 10:00:00");
    insertAttempt(context.database, 1, secondQuiz, 100, "2026-01-03 10:00:00");

    const overall = await authenticatedRequest(context.app).get("/api/progress").expect(200);
    assert.equal(overall.body.totalAttempts, 3);
    assert.equal(overall.body.averageScore, 80);
    assert.deepEqual(overall.body.scoreTrend.map(point => point.score), [60, 80, 100]);
    assert.equal(overall.body.courses.find(item => item.courseId === 1).averageScore, 70);

    const course = await authenticatedRequest(context.app)
        .get("/api/courses/1/progress").expect(200);
    assert.equal(course.body.totalAttempts, 2);
    assert.equal(course.body.averageScore, 70);
});

test("progress remains isolated across users and owned courses", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const other = supertest.agent(context.app);
    const registration = await other.post("/api/auth/register").send({
        name: "Progress User", email: "progress-other@example.com", password: "StrongPass123!"
    }).expect(201);
    const course = await other.post("/api/courses").send({
        courseName: "Private", courseCode: "PRIVATE", semester: "Fall 2026"
    }).expect(201);
    const quizId = insertQuiz(context.database, registration.body.user.id, course.body.id);
    insertAttempt(context.database, registration.body.user.id, quizId, 95, "2026-02-01 10:00:00");

    const owner = await other.get("/api/progress").expect(200);
    assert.equal(owner.body.totalAttempts, 1);
    const seeded = await authenticatedRequest(context.app).get("/api/progress").expect(200);
    assert.equal(seeded.body.totalAttempts, 0);
    await authenticatedRequest(context.app)
        .get(`/api/courses/${course.body.id}/progress`).expect(404);
});

test("course progress reports unit, material, flashcard, trend, and honest coverage data", async t => {
    const context = createTestApp(); t.after(context.cleanup);
    const studiedId = insertMaterial(context.database, {
        unitId: 1, originalFilename: "elasticity.txt",
        storedFilename: "elasticity.txt",
        extractedText: "Elasticity measures responsiveness."
    });
    const untouchedId = insertMaterial(context.database, {
        unitId: 2, originalFilename: "unstudied.txt",
        storedFilename: "unstudied.txt",
        extractedText: "Comparative advantage uses opportunity costs."
    });
    const quizId = insertQuiz(context.database, 1, 1);
    context.database.prepare("INSERT INTO quiz_materials (quiz_id, material_id) VALUES (?, ?)").run(quizId, studiedId);
    insertAttempt(context.database, 1, quizId, 40, "2026-01-01 10:00:00");
    insertAttempt(context.database, 1, quizId, 55, "2026-01-02 10:00:00");
    insertAttempt(context.database, 1, quizId, 80, "2026-01-03 10:00:00");
    const cardId = Number(context.database.prepare(`
        INSERT INTO flashcards (
            user_id, course_id, front, back, mastery_level,
            correct_count, incorrect_count, last_reviewed_at
        ) VALUES (1, 1, 'Elasticity?', 'Responsiveness', 1, 0, 2, '2026-01-04 10:00:00')
    `).run().lastInsertRowid);
    context.database.prepare("INSERT INTO flashcard_materials VALUES (?, ?)").run(cardId, studiedId);

    const response = await authenticatedRequest(context.app).get("/api/courses/1/progress").expect(200);
    assert.equal(response.body.summary.attemptCount, 3);
    assert.equal(response.body.summary.latestScore, 80);
    assert.equal(response.body.summary.trend.direction, "improving");
    assert.equal(response.body.flashcards.lowMastery, 1);
    const unit = response.body.units.find(item => item.id === 1);
    assert.equal(unit.quizAverage, 58.3);
    assert.equal(unit.lowMasteryFlashcards, 1);
    assert.equal(unit.materials[0].coverage, "needs_review");
    assert.equal(response.body.units.find(item => item.id === 2).materials[0].coverage, "not_studied");
    assert.match(response.body.insights.join(" "), /improving/i);
    assert.match(response.body.insights.join(" "), /not used unstudied\.txt/i);
    assert.match(response.body.attributionNote, /source materials/);
    assert.equal(response.body.units.flatMap(item => item.materials).some(item => item.id === untouchedId), true);

    const overall = await authenticatedRequest(context.app).get("/api/progress").expect(200);
    const card = overall.body.courses.find(item => item.courseId === 1);
    assert.equal(card.attemptCount, 3);
    assert.equal(card.averageScore, 58.3);
    assert.equal(card.latestScore, 80);
    assert.equal(card.trend.direction, "improving");
    assert.equal(card.flashcardsReviewed, 1);
    assert.equal(card.lowMasteryFlashcards, 1);
    assert.equal(card.studiedMaterialCount, 1);
    assert.equal(card.materialCount, 2);
});
