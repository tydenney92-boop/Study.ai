const test = require("node:test");
const assert = require("node:assert/strict");
const supertest = require("supertest");
const { createTestApp, authenticatedRequest } = require("./helpers/test-app");

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
