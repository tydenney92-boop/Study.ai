const test = require("node:test");
const assert = require("node:assert/strict");
const supertest = require("supertest");
const { createTestApp, authenticatedRequest, insertMaterial } = require("./helpers/test-app");
const {
    allocatePlan,
    examUrgency,
    recommendationScore
} = require("../src/services/daily-plan.service");

const now = new Date("2026-09-10T12:00:00.000Z");

function signalItem(signals) {
    return { signals };
}

function candidate(id, courseId, score, minimum = 5, preferred = 15, maximum = 30) {
    return {
        id, type: "quiz", title: id, score, minimum, preferred, maximum,
        course: { id: courseId, code: `C${courseId}`, name: `Course ${courseId}` },
        reasons: ["Recorded evidence"], action: { label: "Practice Quiz", href: `quiz.html?courseId=${courseId}` }
    };
}

test("an exam tomorrow has substantially more urgency than one in three weeks", () => {
    assert.ok(examUrgency(1) > examUrgency(21));
});

test("quiz weakness raises priority and repeated misses raise it further", () => {
    const baseline = recommendationScore(signalItem({ quizMisses: 0 }), "reviewNext", null, now);
    const oneMiss = recommendationScore(signalItem({ quizMisses: 1 }), "reviewNext", null, now);
    const repeated = recommendationScore(signalItem({ quizMisses: 3 }), "reviewNext", null, now);
    assert.ok(oneMiss > baseline);
    assert.ok(repeated > oneMiss);
});

test("low flashcard mastery raises priority while strong mastery lowers it", () => {
    const low = recommendationScore(signalItem({
        hasFlashcard: true, bestMastery: 1, flashcardIncorrect: 2, flashcardReviews: 3
    }), "reviewNext", null, now);
    const strong = recommendationScore(signalItem({
        hasFlashcard: true, bestMastery: 5, flashcardIncorrect: 0, flashcardReviews: 5,
        lastReviewedAt: "2026-09-10T10:00:00.000Z"
    }), "keepFresh", null, now);
    assert.ok(low > strong);
});

test("explicit exam relevance raises recommendation priority", () => {
    const ordinary = recommendationScore(signalItem({ examScoped: false }), "reviewNext", { days: 7 }, now);
    const explicit = recommendationScore(signalItem({ explicitExam: true }), "reviewNext", { days: 7 }, now);
    assert.ok(explicit > ordinary);
});

test("plans fit 20, 45, and 90 minute budgets without exceeding them", () => {
    const candidates = [
        candidate("a", 1, 100, 15, 20, 30),
        candidate("b", 1, 90, 10, 15, 25),
        candidate("c", 2, 80, 5, 15, 30),
        candidate("d", 2, 70, 10, 20, 30)
    ];
    for (const budget of [20, 45, 90]) {
        const plan = allocatePlan(candidates, budget);
        const allocated = plan.reduce((sum, item) => sum + item.minutes, 0);
        assert.ok(allocated <= budget);
        assert.ok(plan.every(item => item.minutes <= budget));
        assert.ok(plan.every(item => item.minutes % 5 === 0));
        assert.equal(new Set(plan.map(item => item.id)).size, plan.length);
    }
    assert.equal(allocatePlan(candidates, 20).reduce((sum, item) => sum + item.minutes, 0), 20);
    assert.equal(allocatePlan(candidates, 45).reduce((sum, item) => sum + item.minutes, 0), 45);
    assert.equal(allocatePlan(candidates, 90).reduce((sum, item) => sum + item.minutes, 0), 90);
});

test("multi-course allocation balances similarly important work", () => {
    const plan = allocatePlan([
        candidate("course-one-top", 1, 100, 10),
        candidate("course-one-next", 1, 98, 10),
        candidate("course-two", 2, 94, 10)
    ], 30);
    assert.deepEqual(new Set(plan.map(item => item.course.id)), new Set([1, 2]));
});

test("overdue work and unreviewed exam material surface from owned persisted data", async t => {
    const context = createTestApp({ clock: () => now });
    t.after(context.cleanup);
    const materialId = insertMaterial(context.database, {
        originalFilename: "Exam topics.txt",
        extractedText: "Review supply shifts before the exam."
    });
    await authenticatedRequest(context.app).put("/api/courses/1/exam-plan").send({
        examName: "Midterm", examDate: "2026-09-11", unitIds: [],
        materialIds: [materialId], sourceMaterialIds: []
    }).expect(200);
    await authenticatedRequest(context.app).post("/api/courses/1/tasks").send({
        title: "Overdue problem set", type: "assignment", dueAt: "2026-09-09T12:00:00.000Z"
    }).expect(201);

    const response = await authenticatedRequest(context.app).get("/api/daily-plan?minutes=45").expect(200);
    assert.equal(response.body.budgetMinutes, 45);
    assert.ok(response.body.allocatedMinutes <= 45);
    assert.ok(response.body.upcoming.some(item => item.title === "Overdue problem set" && item.overdue));
    assert.ok(response.body.plan.some(item => /Exam topics/i.test(item.title)));
    assert.ok(response.body.plan.some(item => item.reasons.some(reason => /exam scope|Midterm/i.test(reason))));
});

test("new users receive a truthful empty state and plans stay isolated by user", async t => {
    const context = createTestApp({ clock: () => now });
    t.after(context.cleanup);
    const other = supertest.agent(context.app);
    await other.post("/api/auth/register").send({
        name: "Private Student", email: "daily-private@example.com", password: "StrongPass123!"
    }).expect(201);
    const empty = await other.get("/api/daily-plan?minutes=20").expect(200);
    assert.equal(empty.body.plan.length, 0);
    assert.equal(empty.body.onboarding.title, "Add your first course");

    const course = await other.post("/api/courses").send({
        courseName: "Private Biology", courseCode: "BIO 250", semester: "Fall 2026"
    }).expect(201);
    await other.post(`/api/courses/${course.body.id}/tasks`).send({
        title: "Private lab", type: "assignment", dueAt: "2026-09-11T12:00:00.000Z"
    }).expect(201);
    const owner = await other.get("/api/daily-plan?minutes=20").expect(200);
    assert.match(JSON.stringify(owner.body), /Private lab/);
    const seeded = await authenticatedRequest(context.app).get("/api/daily-plan?minutes=20").expect(200);
    assert.doesNotMatch(JSON.stringify(seeded.body), /Private lab|Private Biology/);
});

test("daily-plan API validates budgets and supports deterministic exclusions", async t => {
    const context = createTestApp({ clock: () => now });
    t.after(context.cleanup);
    await authenticatedRequest(context.app).post("/api/courses/1/tasks").send({
        title: "Tomorrow assignment", type: "assignment", dueAt: "2026-09-11T12:00:00.000Z"
    }).expect(201);
    const first = await authenticatedRequest(context.app).get("/api/daily-plan?minutes=20").expect(200);
    assert.ok(first.body.plan.length > 0);
    const excluded = encodeURIComponent(first.body.plan[0].id);
    const refreshed = await authenticatedRequest(context.app).get(`/api/daily-plan?minutes=20&exclude=${excluded}`).expect(200);
    assert.ok(refreshed.body.plan.every(item => item.id !== first.body.plan[0].id));
    await authenticatedRequest(context.app).get("/api/daily-plan?minutes=3").expect(400);
    await authenticatedRequest(context.app).get("/api/daily-plan?timezoneOffset=900").expect(400);
});
