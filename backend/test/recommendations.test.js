const test = require("node:test");
const assert = require("node:assert/strict");
const supertest = require("supertest");
const {
    createTestApp,
    authenticatedRequest: request,
    insertMaterial
} = require("./helpers/test-app");

function insertQuiz(context, { userId = 1, courseId = 1, materialId, question }) {
    const quizId = Number(context.database.prepare(`
        INSERT INTO generated_quizzes (user_id, course_id, generated_quiz_json)
        VALUES (?, ?, ?)
    `).run(userId, courseId, JSON.stringify({ questions: [{
        question,
        options: ["A", "B", "C", "D"],
        correctAnswer: 1,
        explanation: "Stored explanation"
    }] })).lastInsertRowid);
    if (materialId) context.database.prepare(`
        INSERT INTO quiz_materials (quiz_id, material_id) VALUES (?, ?)
    `).run(quizId, materialId);
    return quizId;
}

function insertAttempt(context, { userId = 1, quizId, correct, score, createdAt = "2026-08-20 10:00:00" }) {
    context.database.prepare(`
        INSERT INTO quiz_attempts (
            user_id, quiz_id, score, answers_json, results_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        userId,
        quizId,
        score,
        JSON.stringify([{ questionNumber: 1, selectedAnswer: correct ? 1 : 0, correctAnswer: 1, correct }]),
        JSON.stringify({ correct: correct ? 1 : 0, total: 1 }),
        createdAt
    );
}

function insertCard(context, { userId = 1, courseId = 1, materialId, front, mastery = 0, correct = 0, incorrect = 0 }) {
    const id = Number(context.database.prepare(`
        INSERT INTO flashcards (
            user_id, course_id, front, back, mastery_level,
            correct_count, incorrect_count, last_reviewed_at
        ) VALUES (?, ?, ?, 'Stored answer', ?, ?, ?, ?)
    `).run(
        userId, courseId, front, mastery, correct, incorrect,
        correct + incorrect ? "2026-08-19 10:00:00" : null
    ).lastInsertRowid);
    if (materialId) context.database.prepare(`
        INSERT INTO flashcard_materials (flashcard_id, material_id) VALUES (?, ?)
    `).run(id, materialId);
    return id;
}

test("recommendations combine quiz weakness, flashcard weakness, and explicit exam evidence", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const materialId = insertMaterial(context.database, {
        originalFilename: "Unit 2 review.txt",
        storedFilename: "unit-2-review.txt",
        extractedText: "Midterm review topics include elasticity, price responsiveness, and tax incidence."
    });
    const quizId = insertQuiz(context, {
        materialId,
        question: "How does elasticity affect tax incidence?"
    });
    insertAttempt(context, { quizId, correct: false, score: 0 });
    insertAttempt(context, { quizId, correct: false, score: 0, createdAt: "2026-08-21 10:00:00" });
    insertCard(context, {
        materialId,
        front: "How does elasticity affect tax incidence?",
        mastery: 1,
        incorrect: 2
    });

    const response = await request(context.app)
        .get("/api/courses/1/recommendations").expect(200);
    assert.equal(response.body.hasExamSpecificEvidence, true);
    assert.deepEqual(response.body.evidenceSummary, {
        quizAttempts: 2,
        flashcards: 1,
        flashcardReviews: 2,
        examRelatedMaterials: 1,
        savedStudyGuides: 0
    });
    const top = response.body.sections.focusFirst[0];
    assert.match(top.topic, /elasticity/i);
    assert.equal(top.confidence, "strong");
    assert.match(top.reason, /2 missed quiz answers/);
    assert.match(top.reason, /2 Still Learning reviews/);
    assert.match(top.reason, /exam or review language/);
    assert.equal(top.action.href, `quiz.html?courseId=1&quizId=${quizId}`);
});

test("strong performance lowers priority and sparse evidence remains honest", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const materialId = insertMaterial(context.database, {
        originalFilename: "Regular notes.txt",
        extractedText: "Opportunity cost is the best alternative forgone."
    });
    const quizId = insertQuiz(context, {
        materialId,
        question: "What is opportunity cost?"
    });
    insertAttempt(context, { quizId, correct: true, score: 100 });
    insertCard(context, {
        materialId,
        front: "What is opportunity cost?",
        mastery: 5,
        correct: 5,
        incorrect: 0
    });

    const response = await request(context.app)
        .get("/api/courses/1/recommendations").expect(200);
    assert.equal(response.body.sections.focusFirst.length, 0);
    assert.equal(response.body.sections.keepFresh.length, 1);
    assert.match(response.body.sections.keepFresh[0].reason, /correct quiz answer/);
    assert.equal(response.body.hasExamSpecificEvidence, false);
});

test("exam relevance requires extracted content and never invents exam topics", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    insertMaterial(context.database, {
        originalFilename: "FINAL EXAM SYLLABUS.txt",
        storedFilename: "misleading-name.txt",
        extractedText: "Ordinary lecture notes about supply and demand."
    });
    const explicitId = insertMaterial(context.database, {
        originalFilename: "Week 8 notes.txt",
        storedFilename: "week-8.txt",
        extractedText: "The study guide says the midterm review will cover market equilibrium."
    });
    const response = await request(context.app)
        .get("/api/courses/1/recommendations").expect(200);
    assert.equal(response.body.evidenceSummary.examRelatedMaterials, 1);
    assert.equal(response.body.sections.reviewNext.length, 1);
    assert.equal(response.body.sections.reviewNext[0].topic, "Review Week 8 notes.txt");
    assert.equal(
        response.body.sections.reviewNext[0].action.href,
        `material.html?courseId=1&materialId=${explicitId}`
    );
    assert.doesNotMatch(JSON.stringify(response.body), /FINAL EXAM SYLLABUS/);
});

test("recommendations provide truthful new-course and no-activity states", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const empty = await request(context.app)
        .get("/api/courses/1/recommendations").expect(200);
    assert.equal(empty.body.isNewCourse, true);
    assert.deepEqual(empty.body.sections, {
        focusFirst: [], reviewNext: [], keepFresh: []
    });

    insertMaterial(context.database, {
        originalFilename: "Lecture.txt",
        extractedText: "A regular lecture about market equilibrium."
    });
    const noActivity = await request(context.app)
        .get("/api/courses/1/recommendations").expect(200);
    assert.equal(noActivity.body.isNewCourse, false);
    assert.equal(noActivity.body.evidenceSummary.quizAttempts, 0);
    assert.deepEqual(noActivity.body.sections.focusFirst, []);
});

test("recommendations are isolated by course and authenticated owner", async t => {
    const context = createTestApp();
    t.after(context.cleanup);
    const other = supertest.agent(context.app);
    const registered = await other.post("/api/auth/register").send({
        name: "Other Student",
        email: "recommend-other@example.com",
        password: "StrongPass123!"
    }).expect(201);
    const course = await other.post("/api/courses").send({
        courseName: "Private Biology", courseCode: "BIO 201", semester: "Fall"
    }).expect(201);
    const materialId = insertMaterial(context.database, {
        courseId: course.body.id,
        unitId: null,
        originalFilename: "Private exam review.txt",
        storedFilename: "private-exam.txt",
        extractedText: "The final exam review covers private cell biology."
    });
    const quizId = insertQuiz(context, {
        userId: registered.body.user.id,
        courseId: course.body.id,
        materialId,
        question: "What private cell topic was missed?"
    });
    insertAttempt(context, {
        userId: registered.body.user.id,
        quizId,
        correct: false,
        score: 0
    });

    await request(context.app)
        .get(`/api/courses/${course.body.id}/recommendations`).expect(404);
    const owner = await other
        .get(`/api/courses/${course.body.id}/recommendations`).expect(200);
    assert.equal(owner.body.sections.focusFirst.length, 1);
    const seeded = await request(context.app)
        .get("/api/courses/1/recommendations").expect(200);
    assert.doesNotMatch(JSON.stringify(seeded.body), /private/i);
});
